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

interface Props {
  projUid: string;
}

const ProjectPage = ({ projUid }: Props) => {
  const { userId } = useAuth();
  const [theProject, setTheProject] = useState<Project | null>(null);
  const [addingDoc, setAddingDoc] = useState(false);
  const [theMessage, setTheMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedUpdate, setSelectedUpdate] = useState(-999);
  const [localDocLinks, setLocalDocLinks] = useState<Doc[]>([]);

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
        `/api/getProjectByUid?projUid=${projUid}`
      );

      const project = response.data.project;
      const message = response.data.message;

      setTheMessage(message);
      setTheProject(project);
      if (selectedDoc) {
        setSelectedDoc(
          project.docs.find((doc: Doc) => doc.uid === selectedDoc.uid)
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

  if (loading)
    return (
      <div className="w-full flex justify-center">
        <LoaderSpinSmall />
      </div>
    );

  return (
    <div className="flex flex-col w-full items-center">
      {selectedDoc === null ? (
        <div className="w-full flex flex-col items-center">
          {theProject?.creatorUid === userId && (
            <div className="w-fit place-self-end-fix px-2">
              <ItsDropdown
                closeWhenClicked={true}
                btnText="Settings"
                btnClassNames="btn btn-outline 3xs:btn-reg sm:btn-xs btn-squish text-shadow flex gap-1 items-center backdrop-blur-md"
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
                <h1 className="font-bold">{theProject?.title}</h1>
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
            <button
              onClick={() => setAddingDoc(!addingDoc)}
              className="btn btn-round text-2xl my-4"
            >
              {addingDoc ? <CloseIcon /> : <PlusIcon />}
            </button>
          )}
          {addingDoc && (
            <AddDocForm projUid={projUid} refetchProject={refetchProject} />
          )}
          <p>{theMessage && theMessage}</p>
        </div>
      ) : (
        <div className="relative w-full flex flex-col px-2 items-center">
          <button
            type="button"
            onClick={() => setSelectedDoc(null)}
            className="place-self-start backdrop-blur-md fixed btn btn-outline btn-reg sm:btn-xs  btn-squish"
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
      )}
    </div>
  );
};

export default ProjectPage;
