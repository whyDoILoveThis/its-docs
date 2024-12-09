import React, { useEffect, useState } from "react";
import axios from "axios";
import itsDateString from "@/lib/itsDateString";
import ItsDatePicker from "../ItsDatePicker";
import itsDateStringNames from "@/lib/itsDateStringNames";
import LoaderSpinSmall from "../LoaderSpinSmall";

interface Props {
  refetchProject: () => void;
  formType: string;
  proj: Project;
}

const UpdateProjectForm = ({ proj, refetchProject, formType }: Props) => {
  const [formData, setFormData] = useState({
    birth: proj.birth || new Date(),
    title: proj.title || "",
    desc: proj.desc || "",
    logoUrl: proj.logoUrl || "",
  });

  const [message, setMessage] = useState<string | null>(null);
  const [theDate, setTheDate] = useState<Date>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    theDate && setFormData((prev) => ({ ...prev, birth: theDate }));
  }, [theDate]);

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

    // Prepare the payload
    const updates = Object.entries(formData)
      .filter(([_, value]) => {
        // Keep valid Dates and non-empty strings
        if (value instanceof Date) return true;
        if (typeof value === "string" && value.trim() !== "") return true;
        return false;
      })
      .reduce((acc, [key, value]) => {
        acc[key] = value; // Rebuild the object
        return acc;
      }, {} as Record<string, unknown>);

    if (Object.keys(updates).length === 0) {
      setMessage("Please fill out at least one field.");
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
            className="input"
          />
        );
        break;
      case "desc":
        return (
          <textarea
            className="input w-full"
            id="desc"
            name="desc"
            value={formData.desc || ""}
            onChange={(e) => setFormData({ ...formData, desc: e.target.value })}
          />
        );
        break;
      case "logoUrl":
        return (
          <input
            className="input w-full"
            type="text"
            id="logoUrl"
            name="logoUrl"
            value={formData.logoUrl || ""}
            onChange={(e) =>
              setFormData({ ...formData, logoUrl: e.target.value })
            }
          />
        );
        break;
      case "birth":
        return (
          <ItsDatePicker defaultDate={proj.birth} onDateChange={setTheDate} />
        );
        break;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {renderForm()}

      <button type="submit" className="btn btn-green place-self-end">
        {loading ? <LoaderSpinSmall /> : "Update"}
      </button>

      {message && <p className="text-sm text-center">{message}</p>}
    </form>
  );
};

export default UpdateProjectForm;
