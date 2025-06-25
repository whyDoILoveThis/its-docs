import PlusIcon from "@/components/icons/PlusIcon";
import LoaderSpinSmall from "@/components/LoaderSpinSmall";
import React, { useEffect, useState } from "react";
import docItemStyles from "./docItemStyles";
import CameraIcon from "../icons/CameraIcon";
import FileInputButton from "../FileInputButton";
import Image from "next/image";

interface Props {
  handleAddDocItem: () => void;
  formData: DocItem;
  setFormData: (item: DocItem) => void;
}
const AddDocItemForm = ({ handleAddDocItem, formData, setFormData }: Props) => {
  const [inputColor, setInputColor] = useState("btn-blue");
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>("");

  useEffect(() => {
    setFormData({ ...formData, style: "btn-blue" });
  }, []);

  useEffect(() => {
    setFormData({ ...formData, text: imageUrl, style: "pic" });
  }, [imageUrl]);

  return (
    <form
      className="fixed bottom-2 flex flex-col gap-2 items-center w-full left-0"
      onSubmit={(e) => {
        e.preventDefault();
        setLoading(true);
        handleAddDocItem();
      }}
    >
      <div className="relative flex items-center gap-2">
        {docItemStyles.map((btn, index) => (
          <button
            key={index}
            type="button"
            onClick={() => {
              setInputColor(btn.color);

              setFormData({ ...formData, style: btn.color });
            }}
            className={`btn btn-xs btn-squish ${
              btn.color === inputColor ? "opacity-100" : "opacity-60"
            } hover:opacity-100  ${
              btn.text !== "Section" && btn.text !== "Code" && btn.color
            }  ${btn.text === "Code" && "!border-purple-500 !text-purple-200"}
              ${
                btn.text === "Pic" &&
                "!border--500 !text-blue-400 absolute left-0 top-8"
              }
            !border-opacity-75 backdrop-blur-md`}
          >
            {btn.text}
          </button>
        ))}
      </div>
      <div
        className={`btn btn-nohover !cursor-default !border-opacity-75 ${
          inputColor === "code"
            ? "!border-purple-500"
            : inputColor !== "text-xl font-bold " && inputColor
        } backdrop-blur-md flex justify-between items-center ${
          inputColor === "pic" && "flex-col"
        }`}
      >
        {imageUrl && (
          <Image
            className=""
            width={300}
            height={50}
            src={imageUrl}
            alt="screenshot"
          />
        )}
        {inputColor === "code" ? (
          <textarea
            onChange={(e) => {
              setFormData({ ...formData, text: e.target.value });
            }}
            className="bg-transparent focus:outline-none"
          />
        ) : inputColor === "pic" ? (
          <div
            className={`absolute right-10 bottom-0 ${
              imageUrl !== "" && "mt-2"
            } items-center`}
          >
            <FileInputButton setImage={setImage} setImageUrl={setImageUrl} />
          </div>
        ) : (
          <input
            onChange={(e) => {
              setFormData({ ...formData, text: e.target.value });
            }}
            className="bg-transparent focus:outline-none"
            type="text"
          />
        )}
        {imageUrl !== "" && (
          <button
            onClick={() => {
              setImageUrl("");
              setFormData({ ...formData, text: "" });
            }}
            type="button"
            className="absolute bottom-0 right-0 btn btn-round btn-red text-3xl"
          >
            -
          </button>
        )}
        {formData.text !== "" && (
          <button
            disabled={loading}
            className={`btn ${inputColor} btn-round text-2xl `}
            type="submit"
          >
            {loading ? <LoaderSpinSmall /> : <PlusIcon />}
          </button>
        )}
      </div>
    </form>
  );
};

export default AddDocItemForm;
