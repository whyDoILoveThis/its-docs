import ItsDatePicker from "@/components/ItsDatePicker";
import ItsFileInput from "@/components/ItsFileInput";
import LoaderSpinner from "@/components/LoaderSpinner";
import { useUserStore } from "@/hooks/useUserStore";
import { fbUploadImage } from "@/lib/firebaseStorage";
import Image from "next/image";
import React, { useEffect, useState } from "react";
import { v4 } from "uuid";

interface Props {
  refetchProjects: () => void;
}
const AddProjForm = ({ refetchProjects }: Props) => {
  const { dbUser } = useUserStore();
  const [theDate, setTheDate] = useState<Date>(new Date());
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [message, setMessage] = useState("");
  const [formData, setFormData] = useState<Project>({
    uid: "",
    birth: new Date(),
    creatorUid: "",
    title: "",
    desc: "",
    logoUrl: "",
    docs: [],
  });
  const [loading, setLoading] = useState(false);
  const creatorUid = dbUser?.uid || "";
  const uniqueId = v4();
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
      creatorUid,
      uid: uniqueId,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!dbUser) return;

    setLoading(true);
    try {
      let tempImgUrl = "";
      if (image) {
        console.log("upload attempt");

        tempImgUrl = await fbUploadImage(image);
        console.log("upload complete");
      } else {
      }

      const projPayload = {
        ...formData,
        logoUrl: tempImgUrl,
        uid: uniqueId,
      };

      console.log(projPayload);

      const response = await fetch("/api/addProject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userUid: dbUser.uid, project: projPayload }),
      });

      const data = await response.json();
      setMessage(data.message || data.error);
      setLoading(false);
      refetchProjects();
    } catch (error) {
      console.error("❌ An error occurred:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    setFormData({ ...formData, birth: theDate });
  }, [theDate]);

  const inputData = [
    {
      label: "Project Name",
      inputVal: formData.title,
      inputName: "title",
    },
    {
      label: "Description",
      inputVal: formData.desc,
      inputName: "desc",
    },
  ];

  console.log(formData);

  return (
    <div>
      {loading && <LoaderSpinner />}
      {message === "" ? (
        <form
          onSubmit={handleSubmit}
          className="p-2 flex flex-col gap-4 items-center"
        >
          <div className="flex flex-col items-center">
            <label className="place-self-start font-bold" htmlFor="file">
              Logo &#40;optional&#41;
            </label>
            <ItsFileInput setImage={setImage} setImageUrl={setImageUrl} />
            {imageUrl && (
              <Image width={150} height={100} src={imageUrl} alt={imageUrl} />
            )}
          </div>
          {inputData.map((data, index) => (
            <div key={index} className="flex flex-col">
              <label className="font-bold" htmlFor="projectName">
                {data.label}
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
            <label className="font-bold" htmlFor="">
              Project Birth
            </label>
            <ItsDatePicker onDateChange={setTheDate} useMonthNames={true} />
          </div>
          <button type="submit" className="btn btn-green place-self-end-fix">
            Add Project
          </button>
        </form>
      ) : (
        <p>{message}</p>
      )}
    </div>
  );
};

export default AddProjForm;
