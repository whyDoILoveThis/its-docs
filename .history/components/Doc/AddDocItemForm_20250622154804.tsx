import PlusIcon from "@/components/icons/PlusIcon";
import LoaderSpinSmall from "@/components/LoaderSpinSmall";
import React, { useEffect, useState } from "react";
import docItemStyles from "./docItemStyles";
import CameraIcon from "../icons/CameraIcon";

interface Props {
  handleAddDocItem: (e: React.FormEvent) => void;
  formData: DocItem;
  setFormData: (item: DocItem) => void;
}
const AddDocItemForm = ({ handleAddDocItem, formData, setFormData }: Props) => {
  const [inputColor, setInputColor] = useState("btn-blue");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setFormData({ ...formData, style: "btn-blue" });
  }, []);

  return (
    <form
      className="fixed bottom-2 flex flex-col gap-2 items-center w-full left-0"
      onSubmit={(e) => {
        setLoading(true);
        handleAddDocItem(e);
      }}
    >
      <div className="flex items-center gap-2">
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
                "!border-emerald-500 !text-emerald-200 absolute right-0 top-6"
              }
            !border-opacity-75 backdrop-blur-md`}
          >
            {btn.text === "Pic" ? <CameraIcon /> : btn.text}
          </button>
        ))}
      </div>
      <div
        className={`btn btn-nohover !cursor-default !border-opacity-75 ${
          inputColor === "code"
            ? "!border-purple-500"
            : inputColor !== "text-xl font-bold " && inputColor
        } backdrop-blur-md flex justify-between items-center`}
      >
        {inputColor === "code" ? (
          <textarea
            onChange={(e) => {
              setFormData({ ...formData, text: e.target.value });
            }}
            className="bg-transparent focus:outline-none"
          />
        ) : (
          <input
            onChange={(e) => {
              setFormData({ ...formData, text: e.target.value });
            }}
            className="bg-transparent focus:outline-none"
            type="text"
          />
        )}
        {formData.text !== "" && (
          <button
            disabled={loading}
            className="btn btn-round text-2xl"
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
