"use client";
import axios from "axios";
import React, { useEffect, useState } from "react";
import DeleteProjectBtn from "@/components/Project/DeleteProjectBtn";
import LoaderSpinSmall from "@/components/LoaderSpinSmall";
import ItsDropdown from "@/components/ItsDropdown";
import CloseIcon from "@/components/icons/CloseIcon";
import PlusIcon from "@/components/icons/PlusIcon";
import AddDocForm from "@/components/Doc/AddDocForm";
import DocLink from "@/components/Project/DocLink";
import Doc from "@/components/Doc/Doc";
import itsDateStringNames from "@/lib/itsDateStringNames";
import UpdateProjectForm from "@/components/Project/UpdateProjForm";
import EditIcon from "@/components/icons/EditIcon";
import { useAuth } from "@clerk/nextjs";
import Image from "next/image";
import MockImage from "@/components/icons/MockImage";
import { getImageSrc } from "@/lib/supabaseStorage";
import AiDocForm from "@/components/Doc/AiDocForm";
import GitHubImportForm from "@/components/Doc/GitHubImportForm";
import EyeIcon from "@/components/icons/EyeIcon";
import PDMLink from "@/components/Project/PDMLink";
import PDMDiagram from "@/components/Project/PDMDiagram";
import AddPDMForm from "@/components/Project/AddPDMForm";
import PasskeyModal from "@/components/Project/PasskeyModal";
import { verifyPasskey, hasPasskey } from "@/lib/passkey";
import { IoLockClosedOutline, IoLockOpenOutline } from "react-icons/io5";
import { useOfflineFetch } from "@/hooks/useOfflineFetch";
import { useOfflineStore } from "@/hooks/useOfflineStore";
import {
  cacheProject,
  getCachedProject,
  updateCachedProject,
} from "@/lib/offlineDB";

const FETCH_TIMEOUT = 10_000;

interface Props {
  projUid: string;
}

