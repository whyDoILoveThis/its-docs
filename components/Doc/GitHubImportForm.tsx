"use client";
import React, { useRef, useEffect, useState, useCallback } from "react";
import { v4 } from "uuid";
import LoaderSpinSmall from "@/components/LoaderSpinSmall";
import { useToast } from "@/hooks/use-toast";
import CloseIcon from "@/components/icons/CloseIcon";
import { useOfflineFetch } from "@/hooks/useOfflineFetch";
import { updateCachedProject } from "@/lib/offlineDB";

// --- Types ---

interface TreeFile {
  path: string;
  size: number;
}

interface DocPlan {
  title: string;
  description: string;
  files: string[];
}

interface FetchedFile {
  path: string;
  content: string;
  error?: string;
}

interface GeneratedDoc {
  title: string;
  tagline: string;
  desc: string;
  docItems: DocItem[];
}

interface LogEntry {
  role: "user" | "system" | "error" | "success";
  text: string;
  failed?: boolean;
}

type Phase =
  | "input" // Entering repo info + prompt
  | "tree" // Fetching repo tree
  | "planning" // AI selecting files & grouping
  | "review" // User reviews the plan
  | "generating" // Fetching files + generating docs (chunked)
  | "done"; // All done

// --- Helpers ---

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DELAY_BETWEEN_CHUNKS_MS = 4000; // 4 sec between AI calls to avoid rate limit
const MAX_RETRIES = 3;
const RATE_LIMIT_WAIT_MS = 15000; // 15 sec wait on rate limit
const MAX_FILE_TOKENS_PER_REQUEST = 18000; // Safe limit within 30k TPM

// Rough token estimate: 1 token ≈ 4 chars
const estimateTokens = (text: string) => Math.ceil(text.length / 4);

// Split files into chunks fitting within a token budget
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
  refetchProject: () => void;
  onClose: () => void;
  defaultOwner?: string;
  defaultRepo?: string;
}

