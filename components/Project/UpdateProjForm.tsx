import React, { useEffect, useState } from "react";
import axios from "axios";
import ItsDatePicker from "../ItsDatePicker";
import LoaderSpinSmall from "../LoaderSpinSmall";
import ItsFileInput from "../ItsFileInput";
import { fbUploadImage, fbDeleteImage } from "@/lib/supabaseStorage";
import Image from "next/image";

interface Props {
  refetchProject: () => void;
  formType: string;
  proj: Project;
  onCancel: () => void;
}

const UpdateProjectForm = ({
  proj,
  refetchProject,
  formType,
  onCancel,
}: Props) => {
  const [formData, setFormData] = useState({
    birth: proj.birth || new Date(),
    title: proj.title || "",
    desc: proj.desc || "",
    logoUrl: proj.logoUrl || "",
    githubOwner: proj.githubOwner || "",
    githubRepo: proj.githubRepo || "",
  });

  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>("");

  const [removeLogo, setRemoveLogo] = useState(false);

  useEffect(() => {
    setFormData((prev) => ({ ...prev, birth: proj.birth }));
  }, [proj.birth]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    let payload = {
      ...formData,
    };

    if (image) {
      const newImageUrl = await fbUploadImage(image);
      if (proj.logoUrl) {
        fbDeleteImage(proj.logoUrl).catch(console.error);
      }
      payload = { ...payload, logoUrl: newImageUrl };
    } else if (removeLogo && proj.logoUrl) {
      fbDeleteImage(proj.logoUrl).catch(console.error);
      payload = { ...payload, logoUrl: "" };
    }

    const updates = Object.entries(payload).reduce(
      (acc, [key, value]) => {
        if (
          value instanceof Date ||
          (typeof value === "string" &&
            (value.trim() !== "" || (key === "logoUrl" && removeLogo)))
        ) {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, unknown>,
    );

    if (Object.keys(updates).length === 0) {
      setMessage("Please fill out at least one field.");
      setLoading(false);
      return;
    }

    try {
      const response = await axios.put("/api/updateProject", {
        projUid: proj.uid,
        updates,
      });

      setMessage(response.data.message || "Project updated successfully!");
      setLoading(false);
      refetchProject();
      onCancel();
    } catch (error) {
      console.error("Error updating project:", error);
      setMessage("Failed to update project. Please try again.");
      setLoading(false);
    }
  };

  const renderForm = () => {
    switch (formType) {
      case "title":
        return (
          <input
            type="text"
            name="title"
            placeholder="Title"
            value={formData.title}
            onChange={handleChange}
            className="input w-full"
          />
        );
      case "desc":
        return (
          <textarea
            className="input w-full !min-h-400px mt-1"
            name="desc"
            value={formData.desc}
            onChange={handleChange}
          />
        );
      case "logo":
        return (
          <div>
            {imageUrl && (
              <Image width={50} height={50} src={imageUrl} alt="tempLogo" />
            )}
            <ItsFileInput setImage={setImage} setImageUrl={setImageUrl} />
            {proj.logoUrl && !removeLogo && (
              <button
                type="button"
                className="btn btn-red btn-sm mt-2"
                onClick={() => {
                  setRemoveLogo(true);
                  setFormData((prev) => ({ ...prev, logoUrl: "" }));
                }}
              >
                Remove Logo
              </button>
            )}
            {removeLogo && (
              <p className="text-sm text-red-400 mt-1">
                Logo will be removed on save
              </p>
            )}
          </div>
        );
      case "birth":
        return (
          <ItsDatePicker
            defaultDate={proj.birth}
            onDateChange={(date) =>
              setFormData((prev) => ({ ...prev, birth: date }))
            }
          />
        );
      case "github":
        return (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              name="githubOwner"
              placeholder="GitHub Username"
              value={formData.githubOwner}
              onChange={handleChange}
              className="input w-full"
            />
            <input
              type="text"
              name="githubRepo"
              placeholder="Repository Name"
              value={formData.githubRepo}
              onChange={handleChange}
              className="input w-full"
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 mb-4 items-end"
    >
      {renderForm()}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-green">
          {loading ? <LoaderSpinSmall /> : "Update"}
        </button>
        <button type="button" className="btn btn-red" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {message && <p className="text-sm text-center">{message}</p>}
    </form>
  );
};

export default UpdateProjectForm;
