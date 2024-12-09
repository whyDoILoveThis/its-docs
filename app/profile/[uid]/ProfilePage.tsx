"use client";
import { useUserStore } from "@/hooks/useUserStore";
import React, { useEffect, useState } from "react";
import Projects from "@/components/Profile/Projects";
import axios from "axios";
import LoaderSpinSmall from "@/components/LoaderSpinSmall";

interface Props {
  userUid: string;
}
const ProfilePage = ({ userUid }: Props) => {
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [userExists, setUserExists] = useState(false);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [loading, setLoading] = useState(true);

  const checkUser = async (uid: string) => {
    try {
      setLoading(true);
      const response = await axios.post("/api/checkUserExists", { uid });
      const data = response.data;

      if (data.user) {
        setProfileUser(data.user);
        setUserExists(true);
      } else {
        setUserExists(false);
      }
      setLoading(false);
    } catch (error) {
      console.error("❌ An error occurred:", error);
      setLoading(false);
    }
  };

  const fetchProjectsByCreator = async (creatorUid: string) => {
    try {
      setLoading(true);
      const response = await axios.get(
        `/api/getProjectsByCreatorUid?creatorUid=${creatorUid}`
      );
      const projects = response.data.projects;
      const message = response.data.message;
      console.log(message);

      console.log(projects);

      setProjects(projects);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching projects:", error);
      throw error;
      setLoading(false);
    }
  };

  const refetchProjects = async () => {
    setLoading(true);
    await fetchProjectsByCreator(userUid);
    setLoading(false);
  };

  useEffect(() => {
    const g = async () => {
      await fetchProjectsByCreator(userUid);
      await checkUser(userUid);
    };
    g();
  }, [userUid]);

  if (loading)
    return (
      <div className="w-full flex justify-center">
        <LoaderSpinSmall />
      </div>
    );

  return (
    <div className="flex flex-col items-center">
      <span className="mb-8 max-w-[280px]">
        <h1 className="font-bold text-center">{profileUser?.fullName}</h1>
        <p className="text-slate-800 dark:text-slate-300">
          Been building web apps since the creator of php was shittin yellow
          son. ill tell ya what ya need to know.
        </p>
      </span>
      <Projects projects={projects} refetchProjects={refetchProjects} />
    </div>
  );
};

export default ProfilePage;
