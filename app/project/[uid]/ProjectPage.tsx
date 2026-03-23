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

interface Props {
  projUid: string;
}

const ProjectPage = ({ projUid }: Props) => {
  const { userId } = useAuth();
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

  useEffect(() => {
    if (theProject?.docs) {
      setLocalDocLinks(theProject.docs);
    }
  }, [theProject?.docs]);

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
      const response = await axios.put("/api/updateDocs", {
        projUid: theProject?.uid,
        docs: localDocLinks,
      });

      setTheMessage(response.data.message || "Docs updated successfully!");
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
    try {
      setLoading(true);
      const response = await axios.get(
        `/api/getProjectByUid?projUid=${projUid}`,
      );

      const project = response.data.project;
      const message = response.data.message;

      setTheMessage(message);
      setTheProject(project);
      if (selectedDoc) {
        setSelectedDoc(
          project.docs.find((doc: Doc) => doc.uid === selectedDoc.uid),
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
      console.error("Error fetching projects:", error);
      setLoading(false);
    }
  };

  const refetchProject = async () => {
    await fetchProjectByUid(projUid);
  };

  const refetchProjectForDocs = async () => {
    await fetchProjectByUid(projUid);
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
      {selectedDoc === null && selectedPDM === null ? (
        <div className="w-full flex flex-col items-center">
          {theProject?.creatorUid === userId && (
            <div className="w-fit place-self-end-fix px-2">
              <ItsDropdown
                closeWhenClicked={true}
                btnText="Settings"
                btnClassNames="btn btn-outline 3xs:text-md sm:text-sm btn-squish text-shadow flex gap-1 items-center backdrop-blur-md"
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
                <li className="btn btn-ghost btn-red !w-full">
                  <DeleteProjectBtn projUid={projUid} />
                </li>
              </ItsDropdown>
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
              className={`text-gray-400 hover:text-gray-300 transition-opacity text-sm mt-1 ${showGitHubInfo ? "opacity-100" : "opacity-50"}`}
            >
              <EyeIcon />
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
          {userId && userId === theProject?.creatorUid && (
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
          {userId && userId === theProject?.creatorUid && (
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
            className="place-self-start backdrop-blur-md fixed zz-top btn btn-outline 3xs:text-md sm:text-sm btn-squish"
          >
            Back
          </button>
          {theProject && (
            <Doc
              theProject={theProject}
              projUid={projUid}
              refetchProjectForDocs={refetchProjectForDocs}
              doc={selectedDoc}
            />
          )}
        </div>
      ) : selectedPDM !== null ? (
        <div className="relative w-full flex flex-col px-2 items-center">
          <button
            type="button"
            onClick={() => setSelectedPDM(null)}
            className="place-self-start fixed zz-top btn btn-outline 3xs:text-md sm:text-sm btn-squish"
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
