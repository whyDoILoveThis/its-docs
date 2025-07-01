"use client";
import React, { useEffect, useState } from "react";

interface Props {
  width?: string;
  height?: string;
  ClassNames?: string;
  duration?: number;
}
const ItsSkeleton = ({
  width = "100px",
  height = "60px",
  ClassNames,
  duration = 800,
}: Props) => {
  const [move, setMove] = useState(false);

  useEffect(() => {
    setMove(!move);
  }, []);

  useEffect(() => {
    setTimeout(() => {
      setMove(!move);
    }, duration);
  }, [move]);

  return (
    <div
      className={`bg-slate-400 transition-opacity duration-1000 ${
        move ? "opacity-0" : "opacity-100"
      } ${ClassNames ? ClassNames : "rounded-md"}`}
      style={{ width, height }}
    />
  );
};

export default ItsSkeleton;
