"use client";
import React, { useRef, useEffect, useState } from "react";
import { v4 } from "uuid";
import LoaderSpinSmall from "@/components/LoaderSpinSmall";
import { useToast } from "@/hooks/use-toast";
import CloseIcon from "@/components/icons/CloseIcon";
import ItsCode from "@/components/ItsCode";
import { useOfflineFetch } from "@/hooks/useOfflineFetch";
import { updateCachedProject } from "@/hooks/useOfflineStore";

interface DocVersion {
  title: string;
  tagline: string;
  desc: string;
  docItems: DocItem[];
}

interface ChatMsg {
  role: "user" | "ai";
  text: string;
  failed?: boolean;
}

interface Props {
  projUid: string;
  refetchProject: () => void;
  onClose: () => void;
}

const AiDocForm = ({ projUid, refetchProject, onClose }: Props) => {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();
  const { offlineFetch } = useOfflineFetch();

  // Version history for undo/redo
  const [history, setHistory] = useState<DocVersion[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const msgEndRef = useRef<HTMLDivElement>(null);

  const currentVersion = historyIndex >= 0 ? history[historyIndex] : null;

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleUndo = () => {
    if (canUndo) setHistoryIndex(historyIndex - 1);
  };

  const handleRedo = () => {
    if (canRedo) setHistoryIndex(historyIndex + 1);
  };

  const handleRetry = () => {
    if (!lastFailedPrompt) return;
    setPrompt(lastFailedPrompt);
    setLastFailedPrompt(null);
    // Remove the last failed AI message
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.failed) return prev.slice(0, -1);
      return prev;
    });
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError("");
    setLastFailedPrompt(null);

    const userMsg = prompt.trim();
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setPrompt("");

    try {
      const isFirstGen = currentVersion === null;
      const mode = isFirstGen ? "generate" : "modify";

      const body: Record<string, unknown> = { prompt: userMsg, mode };
      if (!isFirstGen && currentVersion) {
        body.existingDocItems = currentVersion.docItems;
      }

      const aiRes = await fetch("/api/its-ai-docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const aiData = await aiRes.json();

      if (!aiRes.ok || !aiData.result) {
        const errMsg =
          aiData.error || aiData.raw || "AI failed to generate doc";
        setError(errMsg);
        setLastFailedPrompt(userMsg);
        setMessages((prev) => [
          ...prev,
          { role: "ai", text: `Error: ${errMsg}`, failed: true },
        ]);
        setLoading(false);
        return;
      }

      const generated = aiData.result;

      const version: DocVersion = {
        title: generated.title || currentVersion?.title || "AI Generated Doc",
        tagline: generated.tagline || currentVersion?.tagline || "",
        desc: generated.desc || currentVersion?.desc || "",
        docItems: (generated.docItems || []).map(
          (item: { style: string; text: string }) => ({
            uid: v4(),
            style: item.style,
            text: item.text,
          }),
        ),
      };

      // Trim any forward history when adding new version
      const trimmed = history.slice(0, historyIndex + 1);
      setHistory([...trimmed, version]);
      setHistoryIndex(trimmed.length);

      const itemCount = version.docItems.length;
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: isFirstGen
            ? `Generated "${version.title}" with ${itemCount} items.`
            : `Updated doc — now ${itemCount} items.`,
        },
      ]);
    } catch (err) {
      console.error("AI doc generation error:", err);
      const errMsg =
        err instanceof Error ? err.message : "Something went wrong";
      setError(errMsg);
      setLastFailedPrompt(userMsg);
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: `Error: ${errMsg}`, failed: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentVersion) return;
    setLoading(true);
    setError("");

    try {
      const doc: Doc = {
        uid: v4(),
        title: currentVersion.title,
        tagline: currentVersion.tagline,
        desc: currentVersion.desc,
        docItems: currentVersion.docItems,
      };

      const saveRes = await offlineFetch({
        label: `Save AI doc "${currentVersion.title}"`,
        method: "POST",
        url: "/api/addDoc",
        body: { projUid, doc },
      });

      if (!saveRes) {
        // queued offline — optimistically add doc to cache
        updateCachedProject(projUid, (p) => ({
          ...p,
          docs: [...(p.docs || []), doc],
        }));
        toast({ title: "AI doc queued offline", variant: "blue" });
        refetchProject();
        onClose();
        setLoading(false);
        return;
      }

      toast({ title: "AI doc saved", variant: "green" });
      refetchProject();
      onClose();
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 mb-6 w-full max-w-[500px]">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">AI Generate Doc</h2>
        <button onClick={onClose} className="btn btn-round btn-ghost btn-sm">
          <CloseIcon />
        </button>
      </div>

      {/* Conversation thread */}
      {messages.length > 0 && (
        <div className="flex flex-col gap-2 max-h-[150px] overflow-y-auto border rounded-md p-2 bg-black bg-opacity-20">
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

      {/* Preview of current version */}
      {currentVersion && (
        <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto border rounded-md p-2 bg-black bg-opacity-10">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Preview — v{historyIndex + 1}/{history.length}
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
          <p className="font-bold">{currentVersion.title}</p>
          {currentVersion.tagline && (
            <p className="text-sm text-slate-300">{currentVersion.tagline}</p>
          )}
          <div className="flex flex-col gap-1 mt-1">
            {currentVersion.docItems.map((item, i) =>
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
      <form onSubmit={handleGenerate} className="flex flex-col gap-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            currentVersion
              ? "Refine: e.g. Add more code examples, make it shorter..."
              : "e.g. A setup guide for a Next.js project with Tailwind CSS..."
          }
          className="input min-h-[80px]"
          disabled={loading}
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex items-center justify-between">
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="btn btn-purple btn-squish"
          >
            {loading ? (
              <LoaderSpinSmall />
            ) : currentVersion ? (
              "Refine"
            ) : (
              "Generate"
            )}
          </button>
          {currentVersion && (
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="btn btn-green btn-squish"
            >
              {loading ? <LoaderSpinSmall /> : "Save Doc"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default AiDocForm;
