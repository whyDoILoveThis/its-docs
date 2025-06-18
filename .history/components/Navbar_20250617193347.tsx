"use client";
import React, { useEffect, useState } from "react";
import Image from "next/image";
import ProfileLink from "@/components/ProfileLink";
import Link from "next/link";
import { ModeToggle } from "@/components/Theme/ModeToggle";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  useAuth,
  UserButton,
} from "@clerk/nextjs";
import LoaderSpinSmall from "./LoaderSpinSmall";
import SearchPopover from "./SearchPopover";
import SearchIcon from "./icons/SearchIcon";

const Navbar = () => {
  const { isLoaded } = useAuth();
  const [loading, setLoading] = useState(true);
  const [showSearchPopover, setShowSearchPopover] = useState(false);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey && event.key === "k") {
      event.preventDefault();
      setShowSearchPopover((prev) => !prev);
    }
  };

  useEffect(() => {
    setLoading(false);
  }, [isLoaded]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div>
      <nav className="fixed top-0 left-0 right-0 flex items-center justify-between px-2 border-b backdrop-blur-md zz-top">
        <Link href="/" className="flex items-center gap-0.5">
          <Image
            src={"/LOGODOCS.png"}
            alt={""}
            className="h-auto"
            width={50}
            height={50}
          />
          <b className="text-lg">ItsDocs</b>
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSearchPopover(true)}
            className="btn btn-ghost btn-xs flex gap-1 items-center"
          >
            <span className="sm: hidden">Ctrl + K</span>
            <span className="text-[16px]">
              <SearchIcon />
            </span>
          </button>
          <span className="mr-2.5">
            <ProfileLink />
          </span>
          {loading ? (
            <LoaderSpinSmall />
          ) : (
            <span className="h-7">
              <SignedOut>
                {loading ? (
                  <LoaderSpinSmall />
                ) : (
                  <div className="-translate-x-3.5 hover:underline">
                    <SignInButton mode="modal" />
                  </div>
                )}
              </SignedOut>
              <SignedIn>
                {loading ? <LoaderSpinSmall /> : <UserButton />}
              </SignedIn>
            </span>
          )}
          <ModeToggle />
        </div>
      </nav>
      {showSearchPopover && (
        <div className="fixed inset-0 flex items-center justify-center zz-top-plus2">
          <SearchPopover onClose={() => setShowSearchPopover(false)} />
        </div>
      )}
    </div>
  );
};

export default Navbar;