const ProjectPage = ({ projUid }: Props) => {
  const { userId } = useAuth();
  const { offlineFetch } = useOfflineFetch();
  const goOffline = useOfflineStore((s) => s.goOffline);
  const cacheRevision = useOfflineStore((s) => s.cacheRevision);
  const [theProject, setTheProject] = useState<Project | null>(null);
  const [addingDoc, setAddingDoc] = useState(false);
  const [showAiForm, setShowAiForm] = useState(false);
  const [showGitHubImport, setShowGitHubImport] = useState(false);
  const [theMessage, setTheMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedUpdate, setSelectedUpdate] = useState(-999);
  const [localDocLinks, setLocalDocLinks] = useState<Doc[]>([]);
  const [showGitHubInfo, setShowGitHubInfo] = useState(false);
  const [selectedPDM, setSelectedPDM] = useState<PDMDiagram | null>(null);
  const [addingPDM, setAddingPDM] = useState(false);
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [passkeyUnlocked, setPasskeyUnlocked] = useState(false);
  const [showPasskeyPrompt, setShowPasskeyPrompt] = useState(false);
  const [passkeyInput, setPasskeyInput] = useState("");
  const [passkeyError, setPasskeyError] = useState("");
  const [projectHasPasskey, setProjectHasPasskey] = useState(false);

  const isOwner =
    (userId && userId === theProject?.creatorUid) || passkeyUnlocked;

  // Check if project has a passkey set
  useEffect(() => {
    hasPasskey(projUid).then(setProjectHasPasskey);
  }, [projUid]);

  const handlePasskeySubmit = async () => {
    setPasskeyError("");
    const valid = await verifyPasskey(projUid, passkeyInput);
    if (valid) {
      setPasskeyUnlocked(true);
      setShowPasskeyPrompt(false);
      setPasskeyInput("");
    } else {
      setPasskeyError("Incorrect passkey");
    }
  };

  useEffect(() => {
    if (theProject?.docs) {
      setLocalDocLinks(theProject.docs);
    }
  }, [theProject?.docs]);

  // Re-read from cache when a pending change is discarded (cacheRevision changes)
  useEffect(() => {
    if (cacheRevision === 0) return; // skip initial mount
    (async () => {
      const cached = await getCachedProject(projUid);
      if (cached) {
        setTheProject(cached);
        setSelectedDoc((prev) =>
          prev
            ? (cached.docs?.find((d: Doc) => d.uid === prev.uid) ?? null)
            : null,
        );
        setSelectedPDM((prev) =>
          prev
            ? (cached.pdmDiagrams?.find(
                (d: PDMDiagram) => d.uid === prev.uid,
              ) ?? null)
            : null,
        );
      }
    })();
  }, [cacheRevision, projUid]);

  const moveItemUp = (index: number) => {
    if (index === 0) return;
    const updatedItems = [...localDocLinks];
    [updatedItems[index - 1], updatedItems[index]] = [
      updatedItems[index],
      updatedItems[index - 1],
    ];
    setLocalDocLinks(updatedItems);
  };

  const moveItemDown = (index: number) => {
    if (index === localDocLinks.length - 1) return;
    const updatedItems = [...localDocLinks];
    [updatedItems[index], updatedItems[index + 1]] = [
      updatedItems[index + 1],
      updatedItems[index],
    ];
    setLocalDocLinks(updatedItems);
  };

  const saveReorderedDocs = async () => {
    setLoading(true);
    try {
      const result = await offlineFetch({
        label: "Reorder docs",
        method: "PUT",
        url: "/api/updateDocs",
        body: { projUid: theProject?.uid, docs: localDocLinks },
      });

      if (!result && theProject) {
        // Offline — optimistically update cache
        await updateCachedProject(theProject.uid, (p) => ({
          ...p,
          docs: localDocLinks,
        }));
      }

      setTheMessage(result?.data?.message || "Docs updated successfully!");
      refetchProject();
      setEditMode(false);
      setLoading(false);
    } catch (error) {
      console.error("Error saving reordered docs:", error);
      setTheMessage("Failed to save reordered docs. Please try again.");
      setLoading(false);
    }
  };

  const fetchProjectByUid = async (projUid: string) => {
    // If already known offline, skip network and use cache immediately
    const { isOnline } = useOfflineStore.getState();
    if (!isOnline) {
      const cached = await getCachedProject(projUid);
      if (cached) {
        setTheProject(cached);
        if (selectedDoc) {
          setSelectedDoc(
            cached.docs?.find((doc: Doc) => doc.uid === selectedDoc.uid) ||
              null,
          );
        }
        if (selectedPDM) {
          setSelectedPDM(
            cached.pdmDiagrams?.find(
              (d: PDMDiagram) => d.uid === selectedPDM.uid,
            ) || null,
          );
        }
        setTheMessage("Loaded from cache (offline)");
      }
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get(
        `/api/getProjectByUid?projUid=${projUid}`,
        { timeout: FETCH_TIMEOUT },
      );

      const project = response.data.project;
      const message = response.data.message;

      // Cache for offline use
      if (project) await cacheProject(project);

      setTheMessage(message);
      setTheProject(project);
      if (selectedDoc) {
        setSelectedDoc(
          project.docs.find((doc: Doc) => doc.uid === selectedDoc.uid) || null,
        );
      }
      if (selectedPDM) {
        setSelectedPDM(
          project.pdmDiagrams?.find(
            (d: PDMDiagram) => d.uid === selectedPDM.uid,
          ) || null,
        );
      }
      setEditMode(false);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching project:", error);
      goOffline();
      // Fall back to cached version
      const cached = await getCachedProject(projUid);
      if (cached) {
        setTheProject(cached);
        if (selectedDoc) {
          setSelectedDoc(
            cached.docs?.find((doc: Doc) => doc.uid === selectedDoc.uid) ||
              null,
          );
        }
        if (selectedPDM) {
          setSelectedPDM(
            cached.pdmDiagrams?.find(
              (d: PDMDiagram) => d.uid === selectedPDM.uid,
            ) || null,
          );
        }
        setTheMessage("Loaded from cache (offline)");
      }
      setLoading(false);
    }
  };

  // // Apply a local-only project update (for offline optimistic changes)
  // const applyLocalProjectUpdate = (updater: (project: Project) => Project) => {
  //   if (!theProject) return;
  //   const updated = updater(theProject);
  //   setTheProject(updated);
  //   cacheProject(updated); // fire-and-forget async
  //   if (selectedDoc) {
  //     setSelectedDoc(
  //       updated.docs?.find((doc: Doc) => doc.uid === selectedDoc.uid) || null,
  //     );
  //   }
  //   if (selectedPDM) {
  //     setSelectedPDM(
  //       updated.pdmDiagrams?.find(
  //         (d: PDMDiagram) => d.uid === selectedPDM.uid,
  //       ) || null,
  //     );
  //   }
  // };

  const refetchProject = async () => {
    // If offline, just reload from cache (instant, no spinner)
    const { isOnline } = useOfflineStore.getState();
    if (!isOnline) {
      const cached = await getCachedProject(projUid);
      if (cached) {
        setTheProject(cached);
        if (selectedDoc) {
          setSelectedDoc(
            cached.docs?.find((doc: Doc) => doc.uid === selectedDoc.uid) ||
              null,
          );
        }
        if (selectedPDM) {
          setSelectedPDM(
            cached.pdmDiagrams?.find(
              (d: PDMDiagram) => d.uid === selectedPDM.uid,
            ) || null,
          );
        }
      }
      return;
    }
    await fetchProjectByUid(projUid);
  };

  const refetchProjectForDocs = async () => {
    await refetchProject();
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight });
    }, 300);
  };

  useEffect(() => {
    fetchProjectByUid(projUid);
  }, [projUid]);

  console.log(theProject);

  if (loading)
    return (
      <div className="w-full flex justify-center">
        <LoaderSpinSmall />
      </div>
    );

  return (
    <div className="flex flex-col w-full items-center">
      {/* Passkey lock icon */}
      {projectHasPasskey &&
        !isOwner &&
        selectedDoc === null &&
        selectedPDM === null && (
          <button
            onClick={() => setShowPasskeyPrompt(true)}
            className="fixed top-14 right-2 zz-top-minus1 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer p-1"
            title="Unlock with passkey"
          >
            <IoLockClosedOutline className="text-lg" />
          </button>
        )}
      {isOwner &&
        passkeyUnlocked &&
        selectedDoc === null &&
        selectedPDM === null && (
          <button
            onClick={() => {
              setPasskeyUnlocked(false);
              setEditMode(false);
            }}
            className="fixed top-24 right-2 zz-top-minus1 text-green-500 hover:text-green-300 transition-colors cursor-pointer p-1"
            title="Lock (revoke passkey access)"
          >
            <IoLockOpenOutline className="text-lg" />
          </button>
        )}
      {/* Passkey prompt modal */}
      {showPasskeyPrompt && (
        <div
          className="fixed inset-0 zz-top bg-black bg-opacity-40 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => {
            setShowPasskeyPrompt(false);
            setPasskeyInput("");
            setPasskeyError("");
          }}
        >
          <div
            className="bg-white bg-opacity-10 backdrop-blur-md border border-slate-700 rounded-lg p-6 w-full max-w-xs flex flex-col gap-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">Enter Passkey</h2>
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
            <button
              onClick={handlePasskeySubmit}
              className="btn btn-blue w-full cursor-pointer"
            >
              Unlock
            </button>
          </div>
        </div>
      )}
      {selectedDoc === null && selectedPDM === null ? (
        <div className="w-full flex flex-col items-center">
          {isOwner && (
            <div className="w-fit place-self-end-fix px-2">
              <ItsDropdown
                closeWhenClicked={true}
                btnText="Settings"
                btnClassNames="btn zz-top-minus1 btn-outline 3xs:text-md sm:text-sm btn-squish text-shadow flex gap-1 items-center backdrop-blur-md"
                menuClassNames="-translate-x-20"
              >
                <li
                  className="btn btn-ghost !w-full"
                  onClick={() => {
                    setEditMode(!editMode);
                    if (editMode) {
                      setSelectedUpdate(-999);
                    }
                  }}
                >
                  {editMode ? "Exit Edit" : "Edit"}
                </li>
                <li
                  className="btn btn-ghost !w-full"
                  onClick={() => setShowPasskeyModal(true)}
                >
                  Passkey
                </li>
                <li className="btn btn-ghost btn-red !w-full">
                  <DeleteProjectBtn projUid={projUid} />
                </li>
              </ItsDropdown>
              {showPasskeyModal && (
                <PasskeyModal
                  projectUid={projUid}
                  onClose={() => setShowPasskeyModal(false)}
                />
              )}
            </div>
          )}
          {editMode && localDocLinks !== theProject?.docs && (
            <button
              onClick={saveReorderedDocs}
              className="btn btn-green sticky left-[75%] top-[90%]"
            >
              {loading ? <LoaderSpinSmall /> : "Save Order"}
            </button>
          )}
          <header className="mb-8 max-w-[280px] flex flex-col items-center">
            <div className="flex flex-col">
              <span className="flex items-center gap-1">
                {theProject && theProject.logoUrl && (
                  <Image
                    width={50}
                    height={50}
                    src={getImageSrc(theProject.logoUrl!)}
                    alt={`${theProject.title}'s logo`}
                  />
                )}
                {editMode && (
                  <button
                    onClick={() => setSelectedUpdate(0)}
                    className="ml-1 mr-2 btn btn-sm"
                  >
                    {theProject && theProject.logoUrl ? (
                      <EditIcon />
                    ) : (
                      <MockImage />
                    )}
                  </button>
                )}
                {theProject && editMode && selectedUpdate === 0 && (
                  <UpdateProjectForm
                    proj={theProject}
                    refetchProject={refetchProject}
                    formType="logo"
                    onCancel={() => setSelectedUpdate(-999)}
                  />
                )}
                <h1 className="font-bold text-3xl">{theProject?.title}</h1>
                {editMode && (
                  <button
                    onClick={() => setSelectedUpdate(1)}
                    className="ml-2 btn btn-sm"
                  >
                    <EditIcon />
                  </button>
                )}
              </span>
              {theProject && editMode && selectedUpdate === 1 && (
                <UpdateProjectForm
                  proj={theProject}
                  refetchProject={refetchProject}
                  formType="title"
                  onCancel={() => setSelectedUpdate(-999)}
                />
              )}
            </div>
            <div className="flex flex-col">
              <span className="flex items-center gap-1">
                <p className="text-xs text-slate-300 text-center">
                  Birth:{" "}
                  {theProject?.birth && itsDateStringNames(theProject?.birth)}
                </p>
                {editMode && (
                  <button
                    onClick={() => setSelectedUpdate(2)}
                    className="ml-2 btn btn-xs"
                  >
                    <EditIcon />
                  </button>
                )}
              </span>
              {theProject && editMode && selectedUpdate === 2 && (
                <UpdateProjectForm
                  proj={theProject}
                  refetchProject={refetchProject}
                  formType="birth"
                  onCancel={() => setSelectedUpdate(-999)}
                />
              )}
            </div>
            <div className="flex flex-col">
              <span className="flex items-center gap-1">
                <p>{theProject?.desc}</p>
                {editMode && (
                  <button
                    onClick={() => setSelectedUpdate(3)}
                    className="ml-2 btn btn-xs"
                  >
                    <EditIcon />
                  </button>
                )}
              </span>
              {theProject && editMode && selectedUpdate === 3 && (
                <UpdateProjectForm
                  proj={theProject}
                  refetchProject={refetchProject}
                  formType="desc"
                  onCancel={() => setSelectedUpdate(-999)}
                />
              )}
            </div>
            <button
              onClick={() => setShowGitHubInfo(!showGitHubInfo)}
              className={`flex items-center gap-0.5 text-gray-400 hover:text-gray-300 transition-opacity text-sm mt-1 ${showGitHubInfo ? "opacity-100" : "opacity-50"}`}
            >
              <EyeIcon /> Github info
            </button>
            {showGitHubInfo && (
              <div className="flex flex-col">
                <span className="flex items-center gap-1">
                  <p className="text-xs text-slate-400">
                    {theProject?.githubOwner && theProject?.githubRepo
                      ? `${theProject.githubOwner}/${theProject.githubRepo}`
                      : "No GitHub repo linked"}
                  </p>
                  {editMode && (
                    <button
                      onClick={() => setSelectedUpdate(4)}
                      className="ml-2 btn btn-xs"
                    >
                      <EditIcon />
                    </button>
                  )}
                </span>
                {theProject && editMode && selectedUpdate === 4 && (
                  <UpdateProjectForm
                    proj={theProject}
                    refetchProject={refetchProject}
                    formType="github"
                    onCancel={() => setSelectedUpdate(-999)}
                  />
                )}
              </div>
            )}
          </header>
          <ul className="flex flex-col gap-2">
            {localDocLinks &&
              localDocLinks.length > 0 &&
              localDocLinks.map((doc, index) => (
                <li
                  onClick={() => {
                    if (!editMode) {
                      setSelectedDoc(doc);
                      window.scrollTo({ top: 0 });
                    }
                  }}
                  key={index}
                >
                  <DocLink doc={doc} />
                  {editMode && (
                    <div className="flex rounded-tl-none pt-4 -translate-y-1 gap-2 p-2 w-fit border rounded-lg">
                      <button
                        className="btn btn-round btn-ghost"
                        onClick={() => moveItemUp(index)}
                        disabled={index === 0}
                      >
                        ↑
                      </button>
                      <button
                        className="btn btn-round btn-ghost"
                        onClick={() => moveItemDown(index)}
                        disabled={index === localDocLinks.length - 1}
                      >
                        ↓
                      </button>
                    </div>
                  )}
                </li>
              ))}
          </ul>
          {isOwner && (
            <div className="flex gap-2 my-4 items-center">
              <button
                onClick={() => {
                  setAddingDoc(!addingDoc);
                  setShowAiForm(false);
                  setShowGitHubImport(false);
                }}
                className="btn btn-round text-2xl"
              >
                {addingDoc ? <CloseIcon /> : <PlusIcon />}
              </button>
              <button
                onClick={() => {
                  setShowAiForm(!showAiForm);
                  setAddingDoc(false);
                  setShowGitHubImport(false);
                }}
                className={`btn btn-sm btn-squish ${showAiForm ? "btn-purple" : "btn-outline"}`}
              >
                {showAiForm ? "Close AI" : "AI"}
              </button>
              <button
                onClick={() => {
                  setShowGitHubImport(!showGitHubImport);
                  setAddingDoc(false);
                  setShowAiForm(false);
                }}
                className={`btn btn-sm btn-squish ${showGitHubImport ? "btn-purple" : "btn-outline"}`}
              >
                {showGitHubImport ? "Close Import" : "GitHub Import"}
              </button>
            </div>
          )}
          {addingDoc && (
            <AddDocForm projUid={projUid} refetchProject={refetchProject} />
          )}
          {showAiForm && (
            <AiDocForm
              projUid={projUid}
              refetchProject={refetchProject}
              onClose={() => setShowAiForm(false)}
            />
          )}
          {showGitHubImport && (
            <GitHubImportForm
              projUid={projUid}
              refetchProject={refetchProject}
              onClose={() => setShowGitHubImport(false)}
              defaultOwner={theProject?.githubOwner}
              defaultRepo={theProject?.githubRepo}
            />
          )}
          {/* PDM Diagrams Section */}
          {theProject?.pdmDiagrams && theProject.pdmDiagrams.length > 0 && (
            <div className="w-full flex flex-col items-center mt-6">
              <h3 className="text-xs text-slate-500 uppercase tracking-widest mb-2">
                Diagrams
              </h3>
              <ul className="flex flex-col gap-2">
                {theProject.pdmDiagrams.map((diagram, index) => (
                  <li
                    onClick={() => {
                      if (!editMode) {
                        setSelectedPDM(diagram);
                        window.scrollTo({ top: 0 });
                      }
                    }}
                    key={index}
                  >
                    <PDMLink diagram={diagram} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {isOwner && (
            <div className="flex gap-2 mt-2 mb-4 items-center">
              <button
                onClick={() => setAddingPDM(!addingPDM)}
                className={`btn btn-sm btn-squish ${
                  addingPDM ? "btn-purple" : "btn-outline"
                }`}
              >
                {addingPDM ? "Close" : "+ Diagram"}
              </button>
            </div>
          )}
          {addingPDM && (
            <AddPDMForm projUid={projUid} refetchProject={refetchProject} />
          )}
          <p>{theMessage && theMessage}</p>
        </div>
      ) : selectedDoc !== null ? (
        <div className="relative w-full flex flex-col px-2 items-center">
          <button
            type="button"
            onClick={() => setSelectedDoc(null)}
            className="place-self-start backdrop-blur-md fixed zz-top-minus1 btn btn-outline 3xs:text-md sm:text-sm btn-squish"
          >
            Back
          </button>
          {theProject && (
            <Doc
              theProject={theProject}
              projUid={projUid}
              refetchProjectForDocs={refetchProjectForDocs}
              doc={selectedDoc}
              isOwner={!!isOwner}
            />
          )}
        </div>
      ) : selectedPDM !== null ? (
        <div className="relative w-full flex flex-col px-2 items-center">
          <button
            type="button"
            onClick={() => setSelectedPDM(null)}
            className="place-self-start fixed zz-top-minus1 btn btn-outline 3xs:text-md sm:text-sm btn-squish"
          >
            Back
          </button>
          {theProject && (
            <PDMDiagram
              theProject={theProject}
              projUid={projUid}
              diagram={selectedPDM}
              refetchProject={refetchProject}
              onDelete={() => setSelectedPDM(null)}
            />
          )}
        </div>
      ) : null}
    </div>
  );
};

export default ProjectPage;
