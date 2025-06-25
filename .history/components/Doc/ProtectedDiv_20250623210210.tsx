"use client";
import { useEffect } from "react";

export default function ProtectedElement() {
  useEffect(() => {
    const targetId = "protected-div";
    const observer = new MutationObserver(() => {
      if (!document.getElementById(targetId)) {
        const el = document.createElement("div");
        el.id = targetId;
        el.className =
          "w-[65px] rounded-sm overflow-hidden bg-black bg-opacity-20 h-[25px] backdrop-blur-sm fixed place-self-start";
        document.body.appendChild(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return (
    <div
      id="protected-div"
      className="w-[65px] rounded-sm overflow-hidden bg-black bg-opacity-20 h-[25px] backdrop-blur-sm fixed place-self-start"
    />
  );
}
