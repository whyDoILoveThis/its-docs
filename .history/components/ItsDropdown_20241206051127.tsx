"use client";
import React, { useState, useRef, useEffect } from "react";

interface Props {
  closeWhenClicked?: boolean;
  children: React.ReactNode;
  btnText: React.ReactNode | string;
  btnClassNames?: string;
  menuClassNames?: string;
}
const ItsDropdown = ({
  closeWhenClicked = false,
  children,
  btnText,
  btnClassNames,
  menuClassNames,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropBtnRef = useRef<HTMLButtonElement>(null);

  // Toggle dropdown open/close on button click
  const handleToggle = () => {
    setIsOpen(!isOpen);
  };
  // Close dropdown if clicking outside of it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        dropBtnRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !dropBtnRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    // Add event listener
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      // Clean up listener on unmount
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  return (
    <article className="relative flex justify-center items-center zz-top">
      <div>
        <button
          type="button"
          className={`cursor-pointer z-zero ${btnClassNames}`}
          ref={dropBtnRef}
          onClick={handleToggle}
        >
          {btnText}
        </button>
        <div
          onClick={() => closeWhenClicked && handleToggle()}
          ref={dropdownRef}
          className={`absolute selection:bg-transparent transition-all duration-400 z-50 min-w-[8rem] rounded-md bg-black bg-opacity-20 shadow-md ${
            isOpen
              ? `opacity-100 p-2 w-fit h-fit border overflow-visible ${
                  menuClassNames && menuClassNames
                }`
              : `opacity-70 border-none p-0 w-0 h-0 overflow-hidden ${
                  menuClassNames && menuClassNames
                }`
          }`}
        >
          <div className="zz-top flex flex-col gap-2">
            <div className="z-ten absolute inset-0 rounded-md backdrop-blur-md"></div>{" "}
            <ul className="text-shadow zz-top">{children}</ul>
          </div>
        </div>
      </div>
    </article>
  );
};

export default ItsDropdown;
