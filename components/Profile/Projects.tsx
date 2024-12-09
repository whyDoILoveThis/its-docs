import React, { useState } from "react";
import AddProjForm from "./AddProjForm";
import CloseIcon from "@/components/icons/CloseIcon";
import PlusIcon from "@/components/icons/PlusIcon";
import Link from "next/link";
import Image from "next/image";

interface Props {
  projects: Project[] | null;
  refetchProjects: () => void;
}
const Projects = ({ projects, refetchProjects }: Props) => {
  const [addingProj, setAddingProj] = useState(false);
  //const [localProjects, setLocalProjects] = useState<Project[]>(projects || []);

  // // Move item up locally
  // const moveItemUp = (index: number) => {
  //   if (index === 0) return; // Can't move the first item up
  //   const updatedItems = [...localProjects];
  //   [updatedItems[index - 1], updatedItems[index]] = [
  //     updatedItems[index],
  //     updatedItems[index - 1],
  //   ];
  //   setLocalProjects(updatedItems);
  // };

  // // Move item down locally
  // const moveItemDown = (index: number) => {
  //   if (index === localProjects.length - 1) return; // Can't move the last item down
  //   const updatedItems = [...localProjects];
  //   [updatedItems[index], updatedItems[index + 1]] = [
  //     updatedItems[index + 1],
  //     updatedItems[index],
  //   ];
  //   setLocalProjects(updatedItems);
  // };

  return (
    <article className="flex flex-col items-center gap-2">
      <h2 className="border-b border-slate-700 mb-2">Projects</h2>
      <div className="flex flex-col gap-2">
        {projects &&
          projects.map((proj, index) => (
            <Link
              href={`/project/${proj.uid}`}
              className="btn btn-w-icon btn-outline"
              key={index}
            >
              {proj.logoUrl && (
                <Image src={proj.logoUrl} alt={""} width={25} height={25} />
              )}
              <p>{proj.title}</p>
            </Link>
          ))}
      </div>
      <p className="text-sm">
        {projects && projects.length <= 0 && "No projects created yet"}
      </p>
      <button
        onClick={() => {
          setAddingProj(!addingProj);
        }}
        className="btn btn-round text-2xl"
      >
        {addingProj ? <CloseIcon /> : <PlusIcon />}
      </button>
      {addingProj && <AddProjForm refetchProjects={refetchProjects} />}
    </article>
  );
};

export default Projects;
