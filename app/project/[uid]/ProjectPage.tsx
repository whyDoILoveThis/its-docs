"use client";
import { useUserStore } from "@/hooks/useUserStore";
import axios from "axios";
import React, { useEffect, useState } from "react";
import DeleteProjectBtn from "@/components/Project/DeleteProjectBtn";
import LoaderSpinner from "@/components/LoaderSpinner";
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
  const [localDocLinks, setLocalDocLinks] = useState<Doc[]>(
    theProject?.docs || []
  );

  useEffect(() => {
    theProject && theProject.docs && setLocalDocLinks(theProject.docs);
  }, [theProject?.docs]);

  // Move item up locally
  const moveItemUp = (index: number) => {
    if (index === 0) return; // Can't move the first item up
    const updatedItems = [...localDocLinks];
    [updatedItems[index - 1], updatedItems[index]] = [
      updatedItems[index],
      updatedItems[index - 1],
    ];
    setLocalDocLinks(updatedItems);
  };

  // Move item down locally
  const moveItemDown = (index: number) => {
    if (index === localDocLinks.length - 1) return; // Can't move the last item down
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
      refetchProject(); // Refresh the project to ensure consistency
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
      console.log(response.data);

      const project = response.data.project;
      const message = response.data.message;
      console.log(message);

      console.log(project);
      setTheMessage(message);
      setTheProject(project);
      selectedDoc &&
        setSelectedDoc(
          project.docs.find((doc: Doc) => doc.uid === selectedDoc.uid)
        );
      setEditMode(false);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching projects:", error);
      throw error;
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
          {/** Settings btn */}
          {theProject?.creatorUid === userId && (
            <div className="w-fit place-self-end px-2">
              <ItsDropdown
                closeWhenClicked={true}
                btnText="Settings"
                btnClassNames="btn btn-outline btn-xs btn-squish text-shadow flex gap-1 items-center backdrop-blur-md"
                menuClassNames="-translate-x-20"
              >
                <li
                  className="btn btn-ghost !w-full"
                  onClick={() => {
                    setEditMode(!editMode);
                    editMode && setSelectedUpdate(-999);
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
          {/** Header */}
          <header className="mb-8 max-w-[280px] flex flex-col items-center">
            <div className="flex flex-col">
              <span className="flex gap-1">
                <h1 className="font-bold">{theProject?.title}</h1>
                {editMode && (
                  <button
                    onClick={() => {
                      setSelectedUpdate(1);
                    }}
                    className="btn btn-ghost btn-round text-3xl"
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
                    onClick={() => {
                      setSelectedUpdate(2);
                    }}
                    className="btn btn-ghost btn-round text-lg"
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
                />
              )}
            </div>
            <div className="flex flex-col">
              <span className="flex items-center gap-1">
                <p>{theProject?.desc}</p>
                {editMode && (
                  <button
                    onClick={() => {
                      setSelectedUpdate(3);
                    }}
                    className="btn btn-ghost btn-round text-2xl"
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
                />
              )}
            </div>
          </header>
          {/** Doc List */}
          <ul className="flex flex-col gap-2">
            {localDocLinks &&
              localDocLinks.length > 0 &&
              localDocLinks.map((doc, index) => (
                <li
                  onClick={() => {
                    !editMode && setSelectedDoc(doc);
                    !editMode && window.scrollTo({ top: 0 });
                  }}
                  key={index}
                >
                  <DocLink doc={doc} />
                  {/* Move item arrows */}
                  {editMode && (
                    <div className="flex rounded-t-none pt-4 -translate-y-1 border-t-0 gap-2 p-2 w-fit border rounded-lg">
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
            {editMode && localDocLinks !== theProject?.docs && (
              <button
                onClick={saveReorderedDocs}
                className="btn btn-green mt-4 place-self-end"
              >
                {loading ? <LoaderSpinSmall /> : "Save Order"}
              </button>
            )}
          </ul>
          {/** Add Doc Form */}
          <button
            onClick={() => {
              setAddingDoc(!addingDoc);
            }}
            className="btn btn-round text-2xl my-4"
          >
            {addingDoc ? <CloseIcon /> : <PlusIcon />}
          </button>
          {addingDoc && (
            <AddDocForm projUid={projUid} refetchProject={refetchProject} />
          )}
          <p>{theMessage && theMessage}</p>
        </div>
      ) : (
        <>
          {/** The actual doc */}
          <div className="relative w-full flex flex-col px-2 items-center">
            <button
              type="button"
              onClick={() => {
                setSelectedDoc(null);
              }}
              className="place-self-start backdrop-blur-md fixed btn btn-outline btn-xs btn-squish"
            >
              Back
            </button>
            <Doc
              projUid={projUid}
              refetchProjectForDocs={refetchProjectForDocs}
              doc={selectedDoc}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default ProjectPage;
