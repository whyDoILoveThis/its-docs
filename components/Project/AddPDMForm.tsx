"use client";
import LoaderSpinner from "@/components/LoaderSpinner";
import { useToast } from "@/hooks/use-toast";
import React, { useState } from "react";
import { v4 } from "uuid";

interface Props {
  projUid: string;
  refetchProject: () => void;
}

const AddPDMForm = ({ projUid, refetchProject }: Props) => {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleAddDiagram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      const response = await fetch("/api/addPDM", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projUid,
          diagram: {
            uid: v4(),
            title: title.trim(),
            orientation: "horizontal",
            nodes: [],
            edges: [],
          },
        }),
      });

      const data = await response.json();
      setMessage(data.message || data.error);
      setLoading(false);
      refetchProject();
      toast({ title: "Diagram created", variant: "green" });
    } catch (error) {
      console.error("❌ An error occurred:", error);
      setLoading(false);
    }
  };

  return (
    <div>
      {loading && <LoaderSpinner />}
      {message === "" ? (
        <form onSubmit={handleAddDiagram} className="flex flex-col gap-4 mb-6">
          <h2 className="text-center mt-2 font-bold">New PDM Diagram</h2>
          <div className="flex flex-col">
            <label className="font-bold">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input max-w-[280px]"
            />
          </div>
          <button type="submit" className="btn btn-green place-self-end-fix">
            Create Diagram
          </button>
        </form>
      ) : (
        <p>{message}</p>
      )}
    </div>
  );
};

export default AddPDMForm;
