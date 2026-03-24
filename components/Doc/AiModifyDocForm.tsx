"use client";
import React, { useRef, useEffect, useState } from "react";
import { v4 } from "uuid";
import LoaderSpinSmall from "@/components/LoaderSpinSmall";
import { useToast } from "@/hooks/use-toast";
import CloseIcon from "@/components/icons/CloseIcon";
import ItsCode from "@/components/ItsCode";
import { useOfflineFetch } from "@/hooks/useOfflineFetch";
import { updateCachedProject } from "@/lib/offlineDB";

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

  // Inserts at the very beginning (index -1)
  const beforeAll = inserts.get(-1);
  if (beforeAll) {
    for (const item of beforeAll)
      result.push({ uid: v4(), style: item.style, text: item.text });
  }

  for (let i = 0; i < currentItems.length; i++) {
    if (deletes.has(i)) {
      // Still honor insert_after on deleted index
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
      result.push({ ...currentItems[i] }); // Keep original with same uid
    }

    const afterThis = inserts.get(i);
    if (afterThis)
      for (const item of afterThis)
        result.push({ uid: v4(), style: item.style, text: item.text });
  }

  return result;
}

interface ChatMsg {
  role: "user" | "ai";
  text: string;
  failed?: boolean;
}

interface Props {
  projUid: string;
  doc: Doc;
  refetchProjectForDocs: () => void;
  onClose: () => void;
}

const AiModifyDocForm = ({
  projUid,
  doc,
  refetchProjectForDocs,
  onClose,
}: Props) => {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"add" | "modify">("add");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();
  const { offlineFetch } = useOfflineFetch();

  // Version history — index 0 is always the original doc items
  const [history, setHistory] = useState<DocItem[][]>([doc.docItems || []]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [lastFailedMode, setLastFailedMode] = useState<"add" | "modify">("add");
  const msgEndRef = useRef<HTMLDivElement>(null);

  const currentItems = history[historyIndex];
  const hasChanges = historyIndex > 0;
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError("");
    setLastFailedPrompt(null);

    const userMsg = prompt.trim();
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        text: `[${mode === "add" ? "Add" : "Modify"}] ${userMsg}`,
      },
    ]);
    setPrompt("");

    try {
      const aiRes = await fetch("/api/its-ai-docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userMsg,
          mode,
          existingDocItems: currentItems,
        }),
      });

      const aiData = await aiRes.json();

      if (!aiRes.ok || !aiData.result) {
        const errMsg =
          aiData.error || aiData.raw || "AI failed to process request";
        setError(errMsg);
        setLastFailedPrompt(userMsg);
        setLastFailedMode(mode);
        setMessages((prev) => [
          ...prev,
          { role: "ai", text: `Error: ${errMsg}`, failed: true },
        ]);
        setLoading(false);
        return;
      }

      const generated = aiData.result;

      let finalItems: DocItem[];

      if (mode === "add") {
        const newItems = (generated.docItems || []).map(
          (item: { style: string; text: string }) => ({
            uid: v4(),
            style: item.style,
            text: item.text,
          }),
        );
        finalItems = [...currentItems, ...newItems];
      } else {
        // Modify mode — use surgical operations if available, fallback to full replace
        if (generated.operations && Array.isArray(generated.operations)) {
          finalItems = applyOperations(currentItems, generated.operations);
        } else {
          finalItems = (generated.docItems || []).map(
            (item: { style: string; text: string }) => ({
              uid: v4(),
              style: item.style,
              text: item.text,
            }),
          );
        }
      }

      // Trim forward history and push new version
      const trimmed = history.slice(0, historyIndex + 1);
      setHistory([...trimmed, finalItems]);
      setHistoryIndex(trimmed.length);

      const addedCount = finalItems.length - currentItems.length;
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text:
            mode === "add"
              ? `Added ${addedCount} items — now ${finalItems.length} total.`
              : `Modified doc — now ${finalItems.length} items.`,
        },
      ]);
    } catch (err) {
      console.error("AI modify error:", err);
      const errMsg =
        err instanceof Error ? err.message : "Something went wrong";
      setError(errMsg);
      setLastFailedPrompt(userMsg);
      setLastFailedMode(mode);
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: `Error: ${errMsg}`, failed: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    setError("");

    try {
      const saveRes = await offlineFetch({
        label: `Save AI changes to "${doc.title}"`,
        method: "POST",
        url: "/api/updateDocItems",
        body: { projUid, docUid: doc.uid, docItems: currentItems },
      });

      if (!saveRes) {
        // Offline — optimistically update cache
        await updateCachedProject(projUid, (p) => ({
          ...p,
          docs: p.docs?.map((d) =>
            d.uid === doc.uid ? { ...d, docItems: currentItems } : d,
          ),
        }));
        toast({ title: "AI changes queued offline", variant: "blue" });
        refetchProjectForDocs();
        onClose();
        setSaving(false);
        return;
      }

      toast({ title: "AI changes saved", variant: "green" });
      refetchProjectForDocs();
      onClose();
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 zz-top bg-black bg-opacity-80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="flex flex-col gap-3 w-full max-w-[500px] max-h-[90vh] border rounded-lg p-4 bg-black bg-opacity-60 backdrop-blur-md">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-bold">AI Doc Assistant</h2>
          <button
            onClick={onClose}
            className="btn btn-round btn-ghost btn-sm"
            disabled={loading || saving}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("add")}
            className={`btn btn-sm btn-squish ${
              mode === "add" ? "btn-purple" : "btn-ghost"
            }`}
          >
            Add To
          </button>
          <button
            type="button"
            onClick={() => setMode("modify")}
            className={`btn btn-sm btn-squish ${
              mode === "modify" ? "btn-purple" : "btn-ghost"
            }`}
          >
            Modify
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
                    : "bg-slate-600 bg-opacity-20 border-slate-500 border"
                }`}
              >
                <p className="text-xs text-slate-400 font-bold">
                  {msg.role === "user" ? "You" : "AI"}
                </p>
                <p className={msg.failed ? "text-red-400" : ""}>{msg.text}</p>
                {msg.failed && (
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
                  className={`btn btn-xs btn-ghost btn-squish ${
                    !canUndo && "opacity-30"
                  }`}
                >
                  ← Undo
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={!canRedo}
                  className={`btn btn-xs btn-ghost btn-squish ${
                    !canRedo && "opacity-30"
                  }`}
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

        {/* Prompt input */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              mode === "add"
                ? "e.g. Add a section about error handling..."
                : "e.g. Make explanations shorter, add more code..."
            }
            className="input min-h-[70px]"
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
      </div>
    </div>
  );
};

export default AiModifyDocForm;
