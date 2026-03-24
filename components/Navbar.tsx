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
import ItsDropdown from "./ItsDropdown";
import { IoSettingsOutline } from "react-icons/io5";
import { useOfflineStore } from "@/hooks/useOfflineStore";
import { getForceOffline, setForceOfflineSetting } from "@/lib/settingsDB";
import ProjectExportImport from "@/components/Project/ProjectExportImport";
import LocalProjectsViewer from "@/components/Project/LocalProjectsViewer";

const Navbar = () => {
  const { isLoaded } = useAuth();
  const [loading, setLoading] = useState(true);
  const [showSearchPopover, setShowSearchPopover] = useState(false);
  const forceOffline = useOfflineStore((s) => s.forceOffline);
  const setForceOffline = useOfflineStore((s) => s.setForceOffline);
  const [mounted, setMounted] = useState(false);
  const [exportImportView, setExportImportView] = useState<
    null | "export" | "import"
  >(null);
  const [showLocalProjects, setShowLocalProjects] = useState(false);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey && event.key === "k") {
      event.preventDefault();
      setShowSearchPopover((prev) => !prev);
    }
  };

  useEffect(() => {
    setLoading(false);
  }, [isLoaded]);

  // Hydrate forceOffline from IndexedDB on mount
  useEffect(() => {
    setMounted(true);
    getForceOffline().then((val) => {
      if (val) {
        setForceOffline(true);
      }
    });
  }, [setForceOffline]);

  const handleToggleForceOffline = async () => {
    const next = !forceOffline;
    setForceOffline(next);
    await setForceOfflineSetting(next);
  };

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div>
      <nav className="fixed top-0 left-0 right-0 flex items-center justify-between px-2 border-b backdrop-blur-md zz-top-plus1">
        <Link href="/" className="flex items-center gap-0.5">
          <Image
            src={"/screenshot-1773695712666-transparent (1).png"}
            alt={""}
            className="p-2"
            width={50}
            height={50}
          />
          <b className="text-2xl font-thin letter-spacing-md">ITS Docs</b>
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSearchPopover(true)}
            className="btn btn-ghost btn-xs flex gap-1 items-center"
          >
            <span className="3xs:opacity-0 sm:opacity-100">Ctrl + K</span>
            <span className="3xs:text-[25px] sm:text-[16px]">
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

          <ItsDropdown
            closeWhenClicked={false}
            btnChildren={<IoSettingsOutline className="text-xl" />}
            btnClassNames="btn btn-ghost btn-round"
            menuClassNames="-translate-x-36 !backdrop-blur-none !bg-neutral-950 !bg-opacity-100"
          >
            {mounted && (
              <li
                className="btn btn-ghost !w-full flex items-center justify-between gap-2 text-sm whitespace-nowrap"
                onClick={handleToggleForceOffline}
              >
                <span>Offline Mode</span>
                <span
                  className={`inline-block w-8 h-4 rounded-full relative transition-colors ${
                    forceOffline ? "bg-red-500" : "bg-slate-600"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                      forceOffline ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </span>
              </li>
            )}
            <li
              className="btn btn-ghost !w-full text-sm whitespace-nowrap cursor-pointer"
              onClick={() => setExportImportView("export")}
            >
              Export Project
            </li>
            <li
              className="btn btn-ghost !w-full text-sm whitespace-nowrap cursor-pointer"
              onClick={() => setExportImportView("import")}
            >
              Import Project
            </li>
            <li
              className="btn btn-ghost !w-full text-sm whitespace-nowrap cursor-pointer"
              onClick={() => setShowLocalProjects(true)}
            >
              Local Projects
            </li>
            <li>
              <ModeToggle />
            </li>
          </ItsDropdown>
        </div>
      </nav>
      {showSearchPopover && (
        <div className="fixed inset-0 flex items-center justify-center zz-top-plus2">
          <SearchPopover onClose={() => setShowSearchPopover(false)} />
        </div>
      )}
      {exportImportView && (
        <ProjectExportImport
          initialView={exportImportView}
          onClose={() => setExportImportView(null)}
        />
      )}
      {showLocalProjects && (
        <LocalProjectsViewer onClose={() => setShowLocalProjects(false)} />
      )}
    </div>
  );
};

export default Navbar;
