"use client";
import React, { useRef, useEffect, useState, useCallback } from "react";
import { v4 } from "uuid";
import LoaderSpinSmall from "@/components/LoaderSpinSmall";
import { useToast } from "@/hooks/use-toast";
import CloseIcon from "@/components/icons/CloseIcon";
import ItsCode from "@/components/ItsCode";

// --- Types ---

interface DocOperation {
  type: "replace" | "insert_after" | "delete";
  index: number;
  item?: { style: string; text: string };
  items?: { style: string; text: string }[];
}

function applyOperations(
  currentItems: DocItem[],
  operations: DocOperation[],
): DocItem[] {
  const deletes = new Set<number>();
  const replaces = new Map<number, { style: string; text: string }>();
  const inserts = new Map<number, { style: string; text: string }[]>();

  for (const op of operations) {
    if (op.type === "delete" && typeof op.index === "number")
      deletes.add(op.index);
    if (op.type === "replace" && typeof op.index === "number" && op.item)
      replaces.set(op.index, op.item);
    if (
      op.type === "insert_after" &&
      typeof op.index === "number" &&
      op.items
    ) {
      const existing = inserts.get(op.index) || [];
      inserts.set(op.index, [...existing, ...op.items]);
    }
  }

  const result: DocItem[] = [];

  const beforeAll = inserts.get(-1);
  if (beforeAll) {
    for (const item of beforeAll)
      result.push({ uid: v4(), style: item.style, text: item.text });
  }

  for (let i = 0; i < currentItems.length; i++) {
    if (deletes.has(i)) {
      const afterDeleted = inserts.get(i);
      if (afterDeleted)
        for (const item of afterDeleted)
          result.push({ uid: v4(), style: item.style, text: item.text });
      continue;
    }

    if (replaces.has(i)) {
      const rep = replaces.get(i)!;
      result.push({ uid: v4(), style: rep.style, text: rep.text });
    } else {
      result.push({ ...currentItems[i] });
    }

    const afterThis = inserts.get(i);
    if (afterThis)
      for (const item of afterThis)
        result.push({ uid: v4(), style: item.style, text: item.text });
  }

  return result;
}

interface FetchedFile {
  path: string;
  content: string;
  error?: string;
}

interface ChatMsg {
  role: "user" | "ai" | "system" | "error";
  text: string;
  failed?: boolean;
}

type Phase =
  | "input" // Entering repo info
  | "fetching" // Fetching tree → selecting files → fetching contents
  | "ready" // Files cached, prompt for AI modification
  | "rate-limited"; // Hit rate limit, wait or cancel

// --- Helpers ---

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Rough token estimate: 1 token ≈ 4 chars
const estimateTokens = (text: string) => Math.ceil(text.length / 4);

// Token limits — Groq free tier is 30k TPM
const MAX_REQUEST_TOKENS = 20000; // Safe limit per request (leaves room for system prompt + response)
const SYSTEM_PROMPT_OVERHEAD = 600; // Estimated system prompt tokens
const CHUNK_DELAY_MS = 6000; // Delay between chunked AI calls

// Split files into chunks that fit within a token budget
const chunkFilesByBudget = (
  files: { path: string; content: string }[],
  tokenBudget: number,
): { path: string; content: string }[][] => {
  const chunks: { path: string; content: string }[][] = [];
  let currentChunk: { path: string; content: string }[] = [];
  let currentTokens = 0;

  for (const file of files) {
    const fileTokens = estimateTokens(`--- ${file.path} ---\n${file.content}`);
    if (fileTokens > tokenBudget) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentTokens = 0;
      }
      chunks.push([file]);
      continue;
    }
    if (currentTokens + fileTokens > tokenBudget && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }
    currentChunk.push(file);
    currentTokens += fileTokens;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
};

// --- Component ---

interface Props {
  projUid: string;
  doc: Doc;
  refetchProjectForDocs: () => void;
  onClose: () => void;
}

