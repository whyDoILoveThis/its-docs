"use client";
import React, { useEffect, useState } from "react";
import axios, { AxiosError } from "axios";
import {
  useOfflineStore,
  PendingChange,
  revertCachedChange,
} from "@/hooks/useOfflineStore";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ItsConfirmProvider";
import { useFirebasePresence } from "@/hooks/useFirebasePresence";
import CloseIcon from "@/components/icons/CloseIcon";

const METHOD_COLORS: Record<string, string> = {
  POST: "bg-green-600",
  PUT: "bg-yellow-600",
  DELETE: "bg-red-600",
  GET: "bg-blue-600",
};

const OfflineToast = () => {
  const {
    pendingChanges,
    isOpen,
    isOnline,
    setIsOpen,
    goOffline,
    goOnline,
    removeChange,
    clearAll,
  } = useOfflineStore();
  const { toast } = useToast();
  const { ItsConfirm } = useConfirm();
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wasOnlineRef = React.useRef(true);

  // Firebase Realtime DB presence listener
  useFirebasePresence();

  // Defer rendering until after hydration
  useEffect(() => setMounted(true), []);

  // Browser online/offline events
  useEffect(() => {
    const handleOnline = () => goOnline();
    const handleOffline = () => goOffline();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [goOnline, goOffline]);

  // Toast on transitions
  useEffect(() => {
    if (!mounted) return;
    if (wasOnlineRef.current && !isOnline) {
      toast({ title: "You are offline", variant: "red" });
    } else if (!wasOnlineRef.current && isOnline) {
      toast({ title: "Back online", variant: "green" });
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline, mounted, toast]);

  const count = pendingChanges.length;

  if (!mounted) return null;
  if (count === 0 && isOnline) return null;

  const replayChange = async (
    change: PendingChange,
  ): Promise<"ok" | "already-synced" | "failed"> => {
    try {
      switch (change.method) {
        case "POST":
          await axios.post(change.url, change.body);
          break;
        case "PUT":
          await axios.put(change.url, change.body);
          break;
        case "DELETE":
          await axios.delete(change.url, { data: change.body });
          break;
        default:
          await axios.post(change.url, change.body);
      }
      goOnline();
      return "ok";
    } catch (err) {
      if (err instanceof AxiosError) {
        const status = err.response?.status;
        // 404 = resource already gone, 409 = already exists / conflict
        if (status === 404 || status === 409) {
          goOnline();
          return "already-synced";
        }
        if (!err.response) {
          goOffline();
        }
      }
      return "failed";
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    let succeeded = 0;
    let alreadySynced = 0;
    let failed = 0;

    for (const change of [...pendingChanges]) {
      const result = await replayChange(change);
      if (result === "ok") {
        removeChange(change.id);
        succeeded++;
      } else if (result === "already-synced") {
        removeChange(change.id);
        alreadySynced++;
      } else {
        failed++;
      }
    }

    setSaving(false);

    const parts: string[] = [];
    if (succeeded > 0) parts.push(`${succeeded} synced`);
    if (alreadySynced > 0) parts.push(`${alreadySynced} already synced`);
    if (failed > 0) parts.push(`${failed} still pending`);

    if (failed === 0) {
      toast({ title: parts.join(", "), variant: "green" });
      setIsOpen(false);
    } else {
      toast({ title: parts.join(", "), variant: "red" });
    }
  };

  const handleSaveOne = async (change: PendingChange) => {
    const result = await replayChange(change);
    if (result === "ok") {
      removeChange(change.id);
      toast({ title: `Synced: ${change.label}`, variant: "green" });
    } else if (result === "already-synced") {
      removeChange(change.id);
      toast({
        title: `Already synced: ${change.label}`,
        variant: "green",
      });
    } else {
      toast({ title: `Failed: ${change.label}`, variant: "red" });
    }
  };

  const handleDismissOne = async (change: PendingChange) => {
    const confirmed = await ItsConfirm(
      `Discard "${change.label}"? This change will be lost forever.`,
    );
    if (confirmed) {
      removeChange(change.id);
      await revertCachedChange(change);
    }
  };

  const handleDiscardAll = async () => {
    const confirmed = await ItsConfirm(
      `Discard all ${count} unsaved changes? They will be lost forever.`,
    );
    if (confirmed) {
      clearAll();
      setIsOpen(false);
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return (
      d.toLocaleDateString([], { month: "short", day: "numeric" }) +
      " " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  };

  const getEndpoint = (url: string) => {
    return url.replace(/^\/api\//, "").split("?")[0];
  };

  // Collapsed tab
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-4 right-4 z-ten ${
          !isOnline ? "bg-red-600" : "bg-orange-600"
        } bg-opacity-90 text-white text-xs font-semibold px-3 py-1.5 rounded-md shadow-lg hover:bg-opacity-100 transition-all cursor-pointer flex items-center gap-1.5`}
      >
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            isOnline ? "bg-green-400" : "bg-red-400 animate-pulse"
          }`}
        />
        {count > 0 ? `${count} unsaved` : "Offline"}
      </button>
    );
  }

  // Expanded panel
  return (
    <div className="fixed bottom-4 right-4 z-ten w-80 max-h-[70vh] flex flex-col rounded-lg shadow-2xl border border-red-500 bg-neutral-900 text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-red-800">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              isOnline ? "bg-green-400" : "bg-red-400 animate-pulse"
            }`}
          />
          <span className="font-semibold text-sm">
            {count > 0
              ? `${count} Unsaved Change${count !== 1 ? "s" : ""}`
              : "Offline"}
          </span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-red-300 hover:text-white transition-colors cursor-pointer"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Status bar */}
      <div
        className={`px-3 py-1 text-[10px] font-medium ${
          isOnline
            ? "bg-green-900 bg-opacity-40 text-green-300"
            : "bg-red-900 bg-opacity-40 text-red-300"
        }`}
      >
        {isOnline
          ? "Back online — ready to sync"
          : "You are offline — changes are saved locally"}
      </div>

      {/* Change list */}
      {count > 0 ? (
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
          {pendingChanges.map((change) => (
            <div
              key={change.id}
              className="flex flex-col bg-neutral-800 bg-opacity-60 rounded px-2 py-1.5 text-xs gap-1"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium leading-tight">{change.label}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`${METHOD_COLORS[change.method] || "bg-gray-600"} text-white text-[9px] font-bold px-1 py-px rounded`}
                    >
                      {change.method}
                    </span>
                    <span className="text-red-400 text-[10px]">
                      {getEndpoint(change.url)}
                    </span>
                  </div>
                  <p className="text-red-400 text-[10px] mt-0.5">
                    {formatTime(change.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 pt-0.5">
                  <button
                    onClick={() => handleSaveOne(change)}
                    disabled={!isOnline}
                    className="text-green-400 hover:text-green-300 text-[10px] font-semibold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Sync
                  </button>
                  <button
                    onClick={() => handleDismissOne(change)}
                    className="text-red-400 hover:text-red-300 text-[10px] cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 text-center text-red-300 text-xs">
          No pending changes
        </div>
      )}

      {/* Footer */}
      {count > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-red-800">
          <button
            onClick={handleSaveAll}
            disabled={saving || !isOnline}
            className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold py-1.5 rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {saving ? "Syncing..." : "Sync All"}
          </button>
          <button
            onClick={handleDiscardAll}
            className="text-red-400 hover:text-red-300 text-[10px] cursor-pointer"
          >
            Discard All
          </button>
        </div>
      )}
    </div>
  );
};

export default OfflineToast;
