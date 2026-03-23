"use client";
import LoaderSpinner from "@/components/LoaderSpinner";
import { useToast } from "@/hooks/use-toast";
import React, { useState } from "react";
import { v4 } from "uuid";
import { useOfflineFetch } from "@/hooks/useOfflineFetch";
import { updateCachedProject } from "@/hooks/useOfflineStore";

interface Props {
  projUid: string;
  refetchProject: () => void;
}
const AddDocForm = ({ projUid, refetchProject }: Props) => {
  const [formData, setFormData] = useState<Doc>({
    uid: "",
    title: "",
    tagline: "",
    desc: "",
    docItems: [],
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const uniqueId = v4();
  const { toast } = useToast();
  const { offlineFetch } = useOfflineFetch();

  const handleAddDoc = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    try {
      const result = await offlineFetch({
        label: `Add doc "${formData.title}"`,
        method: "POST",
        url: "/api/addDoc",
        body: { projUid, doc: formData },
      });

      if (!result) {
        // Offline — optimistically add doc to cache
        updateCachedProject(projUid, (p) => ({
          ...p,
          docs: [...(p.docs || []), { ...formData, uid: uniqueId }],
        }));
      }

      const data = result?.data;
      setMessage(data?.message || data?.error || "Queued offline");
      setLoading(false);
      refetchProject();
      toast({
        title: result ? "New doc added" : "Doc queued offline",
        variant: result ? "green" : "blue",
      });
    } catch (error) {
      console.error("❌ An error occurred:", error);
      setLoading(false);
    }
  };

  const handleChange = (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
      uid: uniqueId,
    });
  };

  const inputData = [
    {
      label: "Title",
      inputVal: formData.title,
      inputName: "title",
    },
    {
      label: "Tagline",
      inputVal: formData.tagline,
      inputName: "tagline",
    },
  ];

  console.log(formData);

  return (
    <div>
      {loading && <LoaderSpinner />}
      {message === "" ? (
        <form onSubmit={handleAddDoc} className="flex flex-col gap-4 mb-6">
          <h2 className="text-center mt-2 font-bold">New Doc</h2>
          {inputData.map((data, index) => (
            <div key={index} className="flex flex-col">
              <label className="font-bold" htmlFor="projectName">
                {data.label}{" "}
                {data.label !== "Title" && (
                  <span className="text-xs text-slate-400 font-normal">
                    &#40;optional&#41;
                  </span>
                )}
              </label>
              <input
                type="text"
                value={data.inputVal}
                onChange={handleChange}
                name={data.inputName}
                className="input max-w-[280px]"
              />
            </div>
          ))}
          <div className="flex flex-col">
            <label className="font-bold" htmlFor="desc">
              Description{" "}
              <span className="text-xs text-slate-400 font-normal">
                &#40;optional&#41;
              </span>
            </label>
            <textarea
              value={formData.desc}
              onChange={handleChange}
              id="desc"
              name="desc"
              className="input min-h-[100px]"
            />
          </div>
          <button type="submit" className="btn btn-green place-self-end-fix">
            Add Doc
          </button>
        </form>
      ) : (
        <p>{message}</p>
      )}
    </div>
  );
};

export default AddDocForm;
