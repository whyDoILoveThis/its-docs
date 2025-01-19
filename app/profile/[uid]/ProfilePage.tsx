"use client";
import React, { useEffect, useState } from "react";
import Projects from "@/components/Profile/Projects";
import axios from "axios";
import LoaderSpinSmall from "@/components/LoaderSpinSmall";
import UpdateProfileForm from "@/components/Profile/UpdateProfileForm";
import ItsDropdown from "@/components/ItsDropdown";
import EditIcon from "@/components/icons/EditIcon";

interface Props {
  userUid: string;
}
const ProfilePage = ({ userUid }: Props) => {
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const checkUser = async (uid: string) => {
    try {
      setLoading(true);
      const response = await axios.post("/api/checkUserExists", { uid });
      const data = response.data;

      if (data.user) {
        setProfileUser(data.user);
      } else {
        setProfileUser(null);
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
      setLoading(false);
      throw error;
    }
  };

  const refetchProjects = async () => {
    setLoading(true);
    await fetchProjectsByCreator(userUid);
    setLoading(false);
  };

  const handleEditClick = (field: string) => {
    setEditingField(field);
  };

  const handleCancelEdit = () => {
    setEditingField(null);
  };

  const refetchUser = async () => {
    await checkUser(userUid);
  };

  useEffect(() => {
    const g = async () => {
      await fetchProjectsByCreator(userUid);
      await checkUser(userUid);
    };
    g();
  }, [userUid]);

  useEffect(() => {
    if (!showSettings) {
      setEditingField(null);
    }
  }, [showSettings]);

  if (loading)
    return (
      <div className="w-full flex justify-center">
        <LoaderSpinSmall />
      </div>
    );

  return (
    <div className="flex flex-col mt-6 items-center">
      <div className="w-fit fixed top-16 right-4 place-self-end">
        <ItsDropdown
          closeWhenClicked={true}
          btnText="Settings"
          btnClassNames="btn btn-outline btn-xs btn-squish text-shadow flex gap-1 items-center backdrop-blur-md"
          menuClassNames="-translate-x-24"
        >
          <li
            onClick={() => {
              if (!showSettings) {
                setShowSettings(!showSettings);
              }
            }}
            className={`btn btn-ghost text-nowrap ${showSettings && "blur-sm"}`}
            style={{ width: "100%" }}
          >
            Edit Mode
          </li>
          {showSettings && (
            <li
              className={`btn btn-ghost text-nowrap`}
              style={{ width: "100%" }}
              onClick={() => {
                setShowSettings(false);
              }}
            >
              Exit Edit Mode
            </li>
          )}
        </ItsDropdown>
      </div>
      <span className="mb-8 max-w-[280px]">
        <h1 className="font-bold text-center text-gray-900 dark:text-gray-100">
          {profileUser?.fullName}
          {showSettings && (
            <button
              onClick={() => handleEditClick("fullName")}
              className="ml-2 btn btn-xs"
            >
              <EditIcon />
            </button>
          )}
        </h1>
        {editingField === "fullName" && (
          <UpdateProfileForm
            field="fullName"
            value={profileUser?.fullName || ""}
            onCancel={handleCancelEdit}
            onSave={refetchUser}
          />
        )}
        <p
          className={`text-slate-800 dark:text-slate-300 ${
            editingField && "mt-4"
          }`}
        >
          {profileUser?.bio}
          {showSettings && (
            <button
              onClick={() => handleEditClick("bio")}
              className="ml-2 btn btn-xs"
            >
              <EditIcon />
            </button>
          )}
        </p>
        {editingField === "bio" && (
          <UpdateProfileForm
            field="bio"
            value={profileUser?.bio || ""}
            onCancel={handleCancelEdit}
            onSave={refetchUser}
          />
        )}
      </span>
      <Projects projects={projects} refetchProjects={refetchProjects} />
    </div>
  );
};

export default ProfilePage;