const GitHubImportForm = ({
  projUid,
  refetchProject,
  onClose,
  defaultOwner,
  defaultRepo,
}: Props) => {
  const { toast } = useToast();
  const { offlineFetch } = useOfflineFetch();
  const logEndRef = useRef<HTMLDivElement>(null);

  // Form state
  const [owner, setOwner] = useState(defaultOwner || "");
  const [repo, setRepo] = useState(defaultRepo || "");
  const [branch, setBranch] = useState("main");
  const [ghToken, setGhToken] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("its-gh-token") || "";
    }
    return "";
  });
  const [prompt, setPrompt] = useState("");

  // Process state
  const [phase, setPhase] = useState<Phase>("input");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [tree, setTree] = useState<TreeFile[]>([]);
  const [docPlans, setDocPlans] = useState<DocPlan[]>([]);
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDoc[]>([]);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  const addLog = useCallback(
    (role: LogEntry["role"], text: string, failed = false) => {
      setLog((prev) => [...prev, { role, text, failed }]);
    },
    [],
  );

  // --- Phase 1: Fetch tree ---

  const handleFetchTree = async () => {
    setLoading(true);
    setError("");
    addLog("user", `Import from ${owner}/${repo} (${branch})`);
    if (prompt) addLog("user", `Prompt: ${prompt}`);

    try {
      const res = await fetch("/api/github-import/tree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          branch,
          ghToken: ghToken || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || data.githubRateLimited) {
        const msg = data.githubRateLimited
          ? "GitHub API rate limit exceeded. Add a GitHub token above to get 5,000 requests/hour instead of 60."
          : data.error || "Failed to fetch repo tree";
        setError(msg);
        addLog("error", msg, true);
        setLoading(false);
        return;
      }

      setTree(data.tree);
      addLog("system", `Found ${data.totalFiles} files in ${owner}/${repo}`);
      if (data.truncated) {
        addLog(
          "system",
          "Note: Repo is very large — tree was truncated by GitHub",
        );
      }

      setPhase("tree");
      // Immediately proceed to planning
      await handleSelectFiles(data.tree);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      addLog("error", msg, true);
    } finally {
      setLoading(false);
    }
  };

  // --- Phase 2: AI selects files ---

  const handleSelectFiles = async (treeData?: TreeFile[]) => {
    setLoading(true);
    setError("");
    setPhase("planning");
    addLog("system", "AI is analyzing the repo structure...");

    const theTree = treeData || tree;

    try {
      const res = await fetch("/api/github-import/select-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tree: theTree,
          prompt: prompt || "Document this entire repository",
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const msg = data.error || "AI failed to analyze repo";
        setError(msg);
        addLog("error", msg, true);
        setLoading(false);
        return;
      }

      setDocPlans(data.docPlans);
      const totalFiles = data.docPlans.reduce(
        (sum: number, p: DocPlan) => sum + p.files.length,
        0,
      );
      addLog(
        "system",
        `AI planned ${data.docPlans.length} doc(s) covering ${totalFiles} files`,
      );
      setPhase("review");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      addLog("error", msg, true);
    } finally {
      setLoading(false);
    }
  };

  // --- Phase 3: Generate docs (chunked with delays) ---

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    setCancelled(false);
    cancelledRef.current = false;
    setPhase("generating");
    setProgressTotal(docPlans.length);
    setProgressCurrent(0);
    setGeneratedDocs([]);

    addLog("system", `Starting generation of ${docPlans.length} doc(s)...`);

    const docs: GeneratedDoc[] = [];

    for (let i = 0; i < docPlans.length; i++) {
      if (cancelledRef.current) {
        addLog("system", "Cancelled by user");
        break;
      }

      const plan = docPlans[i];
      setProgressCurrent(i + 1);
      addLog(
        "system",
        `[${i + 1}/${docPlans.length}] Fetching files for "${plan.title}"...`,
      );

      // Fetch file contents
      let fetchedFiles: FetchedFile[];
      try {
        const fetchRes = await fetch("/api/github-import/fetch-files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner,
            repo,
            branch,
            files: plan.files,
            ghToken: ghToken || undefined,
          }),
        });
        const fetchData = await fetchRes.json();

        if (fetchData.githubRateLimited) {
          addLog(
            "error",
            `GitHub API rate limit hit while fetching files for "${plan.title}". Add a GitHub token to get 5,000 requests/hour instead of 60.`,
            true,
          );
          break;
        }

        if (!fetchRes.ok) {
          addLog(
            "error",
            `Failed to fetch files for "${plan.title}": ${fetchData.error}`,
          );
          continue;
        }

        fetchedFiles = fetchData.files;
        const successCount = fetchedFiles.filter((f) => f.content).length;
        addLog(
          "system",
          `Fetched ${successCount}/${plan.files.length} files. Generating doc...`,
        );
      } catch {
        addLog("error", `Network error fetching files for "${plan.title}"`);
        continue;
      }

      if (cancelledRef.current) {
        addLog("system", "Cancelled by user");
        break;
      }

      // Generate doc (chunked if files are too large for single request)
      const goodFetchedFiles = fetchedFiles.filter((f) => f.content);
      const totalFileTokens = goodFetchedFiles.reduce(
        (sum, f) => sum + estimateTokens(`--- ${f.path} ---\n${f.content}`),
        0,
      );

      const fileChunks =
        totalFileTokens > MAX_FILE_TOKENS_PER_REQUEST
          ? chunkFilesByBudget(goodFetchedFiles, MAX_FILE_TOKENS_PER_REQUEST)
          : [goodFetchedFiles];

      if (fileChunks.length > 1) {
        addLog(
          "system",
          `Files too large for single request (~${totalFileTokens.toLocaleString()} tokens). Splitting into ${fileChunks.length} chunks...`,
        );
      }

      let generated: GeneratedDoc | null = null;

      for (let ci = 0; ci < fileChunks.length; ci++) {
        if (cancelledRef.current) break;

        if (fileChunks.length > 1) {
          addLog(
            "system",
            `Generating chunk ${ci + 1}/${fileChunks.length}...`,
          );
        }

        // Retry loop for this chunk
        let chunkResult: GeneratedDoc | null = null;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          if (cancelledRef.current) break;

          try {
            const genRes = await fetch("/api/github-import/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                files: fileChunks[ci],
                prompt: prompt || undefined,
                docTitle: plan.title,
              }),
            });
            const genData = await genRes.json();

            if (genRes.status === 429 || genData.rateLimited) {
              const waitSecs = Math.ceil(RATE_LIMIT_WAIT_MS / 1000);
              addLog(
                "system",
                `Rate limited. Waiting ${waitSecs}s before retry (attempt ${attempt + 1}/${MAX_RETRIES})...`,
              );
              await delay(RATE_LIMIT_WAIT_MS);
              continue;
            }

            if (genData.tooLarge) {
              addLog(
                "error",
                `Chunk too large (${genData.requestedTokens?.toLocaleString() || "?"} tokens). Skipping.`,
              );
              break;
            }

            if (!genRes.ok || !genData.result) {
              if (attempt < MAX_RETRIES - 1) {
                addLog(
                  "system",
                  `Generation failed, retrying (${attempt + 1}/${MAX_RETRIES})...`,
                );
                await delay(DELAY_BETWEEN_CHUNKS_MS);
                continue;
              }
              addLog(
                "error",
                `Failed to generate "${plan.title}": ${genData.error || "Unknown error"}`,
              );
              break;
            }

            chunkResult = genData.result;
            break;
          } catch {
            if (attempt < MAX_RETRIES - 1) {
              addLog(
                "system",
                `Network error, retrying (${attempt + 1}/${MAX_RETRIES})...`,
              );
              await delay(DELAY_BETWEEN_CHUNKS_MS);
              continue;
            }
            addLog("error", `Network error generating "${plan.title}"`);
          }
        }

        if (chunkResult) {
          if (!generated) {
            // First chunk — use full result (title, tagline, desc, docItems)
            generated = chunkResult;
          } else {
            // Subsequent chunks — merge docItems
            generated.docItems = [
              ...(generated.docItems || []),
              ...(chunkResult.docItems || []),
            ];
          }
        }

        // Delay between file chunks
        if (ci < fileChunks.length - 1 && !cancelledRef.current) {
          await delay(DELAY_BETWEEN_CHUNKS_MS);
        }
      }

      if (generated) {
        docs.push(generated);
        setGeneratedDocs([...docs]);
        addLog(
          "success",
          `Generated "${generated.title}" (${generated.docItems?.length || 0} items)`,
        );
      }

      // Delay between chunks to avoid rate limits
      if (i < docPlans.length - 1 && !cancelledRef.current) {
        const waitSecs = Math.ceil(DELAY_BETWEEN_CHUNKS_MS / 1000);
        addLog("system", `Waiting ${waitSecs}s before next doc...`);
        await delay(DELAY_BETWEEN_CHUNKS_MS);
      }
    }

    if (!cancelledRef.current && docs.length > 0) {
      addLog(
        "success",
        `Done! Generated ${docs.length} doc(s). Review and save below.`,
      );
    } else if (docs.length === 0 && !cancelledRef.current) {
      addLog(
        "error",
        "No docs were generated. Try again or adjust your prompt.",
      );
    }

    setPhase("done");
    setLoading(false);
  };

  // --- Save all generated docs ---

  const handleSaveAll = async () => {
    setLoading(true);
    setError("");
    let saved = 0;

    for (const gen of generatedDocs) {
      const newDoc = {
        uid: v4(),
        title: gen.title || "Imported Doc",
        tagline: gen.tagline || "",
        desc: gen.desc || "",
        docItems: (gen.docItems || []).map(
          (item: { style: string; text: string }) => ({
            uid: v4(),
            style: item.style,
            text: item.text,
          }),
        ),
      };

      try {
        const res = await offlineFetch({
          label: `Save GitHub doc "${gen.title}"`,
          method: "POST",
          url: "/api/addDoc",
          body: { projUid, doc: newDoc },
        });

        if (res) {
          saved++;
        } else {
          // queued offline — optimistically add to cache
          await updateCachedProject(projUid, (p) => ({
            ...p,
            docs: [...(p.docs || []), newDoc],
          }));
          saved++;
        }
      } catch {
        addLog("error", `Error saving "${gen.title}"`);
      }

      // Small delay between saves
      await delay(300);
    }

    if (saved > 0) {
      toast({ title: `${saved} doc(s) imported`, variant: "green" });
      addLog("success", `Saved ${saved} doc(s) to project`);
      refetchProject();
      onClose();
    } else {
      setError("Failed to save any docs");
    }

    setLoading(false);
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    setCancelled(true);
  };

  // --- Render helpers ---

  const renderLog = () => (
    <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto border rounded-md p-2 bg-black bg-opacity-20 text-sm">
      {log.map((entry, i) => (
        <div
          key={i}
          className={`px-2 py-1 rounded-md w-fit max-w-[95%] ${
            entry.role === "user"
              ? "place-self-end-fix bg-purple-600 bg-opacity-20 border-purple-500 border"
              : entry.role === "error"
                ? "bg-red-600 bg-opacity-20 border-red-500 border"
                : entry.role === "success"
                  ? "bg-green-600 bg-opacity-20 border-green-500 border"
                  : "bg-slate-600 bg-opacity-20 border-slate-500 border"
          }`}
        >
          {entry.text}
        </div>
      ))}
      <div ref={logEndRef} />
    </div>
  );

  const renderProgress = () => {
    if (progressTotal === 0) return null;
    const pct = Math.round((progressCurrent / progressTotal) * 100);
    return (
      <div className="w-full">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>
            Doc {progressCurrent}/{progressTotal}
          </span>
          <span>{pct}%</span>
        </div>
        <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 transition-all duration-500 rounded-full"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3 mb-6 w-full max-w-[500px]">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">GitHub Import</h2>
        <button
          onClick={onClose}
          className="btn btn-round btn-ghost btn-sm"
          disabled={loading && phase === "generating"}
        >
          <CloseIcon />
        </button>
      </div>

      {/* Log */}
      {log.length > 0 && renderLog()}

      {/* Phase: Input */}
      {phase === "input" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleFetchTree();
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
                onChange={(e) => {
                  setGhToken(e.target.value);
                  localStorage.setItem("its-gh-token", e.target.value);
                }}
                placeholder="optional"
                className="input"
                disabled={loading}
              />
            </div>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-slate-400">
              What do you want to document?
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Document the whole repo, or: Document the authentication system..."
              className="input min-h-[70px]"
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

      {/* Phase: Review plan */}
      {phase === "review" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-slate-400">
            AI will create {docPlans.length} doc(s):
          </p>
          <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto border rounded-md p-2 bg-black bg-opacity-10">
            {docPlans.map((plan, i) => (
              <div
                key={i}
                className="flex flex-col border-b border-slate-700 pb-1 mb-1 last:border-0 last:pb-0 last:mb-0"
              >
                <p className="font-bold text-sm">{plan.title}</p>
                <p className="text-xs text-slate-400">{plan.description}</p>
                <p className="text-xs text-slate-500">
                  {plan.files.length} file(s):{" "}
                  {plan.files.slice(0, 3).join(", ")}
                  {plan.files.length > 3 && ` +${plan.files.length - 3} more`}
                </p>
              </div>
            ))}
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setPhase("input");
                setDocPlans([]);
              }}
              className="btn btn-ghost btn-squish"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="btn btn-purple btn-squish"
            >
              {loading ? <LoaderSpinSmall /> : "Generate Docs"}
            </button>
          </div>
        </div>
      )}

      {/* Phase: Generating */}
      {phase === "generating" && (
        <div className="flex flex-col gap-2">
          {renderProgress()}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">
              {loading ? "Generating..." : "Paused"}
            </p>
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelled}
              className="btn btn-red btn-squish btn-sm"
            >
              {cancelled ? "Cancelling..." : "Cancel"}
            </button>
          </div>
        </div>
      )}

      {/* Phase: Done */}
      {phase === "done" && (
        <div className="flex flex-col gap-2">
          {generatedDocs.length > 0 && renderProgress()}
          {generatedDocs.length > 0 && (
            <div className="flex flex-col gap-1 max-h-[150px] overflow-y-auto border rounded-md p-2 bg-black bg-opacity-10">
              {generatedDocs.map((doc, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-green-400 text-xs">✓</span>
                  <span className="text-sm font-bold">{doc.title}</span>
                  <span className="text-xs text-slate-400">
                    ({doc.docItems?.length || 0} items)
                  </span>
                </div>
              ))}
            </div>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setPhase("input");
                setDocPlans([]);
                setGeneratedDocs([]);
                setLog([]);
                setProgressCurrent(0);
                setProgressTotal(0);
                setCancelled(false);
                cancelledRef.current = false;
              }}
              className="btn btn-ghost btn-squish"
            >
              Start Over
            </button>
            {generatedDocs.length > 0 && (
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={loading}
                className="btn btn-green btn-squish"
              >
                {loading ? (
                  <LoaderSpinSmall />
                ) : (
                  `Save ${generatedDocs.length} Doc(s)`
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GitHubImportForm;
