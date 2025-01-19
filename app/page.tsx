"use client";

import { SignUpButton, useUser } from "@clerk/nextjs";
import { SearchIcon } from "lucide-react";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function Home() {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [showUnderline, setShowUnderline] = useState(false);
  const { isLoaded, user } = useUser();

  const searchProjects = async (term: string) => {
    setLoadingSearch(true);

    try {
      const response = await fetch(
        `/api/search?term=${encodeURIComponent(term)}`
      );
      const data = await response.json();

      if (response.ok) {
        setSearchResults(data.projects);
      } else {
        console.error(data.error);
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoadingSearch(false);
    }
  };

  return (
    <article className="flex flex-col items-center p-2">
      <h2 className="font-bold">Welcome to ItsDocs!</h2>
      <div className="input my-2 flex gap-1 items-center !pr-2">
        <input
          type="text"
          placeholder="Search for a project..."
          className="bg-transparent focus:outline-none"
          value={searchTerm}
          onChange={(e) => {
            const term = e.target.value;
            setSearchTerm(term);

            if (term.trim() !== "") {
              searchProjects(term);
            } else {
              setSearchResults([]);
            }
          }}
        />
        <button className="btn btn-ghost !p-1">
          <SearchIcon />
        </button>
      </div>

      {!searchTerm ? (
        <div className="flex flex-col items-center">
          <div className="text-slate-700 dark:text-slate-300">
            {!user && isLoaded && (
              <div>
                Search for a project, or{" "}
                <span
                  onMouseEnter={() => setShowUnderline(true)}
                  onMouseLeave={() => setShowUnderline(false)}
                  className="text-slate-500 dark:text-slate-100 leading-tight inline-flex flex-col"
                >
                  <SignUpButton mode="modal" />
                  <div
                    className={`w-full h-[1px] bg-slate-500 ${
                      showUnderline ? "visible" : "invisible"
                    }`}
                  />
                </span>{" "}
                to start creating your own.
              </div>
            )}
            {user && "Search for a project, or start creating your own."}
          </div>
          <p className="text-slate-700 dark:text-slate-300 mt-4 max-w-[400px]">
            Once you create a <span className="text-blue-400">project</span>,
            and add a doc to it, you will have several options for adding
            information to those <span className="text-pink-400">docs</span>,
            and sharing them with a link.
          </p>
          <h3 className="mt-4 font-bold self-start">Then,</h3>
          <p className=" text-slate-700 dark:text-slate-300 max-w-[400px]">
            Create a section heading, and add instructions to that section with
            our info blocks. Use <span className="text-green-400">colors</span>{" "}
            to indicate importance, or just make reading{" "}
            <span className="text-orange-400">easier</span>.
          </p>
          <p className="mt-4 text-slate-500 dark:text-slate-300 maxw-[400px]">
            And of course, you can add blocks of code from any language.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {loadingSearch ? (
            <p>Loading...</p>
          ) : searchResults.length > 0 ? (
            searchResults.map((project: Project) => (
              <Link
                key={project.uid}
                className="bg-white bg-opacity-10 hover:bg-opacity-5 rounded-md p-2"
                href={`project/${project.uid}`}
              >
                <span className="flex gap-1 items-center">
                  {project.logoUrl && (
                    <Image
                      src={project.logoUrl}
                      alt={""}
                      width={25}
                      height={30}
                    />
                  )}
                  <h3 className="text-lg font-semibold">{project.title}</h3>
                </span>
                <p>{project.desc}</p>
              </Link>
            ))
          ) : (
            <p>No projects found.</p>
          )}
        </div>
      )}
    </article>
  );
}
