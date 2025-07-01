"use client";
import React, { useEffect, useRef, useState } from "react";
import CameraReelIcon from "./icons/CameraReelIcon";

interface Props {
  image: File | null;
  setImage: (img: File | null) => void;
  setImageUrl: (url: string) => void;
  btnClassnames?: string;
}
const ItsFileInput = ({
  image,
  setImage,
  setImageUrl,
  btnClassnames,
}: Props) => {
  const [isHovering, setIsHovering] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      // Use FileReader to read and display the image
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setImageUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const clearFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ""; // Clear the file input
    }
  };

  useEffect(() => {
    if (image === null) {
      clearFileInput();
    }
  }, [image]);
  return (
    <div className=" cursor-pointer w-fit flex justify-center relative">
      <span
        className={`border bg-white bg-opacity-15 ${
          isHovering && "bg-opacity-5"
        } text-xl text-blue-400 rounded-full p-[0.42rem] border-blue-500 ${
          btnClassnames && btnClassnames
        }`}
      >
        <CameraReelIcon />
      </span>
      <input
        onMouseEnter={() => {
          setIsHovering(true);
        }}
        onMouseLeave={() => {
          setIsHovering(false);
        }}
        ref={fileInputRef}
        id="image"
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className=" w-full h-full cursor-pointer absolute opacity-0"
      />
    </div>
  );
};

export default ItsFileInput;
