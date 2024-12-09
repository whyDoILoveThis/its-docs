"use client";
import { useEffect, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import ClipboardIcon from "./icons/ClipboardIcon";
import ClipboardCheckIcon from "./icons/ClipboardCheckIcon";
import ItsCopyBtn from "./ItsCopyBtn";

export default function ItsCode({
  code,
  lang,
}: {
  code: string;
  lang: string;
}) {
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (copying) {
      setTimeout(() => {
        setCopying(false);
      }, 400);
    }
  }, [copying]);

  return (
    <article>
      <div
        className="w-fit"
        onClick={() => {
          setCopying(true);
        }}
      >
        <ItsCopyBtn
          btnText={
            <span className="flex gap-1 items-center">
              <ClipboardIcon /> Copy
            </span>
          }
          copiedText={
            <span className="flex gap-1 items-center">
              <ClipboardCheckIcon /> Copied
            </span>
          }
          classNames="btn-ghost"
          text={code}
        />
      </div>

      <div className="relative z-lowest">
        <span
          className={` ${
            !copying ? "opacity-0 w-0 h-0" : "w-full h-full opacity-100"
          } rounded-lg absolute flex justify-center text-3xl text-slate-800 pt-2 font-bold bg-slate-500 transition-all duration-500 text-nowrap`}
        >
          <p className="min-w-[150px] select-none">Copied🤗</p>
        </span>
        <SyntaxHighlighter
          className=" w-[80vw] max-w-[500px] p-0 m-0 rounded-lg"
          language={lang}
          style={vscDarkPlus}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </article>
  );
}
