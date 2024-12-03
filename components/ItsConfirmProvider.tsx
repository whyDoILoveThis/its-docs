// ConfirmContext.tsx
"use client";
import React, { createContext, useContext, useState, ReactNode } from "react";

interface ConfirmContextType {
  ItsConfirm: (message: string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context;
};

export const ItsConfirmProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [message, setMessage] = useState<string | null>(null);
  const [resolveCallback, setResolveCallback] =
    useState<(value: boolean) => void>();

  const ItsConfirm = (msg: string) => {
    setMessage(msg);
    return new Promise<boolean>((resolve) => {
      setResolveCallback(() => resolve);
    });
  };

  const handleConfirm = (result: boolean) => {
    if (resolveCallback) {
      resolveCallback(result);
      setMessage(null);
    }
  };

  return (
    <ConfirmContext.Provider value={{ ItsConfirm }}>
      {children}
      {message && (
        <div className="zz-top fixed left-0 right-0 top-0 bottom-0 flex items-center justify-center bg-black bg-opacity-20 backdrop-blur-md">
          <div className="bg-white bg-opacity-20 p-4 rounded-md shadow-md">
            <p className="text-lg text-slate-300 mb-4">{message}</p>
            <div className="flex justify-center gap-4">
              <button className="btn" onClick={() => handleConfirm(false)}>
                NO!
              </button>
              <button
                className="btn btn-red"
                onClick={() => handleConfirm(true)}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};
