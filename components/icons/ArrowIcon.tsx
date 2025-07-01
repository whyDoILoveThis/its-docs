"use client";

import {
  FaArrowRightLong,
  FaArrowLeftLong,
  FaArrowDownLong,
  FaArrowUpLong,
} from "react-icons/fa6";

interface Props {
  size?: number;
  direction?: "left" | "right" | "up" | "down";
}

const ArrowIcon = ({ size = 24, direction = "right" }: Props) => {
  switch (direction) {
    case "left":
      return <FaArrowLeftLong size={size} />;
    case "right":
      return <FaArrowRightLong size={size} />;
    case "up":
      return <FaArrowUpLong size={size} />;
    case "down":
      return <FaArrowDownLong size={size} />;
    default:
      return <FaArrowRightLong size={size} />; // fallback
  }
};

export default ArrowIcon;
