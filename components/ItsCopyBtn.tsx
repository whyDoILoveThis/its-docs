"use client";
import React, { useState } from "react";

interface Props {
  text: string;
  classNames?: string;
  btnText?: string | React.ReactNode;
  copiedText?: string | React.ReactNode;
  copiedClassNames?: string;
}
const ItsCopyBtn = ({
  text,
  classNames,
  btnText,
  copiedText,
  copiedClassNames,
}: Props) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard
      .writeText(text) // 📋 Just like... copies it, man
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000); // Keeps "Copied!" for a bit
      })
      .catch((err) => {
        console.error("Failed to copy: ", err);
      });
  };

  return (
    <button
      onClick={handleCopy}
      className={`btn select-none text-sm ${
        copied && !copiedClassNames && " btn-green"
      } ${classNames && classNames} ${
        copied && copiedClassNames && copiedClassNames
      }`}
    >
      {copied && copiedText
        ? copiedText
        : copied && !copiedText
        ? "✔ Copied"
        : btnText
        ? btnText
        : "Copy"}
    </button>
  );
};

export default ItsCopyBtn;
