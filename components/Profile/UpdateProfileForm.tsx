import React, { useState } from "react";
import axios from "axios";
import LoaderSpinSmall from "@/components/LoaderSpinSmall";
import { useAuth } from "@clerk/clerk-react";
import { useOfflineFetch } from "@/hooks/useOfflineFetch";

interface Props {
  field: string;
  value: string;
  onCancel: () => void;
  onSave: () => void;
}

const UpdateProfileForm = ({ field, value, onCancel, onSave }: Props) => {
  const { userId } = useAuth();
  const [formData, setFormData] = useState(value);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { offlineFetch } = useOfflineFetch();

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setFormData(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await offlineFetch({
        label: `Update profile ${field}`,
        method: "PUT",
        url: "/api/updateUserProfile",
        body: { field, value: formData, userUid: userId },
      });

      setMessage("Profile updated successfully!");
      setLoading(false);
      onSave();
      onCancel();
    } catch (error) {
      console.error("Error updating profile:", error);
      setMessage("Failed to update profile. Please try again.");
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 mb-4 items-end"
    >
      {field === "bio" ? (
        <textarea
          className="input w-full !min-h-400px mt-1"
          value={formData}
          onChange={handleChange}
        />
      ) : (
        <input
          type="text"
          className="input w-full"
          value={formData}
          onChange={handleChange}
        />
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-green">
          {loading ? <LoaderSpinSmall /> : "Save"}
        </button>
        <button type="button" className="btn btn-red" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {message && <p className="text-sm text-center">{message}</p>}
    </form>
  );
};

export default UpdateProfileForm;