const GitHubDocModifyForm = ({
  projUid,
  doc,
  refetchProjectForDocs,
  onClose,
}: Props) => {
  const { toast } = useToast();
  const msgEndRef = useRef<HTMLDivElement>(null);

  // Repo form state
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [ghToken, setGhToken] = useState("");

  // Prompt state
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"add" | "modify">("modify");

  // Process state
  const [phase, setPhase] = useState<Phase>("input");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);

  // Cached fetched files (reused for follow-up prompts)
  const [cachedFiles, setCachedFiles] = useState<FetchedFile[]>([]);

  // Cached repo tree (reused for re-search when AI needs more files)
  const [cachedTree, setCachedTree] = useState<{ path: string }[]>([]);

  // Version history — index 0 is always the original doc items
  const [history, setHistory] = useState<DocItem[][]>([doc.docItems || []]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Rate limit state
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  const [pendingPrompt, setPendingPrompt] = useState("");
  const [pendingMode, setPendingMode] = useState<"add" | "modify">("modify");

  // Retry state
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [lastFailedMode, setLastFailedMode] = useState<"add" | "modify">(
    "modify",
  );

  const currentItems = history[historyIndex];
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Countdown timer for rate limit
  useEffect(() => {
    if (rateLimitCountdown <= 0) return;
    const timer = setInterval(() => {
      setRateLimitCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitCountdown]);

  const addMsg = useCallback(
    (role: ChatMsg["role"], text: string, failed = false) => {
      setMessages((prev) => [...prev, { role, text, failed }]);
    },
    [],
  );

  const handleUndo = () => {
    if (canUndo) setHistoryIndex(historyIndex - 1);
  };
  const handleRedo = () => {
    if (canRedo) setHistoryIndex(historyIndex + 1);
  };

  const handleRetry = () => {
    if (!lastFailedPrompt) return;
    setPrompt(lastFailedPrompt);
    setMode(lastFailedMode);
    setLastFailedPrompt(null);
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.failed) return prev.slice(0, -1);
      return prev;
    });
  };

  // --- Phase 1: Fetch tree → select files → fetch contents ---

  const handleFetchRepo = async () => {
    setLoading(true);
    setError("");
    setPhase("fetching");
    addMsg("user", `Import from ${owner}/${repo} (${branch})`);

    try {
      // Step 1: Fetch tree
      addMsg("system", "Fetching repo file tree...");
      const treeRes = await fetch("/api/github-import/tree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          branch,
          ghToken: ghToken || undefined,
        }),
      });
      const treeData = await treeRes.json();

      if (!treeRes.ok || treeData.githubRateLimited) {
        const msg = treeData.githubRateLimited
          ? "GitHub API rate limit exceeded. Add a GitHub token above to get 5,000 requests/hour instead of 60."
          : treeData.error || "Failed to fetch repo tree";
        setError(msg);
        addMsg("error", msg, true);
        setPhase("input");
        setLoading(false);
        return;
      }

      addMsg("system", `Found ${treeData.totalFiles} files`);
      setCachedTree(treeData.tree);

      // Step 2: AI selects files (using doc content as context)
      addMsg("system", "AI is analyzing which files are relevant...");

      const docContext = (doc.docItems || [])
        .map((item) => item.text)
        .join("\n")
        .substring(0, 2000); // Keep doc context brief

      const selectPrompt = `I have a documentation page titled "${doc.title}" about: ${doc.tagline || doc.desc || ""}. 
Doc content summary: ${docContext}

Find files from this repo that are relevant to this documentation. I want to: ${prompt || "enhance this doc with code from the repo"}`;

      const selectRes = await fetch("/api/github-import/select-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tree: treeData.tree,
          prompt: selectPrompt,
        }),
      });
      const selectData = await selectRes.json();

      if (!selectRes.ok) {
        setError(selectData.error || "AI failed to analyze repo");
        addMsg("error", selectData.error || "AI failed to analyze", true);
        setPhase("input");
        setLoading(false);
        return;
      }

      const allFiles = selectData.docPlans.flatMap(
        (p: { files: string[] }) => p.files,
      );
      const uniqueFiles = [...new Set(allFiles)] as string[];
      addMsg(
        "system",
        `AI selected ${uniqueFiles.length} relevant file(s) across ${selectData.docPlans.length} group(s)`,
      );

      // Step 3: Fetch file contents
      addMsg("system", "Fetching file contents...");
      const fetchRes = await fetch("/api/github-import/fetch-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          branch,
          files: uniqueFiles,
          ghToken: ghToken || undefined,
        }),
      });
      const fetchData = await fetchRes.json();

      if (fetchData.githubRateLimited) {
        const msg =
          "GitHub API rate limit exceeded. Add a GitHub token above to get 5,000 requests/hour instead of 60.";
        setError(msg);
        addMsg("error", msg, true);
        setPhase("input");
        setLoading(false);
        return;
      }

      if (!fetchRes.ok) {
        setError(fetchData.error || "Failed to fetch files");
        addMsg("error", fetchData.error || "Failed to fetch files", true);
        setPhase("input");
        setLoading(false);
        return;
      }

      const goodFiles = (fetchData.files as FetchedFile[]).filter(
        (f) => f.content,
      );
      setCachedFiles(goodFiles);

      const summary = goodFiles.map((f) => f.path).join(", ");
      addMsg(
        "system",
        `Fetched ${goodFiles.length} file(s): ${summary.length > 100 ? summary.substring(0, 100) + "..." : summary}`,
      );

      // Step 4: Check size and inform about chunking if needed
      const fileContentsStr = goodFiles
        .map((f) => `--- ${f.path} ---\n${f.content}`)
        .join("\n\n");
      const docItemsStr = JSON.stringify(currentItems, null, 2);
      const totalTokens = estimateTokens(fileContentsStr + docItemsStr);

      if (totalTokens > MAX_REQUEST_TOKENS) {
        const estimatedChunks = Math.ceil(totalTokens / MAX_REQUEST_TOKENS);
        addMsg(
          "system",
          `Large content (~${totalTokens.toLocaleString()} tokens). Will auto-split into ~${estimatedChunks} chunk(s) with delays.`,
        );
      }

      addMsg(
        "system",
        "Ready! Enter your prompt to modify the doc with code context.",
      );
      setPhase("ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      addMsg("error", msg, true);
      setPhase("input");
    } finally {
      setLoading(false);
    }
  };

  // --- Re-search: ask AI to pick files for a specific topic, fetch only new ones ---

  const searchAndFetchNewFiles = async (
    searchHint: string,
    quiet = false,
  ): Promise<FetchedFile[]> => {
    if (cachedTree.length === 0) {
      if (!quiet) addMsg("system", "No cached tree — cannot re-search.");
      return [];
    }

    addMsg("system", `Searching repo for "${searchHint}"...`);

    // Ask AI which files are relevant to this specific topic
    const selectPrompt = `I need files specifically related to: ${searchHint}
Search the entire repo, especially files that might contain this functionality — look for function definitions, class definitions, hooks, utilities, API routes, and components related to this topic.`;

    try {
      const selectRes = await fetch("/api/github-import/select-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tree: cachedTree,
          prompt: selectPrompt,
        }),
      });
      const selectData = await selectRes.json();

      if (!selectRes.ok) {
        if (!quiet)
          addMsg(
            "system",
            "Re-search failed: " + (selectData.error || "AI error"),
          );
        return [];
      }

      const allFiles = selectData.docPlans.flatMap(
        (p: { files: string[] }) => p.files,
      );
      const uniqueFiles = [...new Set(allFiles)] as string[];

      // Filter out files we already have cached
      const cachedPaths = new Set(cachedFiles.map((f) => f.path));
      const newPaths = uniqueFiles.filter((p) => !cachedPaths.has(p));

      if (newPaths.length === 0) {
        if (!quiet)
          addMsg(
            "system",
            `All relevant files for "${searchHint}" already loaded.`,
          );
        return [];
      }

      addMsg("system", `Found ${newPaths.length} new file(s). Fetching...`);

      // Small delay before GitHub API calls (rate limit safety)
      await delay(1500);

      const fetchRes = await fetch("/api/github-import/fetch-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          branch,
          files: newPaths,
          ghToken: ghToken || undefined,
        }),
      });
      const fetchData = await fetchRes.json();

      if (fetchData.githubRateLimited) {
        addMsg(
          "error",
          "GitHub rate limit hit during re-search. Try adding a GitHub token.",
          true,
        );
        return [];
      }

      if (!fetchRes.ok) {
        addMsg(
          "system",
          "Failed to fetch new files: " + (fetchData.error || "error"),
        );
        return [];
      }

      const newFiles = (fetchData.files as FetchedFile[]).filter(
        (f) => f.content,
      );

      if (newFiles.length > 0) {
        // Merge into cache
        setCachedFiles((prev) => [...prev, ...newFiles]);
        addMsg(
          "system",
          `Added ${newFiles.length} new file(s): ${newFiles.map((f) => f.path).join(", ")}`,
        );
      } else {
        addMsg("system", `Fetched files but none had usable content.`);
      }

      return newFiles;
    } catch (err) {
      addMsg(
        "system",
        "Re-search error: " +
          (err instanceof Error ? err.message : "network error"),
      );
      return [];
    }
  };

  // --- AI modify with cached files (chunked for token limits) ---

  const handleModify = async (
    overridePrompt?: string,
    overrideMode?: "add" | "modify",
    isResearchRetry?: boolean,
  ) => {
    const thePrompt = overridePrompt || prompt.trim();
    const theMode = overrideMode || mode;

    if (!thePrompt) return;

    setLoading(true);
    setError("");
    setLastFailedPrompt(null);

    if (!overridePrompt) {
      addMsg("user", `[${theMode === "add" ? "Add" : "Modify"}] ${thePrompt}`);
      setPrompt("");
    }

    try {
      // --- Targeted file search: find files specifically relevant to this prompt ---
      // On every prompt (not just re-search retries), check if the cached tree
      // has files matching this specific request that we haven't fetched yet
      if (cachedTree.length > 0 && !isResearchRetry) {
        const newFiles = await searchAndFetchNewFiles(thePrompt, true);
        if (newFiles.length > 0) {
          // Small delay after fetching to be rate-limit safe before AI call
          await delay(1000);
        }
      }

      // Use the latest cached files (may have been expanded by search above)
      let filesToUse: FetchedFile[] = [];
      setCachedFiles((prev) => {
        filesToUse = prev;
        return prev;
      });

      // Sort files so ones most relevant to this prompt come first
      // This ensures the important files end up in the first chunk(s)
      const promptLower = thePrompt.toLowerCase();
      const keywords = promptLower
        .split(/[\s,.:;!?()"'`]+/)
        .filter((w) => w.length > 2);
      filesToUse = [...filesToUse].sort((a, b) => {
        const aContent = (a.path + "\n" + a.content).toLowerCase();
        const bContent = (b.path + "\n" + b.content).toLowerCase();
        const aHits = keywords.filter((kw) => aContent.includes(kw)).length;
        const bHits = keywords.filter((kw) => bContent.includes(kw)).length;
        return bHits - aHits; // more hits = sort first
      });

      // Estimate token budget for files
      const docItemsTokens = estimateTokens(
        JSON.stringify(currentItems, null, 2),
      );
      const promptTokens = estimateTokens(thePrompt);
      const fileBudget = Math.max(
        MAX_REQUEST_TOKENS -
          SYSTEM_PROMPT_OVERHEAD -
          docItemsTokens -
          promptTokens,
        2000,
      );

      // Check total file tokens and chunk if needed
      const totalFileTokens = filesToUse.reduce(
        (sum, f) => sum + estimateTokens(`--- ${f.path} ---\n${f.content}`),
        0,
      );

      const chunks =
        totalFileTokens > fileBudget
          ? chunkFilesByBudget(filesToUse, fileBudget)
          : [filesToUse];

      if (chunks.length > 1) {
        addMsg(
          "system",
          `Content too large for single request (~${(totalFileTokens + docItemsTokens).toLocaleString()} tokens). Splitting into ${chunks.length} chunk(s)...`,
        );
      }

      let runningItems = [...currentItems];
      let allNewItems: DocItem[] = [];

      for (let ci = 0; ci < chunks.length; ci++) {
        if (chunks.length > 1) {
          addMsg(
            "system",
            `Processing chunk ${ci + 1}/${chunks.length} (${chunks[ci].map((f) => f.path).join(", ")})...`,
          );
        }

        const chunkPrompt =
          chunks.length > 1
            ? `${thePrompt}\n(This is file batch ${ci + 1} of ${chunks.length}. Only use these specific files.)`
            : thePrompt;

        // Retry loop for this chunk
        let chunkSuccess = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          const res = await fetch("/api/github-import/intel-modify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              existingDocItems: runningItems,
              files: chunks[ci],
              prompt: chunkPrompt,
              mode: theMode,
            }),
          });

          const data = await res.json();

          // Rate limit — auto-wait and retry
          if (res.status === 429 || data.rateLimited) {
            const waitStr = data.retryAfter || "15s";
            const waitSecs = Math.min(Math.ceil(parseFloat(waitStr)), 60);
            if (chunks.length === 1 && attempt === 0) {
              // Single request: show rate-limit UI for user control
              setRateLimitCountdown(waitSecs);
              setPendingPrompt(thePrompt);
              setPendingMode(theMode);
              setPhase("rate-limited");
              addMsg("system", `Rate limited. Wait ~${waitSecs}s or cancel.`);
              setLoading(false);
              return;
            }
            addMsg(
              "system",
              `Rate limited. Waiting ${waitSecs}s before retry...`,
            );
            await delay(waitSecs * 1000);
            continue;
          }

          // Too large — detected by API
          if (data.tooLarge) {
            addMsg(
              "error",
              `Chunk ${ci + 1} too large (${data.requestedTokens?.toLocaleString() || "?"} tokens, limit ${data.limit?.toLocaleString() || "30k"}). Skipping.`,
              true,
            );
            break;
          }

          if (!res.ok || !data.result) {
            if (attempt < 2) {
              addMsg("system", `Failed, retrying (${attempt + 1}/3)...`);
              await delay(4000);
              continue;
            }
            const errMsg =
              data.error || data.raw || "AI failed to process request";
            setError(errMsg);
            setLastFailedPrompt(thePrompt);
            setLastFailedMode(theMode);
            addMsg("ai", `Error: ${errMsg}`, true);
            setLoading(false);
            return;
          }

          // Success
          const generated = data.result;

          // AI says it needs more files — re-search the repo and retry once
          if (generated.needsMoreFiles && !isResearchRetry) {
            const hint = generated.searchHint || thePrompt;
            addMsg(
              "system",
              `AI couldn't find relevant code in loaded files. Re-searching for "${hint}"...`,
            );

            // Delay before re-search to be rate-limit safe
            await delay(2000);

            const newFiles = await searchAndFetchNewFiles(hint);

            if (newFiles.length > 0) {
              addMsg(
                "system",
                `Retrying with ${newFiles.length} additional file(s)...`,
              );
              await delay(CHUNK_DELAY_MS);
              // Retry the whole modify with the expanded cache (isResearchRetry=true to prevent infinite loop)
              setLoading(false);
              await handleModify(thePrompt, theMode, true);
              return;
            } else {
              addMsg(
                "ai",
                `Could not find code related to "${hint}" in this repo. The topic may not exist in the codebase.`,
              );
              setLoading(false);
              return;
            }
          }

          // Show intel diagnostics if available
          if (data.intel) {
            const { symbolsIndexed, contextFiles, symbolsFound } = data.intel;
            addMsg(
              "system",
              `Intel: ${symbolsIndexed} symbols indexed, ${contextFiles} files in context${symbolsFound?.length ? ` — found: ${symbolsFound.slice(0, 5).join(", ")}` : ""}`,
            );
          }

          if (theMode === "add") {
            const newItems: DocItem[] = (generated.docItems || []).map(
              (item: { style: string; text: string }) => ({
                uid: v4(),
                style: item.style,
                text: item.text,
              }),
            );
            allNewItems = [...allNewItems, ...newItems];
          } else {
            // Modify mode — surgical operations or fallback to full replace
            if (generated.operations && Array.isArray(generated.operations)) {
              runningItems = applyOperations(
                runningItems,
                generated.operations,
              );
            } else {
              runningItems = (generated.docItems || []).map(
                (item: { style: string; text: string }) => ({
                  uid: v4(),
                  style: item.style,
                  text: item.text,
                }),
              );
            }
          }

          chunkSuccess = true;
          break;
        }

        if (!chunkSuccess && chunks.length > 1) {
          addMsg("system", `Chunk ${ci + 1} skipped.`);
        }

        // Delay between chunks
        if (ci < chunks.length - 1) {
          addMsg(
            "system",
            `Waiting ${Math.ceil(CHUNK_DELAY_MS / 1000)}s before next chunk...`,
          );
          await delay(CHUNK_DELAY_MS);
        }
      }

      // Compute final items
      let finalItems: DocItem[];
      if (theMode === "add") {
        finalItems = [...currentItems, ...allNewItems];
      } else {
        finalItems = runningItems;
      }

      // Trim forward history and push new version
      const trimmed = history.slice(0, historyIndex + 1);
      setHistory([...trimmed, finalItems]);
      setHistoryIndex(trimmed.length);

      addMsg(
        "ai",
        theMode === "add"
          ? `Added ${allNewItems.length} items — now ${finalItems.length} total.${chunks.length > 1 ? ` (${chunks.length} chunks)` : ""}`
          : `Modified doc — now ${finalItems.length} items.${chunks.length > 1 ? ` (${chunks.length} chunks)` : ""}`,
      );
    } catch (err) {
      console.error("GitHub modify error:", err);
      const errMsg =
        err instanceof Error ? err.message : "Something went wrong";
      setError(errMsg);
      setLastFailedPrompt(thePrompt);
      setLastFailedMode(theMode);
      addMsg("ai", `Error: ${errMsg}`, true);
    } finally {
      setLoading(false);
    }
  };

  // --- Rate limit: wait and retry ---

  const handleWaitAndContinue = async () => {
    setLoading(true);
    addMsg("system", `Waiting ${rateLimitCountdown}s...`);

    // Wait the remaining countdown
    if (rateLimitCountdown > 0) {
      await delay(rateLimitCountdown * 1000);
    }

    setPhase("ready");
    setRateLimitCountdown(0);

    // Retry with the pending prompt
    if (pendingPrompt) {
      await handleModify(pendingPrompt, pendingMode);
    }
    setLoading(false);
  };

  const handleCancelRateLimit = () => {
    setPhase("ready");
    setRateLimitCountdown(0);
    setPendingPrompt("");
    addMsg("system", "Rate limit wait cancelled. You can try again.");
    setLoading(false);
  };

  // --- Save ---

  const handleSave = async () => {
    if (historyIndex === 0) return;
    setSaving(true);
    setError("");

    try {
      const saveRes = await fetch("/api/updateDocItems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projUid,
          docUid: doc.uid,
          docItems: currentItems,
        }),
      });

      if (!saveRes.ok) {
        const saveData = await saveRes.json();
        setError(saveData.error || "Failed to save");
        setSaving(false);
        return;
      }

      toast({ title: "GitHub import changes saved", variant: "green" });
      refetchProjectForDocs();
      onClose();
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // --- Render ---

  return (
    <div className="fixed inset-0 zz-top bg-black bg-opacity-80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="flex flex-col gap-3 w-full max-w-[500px] max-h-[90vh] border rounded-lg p-4 bg-black bg-opacity-60 backdrop-blur-md overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-bold">GitHub Doc Import</h2>
          <button
            onClick={onClose}
            className="btn btn-round btn-ghost btn-sm"
            disabled={loading || saving}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Conversation thread */}
        {messages.length > 0 && (
          <div className="flex flex-col gap-2 max-h-[120px] overflow-y-auto border rounded-md p-2 bg-black bg-opacity-20">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`text-sm px-2 py-1 rounded-md w-fit max-w-[90%] ${
                  msg.role === "user"
                    ? "place-self-end-fix bg-purple-600 bg-opacity-20 border-purple-500 border"
                    : msg.role === "error"
                      ? "bg-red-600 bg-opacity-20 border-red-500 border"
                      : msg.role === "ai"
                        ? "bg-slate-600 bg-opacity-20 border-slate-500 border"
                        : "bg-slate-600 bg-opacity-20 border-slate-500 border"
                }`}
              >
                <p className="text-xs text-slate-400 font-bold">
                  {msg.role === "user"
                    ? "You"
                    : msg.role === "ai"
                      ? "AI"
                      : msg.role === "error"
                        ? "Error"
                        : "System"}
                </p>
                <p className={msg.failed ? "text-red-400" : ""}>{msg.text}</p>
                {msg.failed && lastFailedPrompt && (
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="btn btn-xs btn-ghost btn-squish mt-1 text-purple-300"
                  >
                    Retry
                  </button>
                )}
              </div>
            ))}
            <div ref={msgEndRef} />
          </div>
        )}

        {/* Phase: Input (repo fields) */}
        {phase === "input" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleFetchRepo();
            }}
            className="flex flex-col gap-2"
          >
            <div className="flex gap-2">
              <div className="flex flex-col flex-1">
                <label className="text-xs text-slate-400">Owner</label>
                <input
                  type="text"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="username or org"
                  className="input"
                  disabled={loading}
                />
              </div>
              <div className="flex flex-col flex-1">
                <label className="text-xs text-slate-400">Repo</label>
                <input
                  type="text"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  placeholder="repo-name"
                  className="input"
                  disabled={loading}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex flex-col flex-1">
                <label className="text-xs text-slate-400">Branch</label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="input"
                  disabled={loading}
                />
              </div>
              <div className="flex flex-col flex-1">
                <label className="text-xs text-slate-400">
                  Token <span className="text-slate-500">(private repos)</span>
                </label>
                <input
                  type="password"
                  value={ghToken}
                  onChange={(e) => setGhToken(e.target.value)}
                  placeholder="optional"
                  className="input"
                  disabled={loading}
                />
              </div>
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-slate-400">
                What do you want to do with the code?
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Add code examples from the repo, Update the API docs with actual implementation..."
                className="input min-h-[60px]"
                disabled={loading}
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || !owner.trim() || !repo.trim()}
              className="btn btn-purple btn-squish place-self-end-fix"
            >
              {loading ? <LoaderSpinSmall /> : "Fetch Repo"}
            </button>
          </form>
        )}

        {/* Phase: Fetching (progress shown in messages) */}
        {phase === "fetching" && (
          <div className="flex items-center gap-2 justify-center py-4">
            <LoaderSpinSmall />
            <span className="text-sm text-slate-400">
              Fetching and analyzing...
            </span>
          </div>
        )}

        {/* Phase: Rate limited */}
        {phase === "rate-limited" && (
          <div className="flex flex-col gap-2 border rounded-md p-3 bg-red-900 bg-opacity-20 border-red-600">
            <p className="text-sm font-bold text-red-300">Rate Limited</p>
            <p className="text-sm text-slate-300">
              The AI provider is rate limiting requests.
              {rateLimitCountdown > 0 && (
                <span>
                  {" "}
                  Estimated wait: <b>{rateLimitCountdown}s</b>
                </span>
              )}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={handleCancelRateLimit}
                disabled={loading}
                className="btn btn-ghost btn-squish btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleWaitAndContinue}
                disabled={loading}
                className="btn btn-purple btn-squish btn-sm"
              >
                {loading ? (
                  <LoaderSpinSmall />
                ) : (
                  `Wait & Continue${rateLimitCountdown > 0 ? ` (${rateLimitCountdown}s)` : ""}`
                )}
              </button>
            </div>
          </div>
        )}

        {/* Preview with undo/redo */}
        {history.length > 1 && (
          <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto border rounded-md p-2 bg-black bg-opacity-10">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Preview — v{historyIndex}/{history.length - 1}
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className={`btn btn-xs btn-ghost btn-squish ${!canUndo && "opacity-30"}`}
                >
                  ← Undo
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={!canRedo}
                  className={`btn btn-xs btn-ghost btn-squish ${!canRedo && "opacity-30"}`}
                >
                  Redo →
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1 mt-1">
              {currentItems.map((item, i) =>
                item.style === "code" ? (
                  <div key={i} className="scale-[0.85] origin-left">
                    <ItsCode code={item.text} lang="tsx" />
                  </div>
                ) : (
                  <div
                    key={i}
                    className={`text-sm px-2 py-1 rounded-md ${
                      item.style === "text-xl font-bold "
                        ? "font-bold text-base mt-2"
                        : `btn btn-nohover !cursor-default ${item.style}`
                    }`}
                  >
                    {item.text}
                  </div>
                ),
              )}
            </div>
          </div>
        )}

        {/* Mode toggle + Prompt input (visible in "ready" phase) */}
        {phase === "ready" && (
          <>
            {/* Mode toggle */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("add")}
                className={`btn btn-sm btn-squish ${mode === "add" ? "btn-purple" : "btn-ghost"}`}
              >
                Add To
              </button>
              <button
                type="button"
                onClick={() => setMode("modify")}
                className={`btn btn-sm btn-squish ${mode === "modify" ? "btn-purple" : "btn-ghost"}`}
              >
                Modify
              </button>
            </div>

            {/* Cached files badge */}
            {cachedFiles.length > 0 && (
              <p className="text-xs text-slate-500">
                Using {cachedFiles.length} file(s) from {owner}/{repo}
              </p>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleModify();
              }}
              className="flex flex-col gap-2"
            >
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  mode === "add"
                    ? "e.g. Add code examples from the auth middleware..."
                    : "e.g. Update the API docs with actual implementation details..."
                }
                className="input min-h-[60px]"
                disabled={loading || saving}
              />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div className="flex items-center justify-between">
                <button
                  type="submit"
                  disabled={loading || saving || !prompt.trim()}
                  className="btn btn-purple btn-squish"
                >
                  {loading ? (
                    <LoaderSpinSmall />
                  ) : mode === "add" ? (
                    "Add"
                  ) : (
                    "Modify"
                  )}
                </button>
                {historyIndex > 0 && (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={loading || saving}
                    className="btn btn-green btn-squish"
                  >
                    {saving ? <LoaderSpinSmall /> : "Save Changes"}
                  </button>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default GitHubDocModifyForm;
