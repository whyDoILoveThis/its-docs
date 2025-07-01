import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const toggleScrollLock = (shouldLock: boolean) => {
  if (typeof window === "undefined") return;

  if (shouldLock) {
    document.body.style.overflow = "hidden"; // 🛑 Prevent scrolling
  } else {
    document.body.style.overflow = ""; // ✅ Restore scrolling
  }
};

