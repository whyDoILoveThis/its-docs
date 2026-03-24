"use client";
import React, { useEffect, useState } from "react";
import { v4 } from "uuid";
import {
  getAllCachedProjects,
  getCachedProject,
  cacheProject,
  updateCachedProject,
  removeCachedProject,
} from "@/lib/offlineDB";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ItsConfirmProvider";
import CloseIcon from "@/components/icons/CloseIcon";
import PlusIcon from "@/components/icons/PlusIcon";
import TrashIcon from "@/components/icons/TrashIcon";
import TextIcon from "@/components/icons/TextIcon";
import PaintbrushIcon from "@/components/icons/PaintbrushIcon";
import ItsCode from "@/components/ItsCode";
import ItsDropdown from "@/components/ItsDropdown";
import docItemStyles from "@/components/Doc/docItemStyles";
import Image from "next/image";
import { getImageSrc } from "@/lib/supabaseStorage";

interface Props {
  onClose: () => void;
}

type View =
  | { kind: "list" }
  | { kind: "project"; project: Project }
  | { kind: "doc"; project: Project; docUid: string };

const LocalProjectsViewer = ({ onClose }: Props) => {
  const { toast } = useToast();
  const { ItsConfirm } = useConfirm();
  const [projects, setProjects] = useState<Project[]>([]);
  const [view, setView] = useState<View>({ kind: "list" });
  const [loading, setLoading] = useState(true);

  // Doc editing
  const [editMode, setEditMode] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [localDocItems, setLocalDocItems] = useState<DocItem[]>([]);
  const [localDoc, setLocalDoc] = useState<Doc | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [textEditIndex, setTextEditIndex] = useState(-1);
  const [dirty, setDirty] = useState(false);

  // Add item
  const [newItemText, setNewItemText] = useState("");
  const [newItemStyle, setNewItemStyle] = useState("btn-blue");

  // Add doc
  const [addingDoc, setAddingDoc] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");

  // New project
  const [addingProject, setAddingProject] = useState(false);
  const [newProjTitle, setNewProjTitle] = useState("");

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    setProjects(await getAllCachedProjects());
    setLoading(false);
  };

  const openProject = async (proj: Project) => {
    const fresh = (await getCachedProject(proj.uid)) || proj;
    setView({ kind: "project", project: fresh });
    setAddingDoc(false);
  };

  const openDoc = (project: Project, docUid: string) => {
    const doc = project.docs?.find((d) => d.uid === docUid);
    if (!doc) return;
    setView({ kind: "doc", project, docUid });
    setLocalDoc({ ...doc });
    setLocalDocItems(doc.docItems ? [...doc.docItems] : []);
    resetModes();
  };

  const resetModes = () => {
    setEditMode(false);
    setMoveMode(false);
    setAddMode(false);
    setDirty(false);
    setSelectedIndex(-1);
    setTextEditIndex(-1);
  };

  const goBack = async () => {
    if (view.kind === "doc") {
      if (dirty) {
        const ok = await ItsConfirm("Discard unsaved changes?");
        if (!ok) return;
      }
      const fresh = await getCachedProject(view.project.uid);
      setView({ kind: "project", project: fresh || view.project });
      resetModes();
    } else if (view.kind === "project") {
      setView({ kind: "list" });
      loadProjects();
    }
  };

  // ── Save ──
  const saveDoc = async () => {
    if (view.kind !== "doc" || !localDoc) return;
    const updated = await updateCachedProject(view.project.uid, (p) => ({
      ...p,
      docs: p.docs?.map((d) =>
        d.uid === view.docUid ? { ...localDoc, docItems: localDocItems } : d,
      ),
    }));
    if (updated) {
      setView({ kind: "doc", project: updated, docUid: view.docUid });
      setDirty(false);
      toast({ title: "Saved", variant: "green" });
    }
  };

  // ── Project ops ──
  const handleDeleteProject = async (p: Project) => {
    const ok = await ItsConfirm(`Remove "${p.title}" from local storage?`);
    if (!ok) return;
    await removeCachedProject(p.uid);
    toast({ title: `Removed "${p.title}"`, variant: "blue" });
    loadProjects();
  };

  const handleNewProject = async () => {
    if (!newProjTitle.trim()) return;
    const proj: Project = {
      uid: v4(),
      birth: new Date(),
      title: newProjTitle.trim(),
      docs: [],
      pdmDiagrams: [],
    };
    await cacheProject(proj);
    setNewProjTitle("");
    setAddingProject(false);
    toast({ title: `Created "${proj.title}"`, variant: "green" });
    loadProjects();
  };

  const handleAddDoc = async () => {
    if (view.kind !== "project" || !newDocTitle.trim()) return;
    const doc: Doc = {
      uid: v4(),
      title: newDocTitle.trim(),
      tagline: "",
      desc: "",
      docItems: [],
    };
    const updated = await updateCachedProject(view.project.uid, (p) => ({
      ...p,
      docs: [...(p.docs || []), doc],
    }));
    if (updated) {
      setView({ kind: "project", project: updated });
      setNewDocTitle("");
      setAddingDoc(false);
      toast({ title: `Added "${doc.title}"`, variant: "green" });
    }
  };

  const handleDeleteDoc = async (docUid: string) => {
    if (view.kind !== "project") return;
    const docTitle = view.project.docs?.find((d) => d.uid === docUid)?.title;
    const ok = await ItsConfirm(`Delete "${docTitle}"?`);
    if (!ok) return;
    const updated = await updateCachedProject(view.project.uid, (p) => ({
      ...p,
      docs: p.docs?.filter((d) => d.uid !== docUid),
    }));
    if (updated) {
      setView({ kind: "project", project: updated });
      toast({ title: "Doc deleted", variant: "blue" });
    }
  };

  // ── Item ops ──
  const moveUp = (i: number) => {
    if (i === 0) return;
    const items = [...localDocItems];
    [items[i - 1], items[i]] = [items[i], items[i - 1]];
    setLocalDocItems(items);
    setDirty(true);
  };

  const moveDown = (i: number) => {
    if (i >= localDocItems.length - 1) return;
    const items = [...localDocItems];
    [items[i], items[i + 1]] = [items[i + 1], items[i]];
    setLocalDocItems(items);
    setDirty(true);
  };

  const deleteItem = (i: number) => {
    setLocalDocItems((prev) => prev.filter((_, idx) => idx !== i));
    setSelectedIndex(-1);
    setTextEditIndex(-1);
    setDirty(true);
  };

  const updateText = (i: number, text: string) => {
    setLocalDocItems((prev) =>
      prev.map((item, idx) => (idx === i ? { ...item, text } : item)),
    );
    setDirty(true);
  };

  const updateStyle = (i: number, style: string) => {
    setLocalDocItems((prev) =>
      prev.map((item, idx) => (idx === i ? { ...item, style } : item)),
    );
    setDirty(true);
  };

  const addItem = () => {
    if (!newItemText.trim() && newItemStyle !== "pic") return;
    setLocalDocItems((prev) => [
      ...prev,
      { uid: v4(), style: newItemStyle, text: newItemText },
    ]);
    setNewItemText("");
    setDirty(true);
  };

  // ── Render item ──
  const renderItem = (item: DocItem, index: number) => {
    const isSection = item.style === "text-xl font-bold ";
    const isCode = item.style === "code";
    const isPic = item.style === "pic";
    const isSelected = editMode && selectedIndex === index;
    const isTextEdit = textEditIndex === index;

    return (
      <div key={item.uid + index} className="mb-3 w-full max-w-[500px]">
        <div className="flex flex-col items-center">
          {/* Item display */}
          {isPic ? (
            <span
              onClick={() => editMode && setSelectedIndex(index)}
              className={editMode ? "cursor-pointer" : ""}
            >
              <Image
                className="rounded-md"
                width={500}
                height={500}
                src={getImageSrc(item.text)}
                alt="pic"
              />
            </span>
          ) : isCode ? (
            isTextEdit ? (
              <div className="w-full">
                <ItsCode code={item.text} lang="tsx" />
                <textarea
                  className="input w-full mt-1"
                  defaultValue={item.text}
                  autoFocus
                  onChange={(e) => updateText(index, e.target.value)}
                />
              </div>
            ) : (
              <span
                onClick={() => {
                  if (editMode) {
                    setSelectedIndex(index);
                    setTextEditIndex(-1);
                  }
                }}
                className={editMode ? "cursor-pointer" : ""}
              >
                <ItsCode code={item.text} lang="tsx" />
              </span>
            )
          ) : isTextEdit ? (
            <input
              type="text"
              defaultValue={item.text}
              autoFocus
              onChange={(e) => updateText(index, e.target.value)}
              className={`btn btn-nohover focus:outline-none focus:ring-2 focus:ring-slate-300 ${
                !isSection && item.style
              } ${
                isSection &&
                "!border-none !bg-transparent text-center leading-none mt-6"
              } !w-full !max-w-[500px]`}
            />
          ) : (
            <div
              onClick={() => {
                if (editMode) {
                  setSelectedIndex(index);
                  setTextEditIndex(-1);
                }
              }}
              className={`btn btn-nohover ${!isCode && !isSection && item.style} ${
                isSection &&
                "!border-none !bg-transparent text-center leading-none mt-6"
              } ${
                editMode ? "!cursor-pointer" : "!cursor-default"
              } !w-full !max-w-[500px]`}
            >
              <p>{item.text}</p>
            </div>
          )}

          {isSection && !isTextEdit && (
            <div className="flex items-center w-full">
              <div className="w-3 h-3 bg-white rounded-sm" />
              <div className="h-[2px] w-full bg-white" />
              <div className="w-3 h-3 bg-white rounded-sm" />
            </div>
          )}

          {/* Edit controls */}
          {isSelected && (
            <div className="flex justify-between rounded-t-none pt-3 -translate-y-1 border-t-0 gap-2 p-2 w-full border rounded-lg">
              <button
                onClick={() => deleteItem(index)}
                className="btn btn-round btn-ghost btn-red cursor-pointer"
              >
                <TrashIcon />
              </button>
              <div className="flex gap-2 items-center">
                {!isPic && (
                  <button
                    className="btn btn-ghost text-nowrap cursor-pointer"
                    onClick={() => setTextEditIndex(isTextEdit ? -1 : index)}
                  >
                    {isTextEdit ? "done" : <TextIcon />}
                  </button>
                )}
                <ItsDropdown
                  closeWhenClicked={true}
                  btnChildren={<PaintbrushIcon />}
                  btnClassNames="btn btn-ghost btn-round"
                  menuClassNames="-translate-x-16"
                >
                  <div className="flex flex-col gap-2">
                    {docItemStyles.map((s, i) => (
                      <li
                        key={i}
                        className={`btn btn-xs btn-squish ${
                          s.text !== "Section" && s.text !== "Code" && s.color
                        } ${
                          s.text === "Code" &&
                          "!border-purple-500 !text-purple-200"
                        } !border-opacity-75 backdrop-blur-md`}
                        style={{ width: "100%" }}
                        onClick={() => updateStyle(index, s.color)}
                      >
                        {s.text}
                      </li>
                    ))}
                  </div>
                </ItsDropdown>
              </div>
            </div>
          )}

          {/* Move controls */}
          {moveMode && (
            <div className="flex rounded-t-none pt-3 -translate-y-1 border-t-0 gap-2 p-2 w-full border rounded-lg">
              <button
                className="btn btn-round btn-ghost"
                onClick={() => moveUp(index)}
                disabled={index === 0}
              >
                ↑
              </button>
              <button
                className="btn btn-round btn-ghost"
                onClick={() => moveDown(index)}
                disabled={index >= localDocItems.length - 1}
              >
                ↓
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 zz-top-plus2 bg-neutral-950 overflow-y-auto">
      {/* ── LIST ── */}
      {view.kind === "list" && (
        <div className="max-w-md mx-auto p-4 pt-16">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Local Projects</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <CloseIcon />
            </button>
          </div>
          {loading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : projects.length === 0 ? (
            <p className="text-sm text-slate-400">No cached projects.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {projects.map((p) => (
                <li key={p.uid} className="flex items-center gap-2">
                  <button
                    onClick={() => openProject(p)}
                    className="btn btn-ghost !w-full text-left text-sm cursor-pointer flex-1"
                  >
                    <span>{p.title}</span>
                    <span className="text-xs text-slate-500 ml-2">
                      {p.docs?.length || 0} doc(s)
                    </span>
                  </button>
                  <button
                    onClick={() => handleDeleteProject(p)}
                    className="btn btn-ghost btn-round btn-red text-xs cursor-pointer shrink-0"
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <button
              onClick={() => setAddingProject(!addingProject)}
              className="btn btn-outline btn-sm cursor-pointer"
            >
              {addingProject ? "Cancel" : "+ New Project"}
            </button>
            {addingProject && (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  placeholder="Project title"
                  value={newProjTitle}
                  onChange={(e) => setNewProjTitle(e.target.value)}
                  className="input flex-1"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleNewProject()}
                />
                <button
                  onClick={handleNewProject}
                  className="btn btn-green btn-sm cursor-pointer"
                >
                  Create
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PROJECT ── */}
      {view.kind === "project" && (
        <div className="max-w-md mx-auto p-4 pt-16">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={goBack}
              className="btn btn-outline btn-sm btn-squish cursor-pointer"
            >
              Back
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <CloseIcon />
            </button>
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">
            {view.project.title}
          </h2>
          {view.project.desc && (
            <p className="text-slate-400 text-sm mb-4">{view.project.desc}</p>
          )}
          <h3 className="text-xs text-slate-500 uppercase tracking-widest mb-2">
            Docs
          </h3>
          {view.project.docs && view.project.docs.length > 0 ? (
            <ul className="flex flex-col gap-2 mb-4">
              {view.project.docs.map((doc) => (
                <li key={doc.uid} className="flex items-center gap-2">
                  <button
                    onClick={() => openDoc(view.project, doc.uid)}
                    className="btn btn-ghost !w-full text-left text-sm cursor-pointer flex-1"
                  >
                    {doc.title}
                    <span className="text-xs text-slate-500 ml-2">
                      {doc.docItems?.length || 0} item(s)
                    </span>
                  </button>
                  <button
                    onClick={() => handleDeleteDoc(doc.uid)}
                    className="btn btn-ghost btn-round btn-red text-xs cursor-pointer shrink-0"
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400 mb-4">No docs yet.</p>
          )}
          <button
            onClick={() => setAddingDoc(!addingDoc)}
            className="btn btn-outline btn-sm cursor-pointer"
          >
            {addingDoc ? "Cancel" : "+ Add Doc"}
          </button>
          {addingDoc && (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                placeholder="Doc title"
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                className="input flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleAddDoc()}
              />
              <button
                onClick={handleAddDoc}
                className="btn btn-green btn-sm cursor-pointer"
              >
                Add
              </button>
            </div>
          )}
          {view.project.pdmDiagrams && view.project.pdmDiagrams.length > 0 && (
            <>
              <h3 className="text-xs text-slate-500 uppercase tracking-widest mt-6 mb-2">
                Diagrams
              </h3>
              <ul className="flex flex-col gap-2">
                {view.project.pdmDiagrams.map((d) => (
                  <li key={d.uid} className="btn btn-ghost text-sm">
                    {d.title}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* ── DOC ── */}
      {view.kind === "doc" && (
        <div className="max-w-lg mx-auto p-4 pt-16 pb-32">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={goBack}
              className="btn btn-outline btn-sm btn-squish cursor-pointer"
            >
              Back
            </button>
            <div className="flex gap-1 items-center">
              <ItsDropdown
                closeWhenClicked={true}
                btnText="Settings"
                btnClassNames="btn btn-outline btn-sm btn-squish"
                menuClassNames="-translate-x-20"
              >
                <li
                  onClick={() => {
                    setEditMode(!editMode);
                    setMoveMode(false);
                    setAddMode(false);
                    setSelectedIndex(-1);
                    setTextEditIndex(-1);
                  }}
                  className={`btn btn-ghost !w-full text-sm ${
                    moveMode && "blur-sm"
                  }`}
                >
                  {editMode ? "Exit Edit" : "Edit"}
                </li>
                <li
                  onClick={() => {
                    setMoveMode(!moveMode);
                    setEditMode(false);
                    setAddMode(false);
                    setSelectedIndex(-1);
                    setTextEditIndex(-1);
                  }}
                  className={`btn btn-ghost !w-full text-sm ${
                    editMode && "blur-sm"
                  }`}
                >
                  {moveMode ? "Exit Move" : "Move"}
                </li>
                <li
                  onClick={() => {
                    setAddMode(!addMode);
                    setEditMode(false);
                    setMoveMode(false);
                    setSelectedIndex(-1);
                    setTextEditIndex(-1);
                  }}
                  className={`btn btn-ghost !w-full text-sm ${
                    (editMode || moveMode) && "blur-sm"
                  }`}
                >
                  {addMode ? "Read Only" : "Add"}
                </li>
              </ItsDropdown>
              <button
                onClick={async () => {
                  if (dirty) {
                    const ok = await ItsConfirm("Discard unsaved changes?");
                    if (!ok) return;
                  }
                  onClose();
                }}
                className="text-slate-400 hover:text-white cursor-pointer ml-2"
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          {/* Doc header */}
          <h2 className="text-xl font-bold text-white">{localDoc?.title}</h2>
          {localDoc?.tagline && (
            <p className="text-slate-400 text-sm">{localDoc.tagline}</p>
          )}
          {localDoc?.desc && (
            <p className="text-slate-400 text-sm mb-2">{localDoc.desc}</p>
          )}

          {/* Edit doc metadata */}
          {editMode && (
            <div className="flex flex-col gap-2 border border-slate-700 rounded-lg p-3 my-3">
              <label className="text-xs text-slate-500">Title</label>
              <input
                type="text"
                value={localDoc?.title || ""}
                onChange={(e) => {
                  setLocalDoc((prev) =>
                    prev ? { ...prev, title: e.target.value } : prev,
                  );
                  setDirty(true);
                }}
                className="input"
              />
              <label className="text-xs text-slate-500">Tagline</label>
              <input
                type="text"
                value={localDoc?.tagline || ""}
                onChange={(e) => {
                  setLocalDoc((prev) =>
                    prev ? { ...prev, tagline: e.target.value } : prev,
                  );
                  setDirty(true);
                }}
                className="input"
              />
            </div>
          )}

          {/* Doc items */}
          <div className="flex flex-col items-center mt-4">
            {localDocItems.map((item, i) => renderItem(item, i))}
          </div>

          {/* Add item form */}
          {addMode && (
            <div className="fixed bottom-0 left-0 right-0 bg-black bg-opacity-80 backdrop-blur-sm p-3 flex flex-col items-center gap-2 zz-top-plus2">
              <div className="flex gap-1 flex-wrap justify-center">
                {docItemStyles
                  .filter((s) => s.text !== "Pic")
                  .map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setNewItemStyle(s.color)}
                      className={`btn btn-xs btn-squish ${
                        s.text !== "Section" && s.text !== "Code" && s.color
                      } ${
                        s.text === "Code" &&
                        "!border-purple-500 !text-purple-200"
                      } ${
                        s.color === newItemStyle ? "opacity-100" : "opacity-60"
                      } !border-opacity-75`}
                    >
                      {s.text}
                    </button>
                  ))}
              </div>
              <div className="flex gap-2 items-center w-full max-w-[400px]">
                {newItemStyle === "code" ? (
                  <textarea
                    className="input flex-1"
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    placeholder="Code..."
                  />
                ) : (
                  <input
                    type="text"
                    className="input flex-1"
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    placeholder="Text..."
                    onKeyDown={(e) => e.key === "Enter" && addItem()}
                  />
                )}
                <button
                  onClick={addItem}
                  className={`btn btn-round ${newItemStyle && newItemStyle} text-xl cursor-pointer`}
                >
                  <PlusIcon />
                </button>
              </div>
            </div>
          )}

          {/* Save button */}
          {dirty && (
            <button
              onClick={saveDoc}
              className={`btn btn-green fixed left-4 backdrop-blur-md z-10 cursor-pointer ${
                addMode ? "bottom-28" : "bottom-4"
              }`}
            >
              Save Changes
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default LocalProjectsViewer;
