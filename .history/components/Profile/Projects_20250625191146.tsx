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

  return (
    <article className="flex flex-col items-center gap-6 p-6 shadow-lg rounded-lg w-full max-w-3xl">
      <h2 className="text-3xl font-bold border-b border-slate-700 mb-6 w-full text-center text-gray-900 dark:text-gray-100">
        Projects
      </h2>
      <div className="flex flex-col gap-6 w-full">
        {projects && projects.length > 0 ? (
          projects.map((proj, index) => (
            <div key={index} className="flex flex-col gap-2">
              <Link
                href={`/project/${proj.uid}`}
                className="flex items-center justify-between p-4 bg-black bg-opacity-10 dark:bg-white dark:bg-opacity-10 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 hover:bg-opacity-5 dark:hover:bg-opacity-5"
              >
                <div className="flex items-center gap-4">
                  {proj.logoUrl && (
                    <Image
                      src={proj.logoUrl}
                      alt={proj.title}
                      width={50}
                      height={50}
                      className="rounded-full"
                    />
                  )}
                  <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                    {proj.title}
                  </p>
                </div>
              </Link>
            </div>
          ))
        ) : (
          <p className="text-lg text-gray-500 dark:text-gray-400">
            No projects created yet
          </p>
        )}
      </div>
      <button
        onClick={() => setAddingProj(!addingProj)}
        className="btn btn-primary flex items-center gap-2"
      >
        {addingProj ? <CloseIcon /> : <PlusIcon />}
        {addingProj ? "Close" : "Add Project"}
      </button>
      {addingProj && <AddProjForm refetchProjects={refetchProjects} />}
    </article>
  );
};

export default Projects;
