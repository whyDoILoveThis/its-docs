import React, { useEffect, useState } from "react";
import axios from "axios";
import ItsDatePicker from "../ItsDatePicker";
import LoaderSpinSmall from "../LoaderSpinSmall";
import ItsFileInput from "../ItsFileInput";

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
  });

  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>("");

  useEffect(() => {
    setFormData((prev) => ({ ...prev, birth: proj.birth }));
  }, [proj.birth]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
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

    const updates = Object.entries(formData).reduce((acc, [key, value]) => {
      if (
        value instanceof Date ||
        (typeof value === "string" && value.trim() !== "")
      ) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, unknown>);

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
            <ItsFileInput setImage={setImage} setImageUrl={setImageUrl} />
            <input
              type="text"
              name="logoUrl"
              value={formData.logoUrl}
              onChange={handleChange}
              className="input w-full"
            />
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
