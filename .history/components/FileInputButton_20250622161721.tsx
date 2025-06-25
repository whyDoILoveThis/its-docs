"use client";
import React, { useState } from "react";
import CameraReelIcon from "./icons/CameraReelIcon";

interface Props {
  setImage: (img: File | null) => void;
  setImageUrl: (url: string) => void;
}
const ItsFileInput = ({ setImage, setImageUrl }: Props) => {
  const [isHovering, setIsHovering] = useState(false);

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
  return (
    <div className=" cursor-pointer w-fit flex justify-center relative">
      <span
        className={`btn border-t-secondary-foreground ${
          isHovering && "bg-opacity-20"
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
