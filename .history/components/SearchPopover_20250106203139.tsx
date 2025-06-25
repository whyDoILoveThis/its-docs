import React, { useState, useEffect } from "react";
import axios from "axios";
import Link from "next/link";
import Image from "next/image";

interface Props {
  onClose: () => void;
}

const SearchPopover = ({ onClose }: Props) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/search?term=${searchQuery}`);
      setSearchResults(response.data.projects);
      setLoading(false);
    } catch (error) {
      console.error("Error searching projects:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchQuery.length > 2) {
      handleSearch();
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey && event.key === "k") {
      event.preventDefault();
      onClose();
    }
  };

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-md flex justify-center items-center zz-top-plus2">
      <div className="p-4 rounded-lg shadow-lg w-full max-w-md zz-top-plus2">
        <button
          onClick={onClose}
          className="btn btn-round btn-red place-self-end text-xl mb-4 zz-top-plus2"
        >
          ✖
        </button>
        <input
          type="text"
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input w-full mb-4 zz-top-plus2"
        />
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="flex flex-col gap-4 zz-top-plus2">
            {searchResults.map((project) => (
              <Link
                onClick={onClose}
                key={project.uid}
                className="bg-white bg-opacity-10 hover:bg-opacity-5 rounded-md p-2 zz-top-plus2"
                href={`/project/${project.uid}`}
              >
                <span className="flex gap-1 items-center zz-top-plus2">
                  {project.logoUrl && (
                    <Image
                      src={project.logoUrl}
                      alt={""}
                      width={25}
                      height={30}
                    />
                  )}
                  <h3 className="text-lg font-semibold zz-top-plus2">
                    {project.title}
                  </h3>
                </span>
                <p>{project.desc}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPopover;
