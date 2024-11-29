"use client";

import * as React from "react";
import { IoFlashlight } from "react-icons/io5";
import { GiNightSky } from "react-icons/gi";
import { useTheme } from "next-themes";

export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark" || null;

  return (
    <button
      className="btn btn-ghost btn-round"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <div>
        {theme === "dark" ? (
          <IoFlashlight className="text-xl" />
        ) : theme === "light" ? (
          <GiNightSky className="text-2xl" />
        ) : (
          !theme && <IoFlashlight className="text-xl" />
        )}
      </div>
    </button>
  );
}
