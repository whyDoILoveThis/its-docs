"use client";
import React, { useEffect, useRef, useState } from "react";
import { v4 } from "uuid";
import {
  getAllCachedProjects,
  getCachedProject,
  cacheProject,
  updateCachedProject,
} from "@/lib/offlineDB";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ItsConfirmProvider";
import CloseIcon from "@/components/icons/CloseIcon";
import LoaderSpinSmall from "@/components/LoaderSpinSmall";
import { useAuth } from "@clerk/nextjs";
import { useOfflineFetch } from "@/hooks/useOfflineFetch";
import { useOfflineStore } from "@/hooks/useOfflineStore";
import { hasPasskey, verifyPasskey } from "@/lib/passkey";

type ModalView = null | "export" | "import";
type ImportMode = null | "new" | "local" | "update";

interface ProjectBackup {
  projectUid: string;
  snapshot: Project;
}

/** Recursively strip _id / __v from imported MongoDB JSON */
function stripMongoMeta(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(stripMongoMeta);
  if (obj && typeof obj === "object") {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, __v, ...rest } = obj as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(rest).map(([k, v]) => [k, stripMongoMeta(v)]),
    );
  }
  return obj;
}

const ProjectExportImport = ({
  onClose,
  initialView,
}: {
  onClose: () => void;
  initialView: ModalView;
}) => {
  const { toast } = useToast();
  const { ItsConfirm } = useConfirm();
  const { userId } = useAuth();
  const { offlineFetch } = useOfflineFetch();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<ModalView>(initialView);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Import state
  const [importedProject, setImportedProject] = useState<Project | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>(null);
  const [targetProject, setTargetProject] = useState<Project | null>(null);
  const [backup, setBackup] = useState<ProjectBackup | null>(null);
  const [importApplied, setImportApplied] = useState(false);
  const [fileName, setFileName] = useState("");
  const [savingImport, setSavingImport] = useState(false);
  const [savingUid, setSavingUid] = useState<string | null>(null);

  // Passkey state
  const [needsPasskey, setNeedsPasskey] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<Project | null>(null);
  const [passkeyInput, setPasskeyInput] = useState("");
  const [passkeyError, setPasskeyError] = useState("");

  useEffect(() => {
    if (view === "export" || (view === "import" && importMode === "update")) {
      loadProjects();
    }
  }, [view, importMode]);

  const loadProjects = async () => {
    setLoadingProjects(true);
    const cached = await getAllCachedProjects();
    setProjects(cached);
    setLoadingProjects(false);
  };

  // ── Export ────────────────────────────────────
  const handleExport = async (proj: Project) => {
    const fresh = await getCachedProject(proj.uid);
    const data = fresh || proj;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.title.replace(/[^a-zA-Z0-9_-]/g, "_")}_export.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: `Exported "${data.title}"`, variant: "green" });
    onClose();
  };

  // ── Import: file read ────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!parsed || typeof parsed !== "object" || !parsed.title) {
          toast({ title: "Invalid project JSON", variant: "red" });
          return;
        }
        const cleaned = stripMongoMeta(parsed) as Project;
        setImportedProject(cleaned);
        setImportMode(null);
        setTargetProject(null);
        setBackup(null);
        setImportApplied(false);
        setNeedsPasskey(false);
        setPendingTarget(null);
        setPasskeyInput("");
        setPasskeyError("");
      } catch {
        toast({ title: "Failed to parse JSON file", variant: "red" });
      }
    };
    reader.readAsText(file);

    // Reset so same file can be re-selected
    e.target.value = "";
  };

  // ── Import as new project ────────────────────
  const handleImportAsNew = async () => {
    if (!importedProject) return;
    setImportMode("new");
    setSavingImport(true);
    const newProject: Project = {
      ...importedProject,
      uid: v4(),
      creatorUid: userId || undefined,
    };

    if (userId) {
      // Signed in → persist to DB
      try {
        await offlineFetch({
          label: `Import project "${newProject.title}"`,
          method: "POST",
          url: "/api/addProject",
          body: { project: newProject },
        });
      } catch (err) {
        console.error("DB save failed, saved locally only:", err);
      }
    }

    // Always cache in IDB
    await cacheProject(newProject);
    useOfflineStore.getState().bumpCacheRevision();
    setSavingImport(false);
    toast({
      title: userId
        ? `Imported "${newProject.title}" to your projects`
        : `Imported "${newProject.title}" locally`,
      variant: "green",
    });
    onClose();
  };

  // ── Import local only (IDB, no DB) ───────────
  const handleImportLocalOnly = async () => {
    if (!importedProject) return;
    setImportMode("local");
    setSavingImport(true);
    const newProject: Project = {
      ...importedProject,
      uid: v4(),
      creatorUid: undefined,
    };
    await cacheProject(newProject);
    useOfflineStore.getState().bumpCacheRevision();
    setSavingImport(false);
    toast({
      title: `Imported "${newProject.title}" locally`,
      variant: "green",
    });
    onClose();
  };

  // ── Import as update: pick target ────────────
  const handleSelectUpdateTarget = async (proj: Project) => {
    if (!importedProject) return;
    setSavingUid(proj.uid);
    const projHasPasskey = await hasPasskey(proj.uid);
    if (projHasPasskey) {
      setPendingTarget(proj);
      setNeedsPasskey(true);
      setSavingUid(null);
      return;
    }
    await applyUpdate(proj);
    setSavingUid(null);
  };

  const handlePasskeySubmit = async () => {
    if (!pendingTarget) return;
    setPasskeyError("");
    const valid = await verifyPasskey(pendingTarget.uid, passkeyInput);
    if (valid) {
      setNeedsPasskey(false);
      setPasskeyInput("");
      await applyUpdate(pendingTarget);
    } else {
      setPasskeyError("Incorrect passkey");
    }
  };

  const applyUpdate = async (proj: Project) => {
    if (!importedProject) return;
    setSavingImport(true);
    const current = await getCachedProject(proj.uid);
    if (!current) {
      toast({ title: "Could not read project from cache", variant: "red" });
      setSavingImport(false);
      return;
    }
    setBackup({ projectUid: proj.uid, snapshot: structuredClone(current) });
    setTargetProject(proj);

    const updatedData: Project = {
      ...importedProject,
      uid: proj.uid,
      creatorUid: proj.creatorUid,
    };

    // Update IDB cache
    await updateCachedProject(proj.uid, () => updatedData);

    // If signed in and project has a creator → persist to DB
    if (userId && proj.creatorUid) {
      try {
        const {
          birth,
          title,
          desc,
          logoUrl,
          githubOwner,
          githubRepo,
          docs,
          pdmDiagrams,
        } = importedProject;
        await offlineFetch({
          label: `Import update "${proj.title}"`,
          method: "PUT",
          url: "/api/updateProject",
          body: {
            projUid: proj.uid,
            updates: {
              birth,
              title,
              desc,
              logoUrl,
              githubOwner,
              githubRepo,
              docs,
              pdmDiagrams,
            },
          },
        });
      } catch (err) {
        console.error("DB update failed, local cache updated:", err);
      }
    }

    useOfflineStore.getState().bumpCacheRevision();
    setSavingImport(false);
    setImportApplied(true);
    toast({ title: `Preview applied — confirm or undo`, variant: "blue" });
  };

  // ── Confirm update ──────────────────────────
  const handleConfirmUpdate = () => {
    setBackup(null);
    toast({
      title: `Import confirmed for "${targetProject?.title}"`,
      variant: "green",
    });
    onClose();
  };

  // ── Undo update ─────────────────────────────
  const handleUndoUpdate = async () => {
    if (!backup) return;
    const confirmed = await ItsConfirm(
      "Undo the import and restore the previous version?",
    );
    if (!confirmed) return;
    setSavingImport(true);

    // Restore IDB cache
    await cacheProject(backup.snapshot);

    // Restore DB if applicable
    if (userId && backup.snapshot.creatorUid) {
      try {
        const {
          birth,
          title,
          desc,
          logoUrl,
          githubOwner,
          githubRepo,
          docs,
          pdmDiagrams,
        } = backup.snapshot;
        await offlineFetch({
          label: `Undo import for "${backup.snapshot.title}"`,
          method: "PUT",
          url: "/api/updateProject",
          body: {
            projUid: backup.projectUid,
            updates: {
              birth,
              title,
              desc,
              logoUrl,
              githubOwner,
              githubRepo,
              docs,
              pdmDiagrams,
            },
          },
        });
      } catch (err) {
        console.error("DB restore failed:", err);
      }
    }

    useOfflineStore.getState().bumpCacheRevision();
    setSavingImport(false);
    setBackup(null);
    setImportApplied(false);
    setTargetProject(null);
    setNeedsPasskey(false);
    setPendingTarget(null);
    toast({ title: "Import undone — project restored", variant: "blue" });
  };

  // ── Render helpers ──────────────────────────
  const renderProjectList = (onSelect: (p: Project) => void) => {
    if (loadingProjects) {
      return <p className="text-sm text-slate-400 p-2">Loading projects...</p>;
    }
    if (projects.length === 0) {
      return (
        <p className="text-sm text-slate-400 p-2">
          No cached projects found. Visit a project page first to cache it.
        </p>
      );
    }
    return (
      <ul className="flex flex-col gap-1 max-h-60 overflow-y-auto">
        {projects.map((p) => (
          <li key={p.uid}>
            <button
              onClick={() => onSelect(p)}
              className="btn btn-ghost !w-full text-sm cursor-pointer flex items-center justify-center"
              disabled={savingImport}
            >
              {savingUid === p.uid ? <LoaderSpinSmall /> : p.title}
            </button>
          </li>
        ))}
      </ul>
    );
  };

  // ── Modal content ────────────────────────────
  const renderContent = () => {
    // Step 1: choose export or import
    if (!view) {
      return (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setView("export")}
            className="btn btn-blue text-sm"
          >
            Export Project JSON
          </button>
          <button
            onClick={() => setView("import")}
            className="btn btn-green text-sm"
          >
            Import Project JSON
          </button>
        </div>
      );
    }

    // ── EXPORT: pick a project ──────────────────
    if (view === "export") {
      return (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-300">
            Select a project to export
          </h3>
          {renderProjectList(handleExport)}
        </div>
      );
    }

    // ── IMPORT ──────────────────────────────────
    if (view === "import") {
      // Passkey prompt
      if (needsPasskey) {
        return (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-300">
              <b>{pendingTarget?.title}</b> is protected by a passkey.
            </p>
            <input
              type="password"
              placeholder="Passkey"
              value={passkeyInput}
              onChange={(e) => setPasskeyInput(e.target.value)}
              className="input"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handlePasskeySubmit()}
            />
            {passkeyError && (
              <p className="text-red-400 text-xs">{passkeyError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handlePasskeySubmit}
                className="btn btn-blue text-sm flex-1 cursor-pointer flex items-center justify-center"
                disabled={savingImport}
              >
                {savingImport ? <LoaderSpinSmall /> : "Unlock"}
              </button>
              <button
                onClick={() => {
                  setNeedsPasskey(false);
                  setPendingTarget(null);
                  setPasskeyInput("");
                  setPasskeyError("");
                }}
                className="btn btn-ghost text-sm flex-1 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      }

      // After update applied — confirm / undo
      if (importApplied && backup) {
        return (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-300">
              Import applied to <b>{targetProject?.title}</b>. Confirm to keep
              or undo to restore.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmUpdate}
                className="btn btn-green text-sm flex-1 cursor-pointer flex items-center justify-center"
                disabled={savingImport}
              >
                {savingImport ? <LoaderSpinSmall /> : "Confirm"}
              </button>
              <button
                onClick={handleUndoUpdate}
                className="btn btn-red text-sm flex-1 cursor-pointer"
                disabled={savingImport}
              >
                {savingImport ? "Restoring..." : "Undo"}
              </button>
            </div>
          </div>
        );
      }

      // Choose update target
      if (importedProject && importMode === "update") {
        return (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-slate-300">
              Select project to update with &quot;{importedProject.title}&quot;
            </h3>
            {renderProjectList(handleSelectUpdateTarget)}
          </div>
        );
      }

      // Choose import mode
      if (importedProject && !importMode) {
        return (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-300">
              Loaded: <b>{importedProject.title}</b>
              {importedProject.docs?.length
                ? ` — ${importedProject.docs.length} doc(s)`
                : ""}
              {importedProject.pdmDiagrams?.length
                ? `, ${importedProject.pdmDiagrams.length} diagram(s)`
                : ""}
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  onClick={handleImportAsNew}
                  className="btn btn-blue text-sm flex-1 cursor-pointer flex items-center justify-center"
                  disabled={savingImport}
                >
                  {savingImport && importMode === "new" ? (
                    <LoaderSpinSmall />
                  ) : (
                    "Import as New"
                  )}
                </button>
                <button
                  onClick={() => setImportMode("update")}
                  className="btn btn-yellow text-sm flex-1 cursor-pointer flex items-center justify-center"
                  disabled={savingImport}
                >
                  Update Existing
                </button>
              </div>
              <button
                onClick={handleImportLocalOnly}
                className="btn btn-ghost text-sm cursor-pointer flex items-center justify-center"
                disabled={savingImport}
              >
                {savingImport && importMode === "local" ? (
                  <LoaderSpinSmall />
                ) : (
                  "Import Local Only"
                )}
              </button>
            </div>
          </div>
        );
      }

      // File picker
      return (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-300">
            Select a project JSON file
          </h3>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-ghost text-sm cursor-pointer border border-dashed border-slate-600 py-4"
          >
            {fileName || "Choose file..."}
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="fixed inset-0 zz-top-plus2 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-slate-700 rounded-lg shadow-2xl w-80 max-w-[90vw] p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-white">
            {view === "export"
              ? "Export Project"
              : view === "import"
                ? "Import Project"
                : "Export / Import"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            <CloseIcon />
          </button>
        </div>
        {renderContent()}
      </div>
    </div>
  );
};

export default ProjectExportImport;
