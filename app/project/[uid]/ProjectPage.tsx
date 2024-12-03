"use client";
import { useUserStore } from "@/hooks/useUserStore";
import axios from "axios";
import React, { useEffect, useState } from "react";
import DeleteProjectBtn from "./DeleteProjectBtn";
import LoaderSpinner from "@/components/LoaderSpinner";
import LoaderSpinSmall from "@/components/LoaderSpinSmall";
import ItsDropdown from "@/components/ItsDropdown";
import CloseIcon from "@/components/icons/CloseIcon";
import PlusIcon from "@/components/icons/PlusIcon";
import AddDocForm from "./AddDocForm";
import DocLink from "./DocLink";
import Doc from "./Doc";

interface Props {
  projUid: string;
}
const ProjectPage = ({ projUid }: Props) => {
  const [theProject, setTheProject] = useState<Project | null>(null);
  const [addingDoc, setAddingDoc] = useState(false);
  const [theMessage, setTheMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);

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
          <div className="w-fit place-self-end px-2">
            <ItsDropdown
              closeWhenClicked={true}
              btnText="Settings"
              btnClassNames="btn btn-outline btn-xs btn-squish text-shadow flex gap-1 items-center backdrop-blur-md"
              menuClassNames="-translate-x-20"
            >
              <li className="btn btn-ghost btn-red" style={{ width: "100%" }}>
                <DeleteProjectBtn projUid={projUid} />
              </li>
            </ItsDropdown>
          </div>
          <span className="mb-8 max-w-[280px]">
            <h1 className="font-bold text-center">{theProject?.title}</h1>
            <p>{theProject?.desc}</p>
          </span>
          <div className="flex flex-col gap-2">
            {theProject &&
              theProject.docs &&
              theProject.docs.length > 0 &&
              theProject.docs.map((doc, index) => (
                <span
                  onClick={() => {
                    setSelectedDoc(doc);
                    window.scrollTo({ top: 0 });
                  }}
                  key={index}
                >
                  <DocLink doc={doc} />
                </span>
              ))}
          </div>
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
      )}
    </div>
  );
};

export default ProjectPage;
