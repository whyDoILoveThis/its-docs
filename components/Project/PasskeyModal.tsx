"use client";
import React, { useEffect, useState } from "react";
import { setPasskey, hasPasskey } from "@/lib/passkey";
import CloseIcon from "@/components/icons/CloseIcon";

interface Props {
  projectUid: string;
  onClose: () => void;
}

const PasskeyModal = ({ projectUid, onClose }: Props) => {
  const [passkey, setPasskeyValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [hasExisting, setHasExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    hasPasskey(projectUid).then(setHasExisting);
  }, [projectUid]);

  const handleSave = async () => {
    setError("");
    setSuccess("");

    if (passkey.length < 4) {
      setError("Passkey must be at least 4 characters");
      return;
    }
    if (passkey !== confirm) {
      setError("Passkeys do not match");
      return;
    }

    setSaving(true);
    try {
      await setPasskey(projectUid, passkey);
      setSuccess(hasExisting ? "Passkey updated!" : "Passkey set!");
      setHasExisting(true);
      setPasskeyValue("");
      setConfirm("");
      setTimeout(onClose, 800);
    } catch {
      setError("Failed to save passkey");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 zz-top bg-black bg-opacity-40 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white bg-opacity-10 backdrop-blur-md border border-slate-700 rounded-lg p-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {hasExisting ? "Update Passkey" : "Set Passkey"}
          </h2>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-round cursor-pointer"
          >
            <CloseIcon />
          </button>
        </div>

        <p className="text-xs text-slate-400">
          {hasExisting
            ? "Enter a new passkey to replace the current one."
            : "Set a passkey to access your project settings while offline."}
        </p>

        <input
          type="password"
          placeholder="Passkey"
          value={passkey}
          onChange={(e) => setPasskeyValue(e.target.value)}
          className="input"
          autoFocus
        />
        <input
          type="password"
          placeholder="Confirm passkey"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="input"
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
        />

        {error && <p className="text-red-400 text-xs">{error}</p>}
        {success && <p className="text-green-400 text-xs">{success}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-blue w-full cursor-pointer"
        >
          {saving
            ? "Saving..."
            : hasExisting
              ? "Update Passkey"
              : "Set Passkey"}
        </button>
      </div>
    </div>
  );
};

export default PasskeyModal;
