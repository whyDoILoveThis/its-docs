"use client";
import axios, { AxiosResponse, AxiosError } from "axios";
import { v4 } from "uuid";
import { useOfflineStore } from "@/hooks/useOfflineStore";
import { useToast } from "@/hooks/use-toast";

interface OfflineFetchOptions {
  label: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  body?: unknown;
}

function isNetworkError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return true; // unknown error, treat as offline
  const axErr = err as AxiosError;
  // If there's a response, the server replied (4xx/5xx) — NOT a network issue
  if (axErr.response) return false;
  // No response = network failure, timeout, DNS, etc.
  return true;
}

const TIMEOUT_MS = 10_000;

export function useOfflineFetch() {
  const { toast } = useToast();

  const queueOffline = (opts: OfflineFetchOptions) => {
    const { goOffline, addChange } = useOfflineStore.getState();
    goOffline();
    addChange({
      id: v4(),
      label: opts.label,
      method: opts.method,
      url: opts.url,
      body: opts.body,
      createdAt: Date.now(),
    });
    toast({ title: `Saved offline: ${opts.label}`, variant: "blue" });
  };

  const offlineFetch = async (
    opts: OfflineFetchOptions,
  ): Promise<AxiosResponse | null> => {
    // Read isOnline at call time (not render time) to avoid stale closures
    const { isOnline } = useOfflineStore.getState();

    if (!isOnline) {
      queueOffline(opts);
      return null;
    }

    try {
      let response: AxiosResponse;

      switch (opts.method) {
        case "GET":
          response = await axios.get(opts.url, { timeout: TIMEOUT_MS });
          break;
        case "POST":
          response = await axios.post(opts.url, opts.body, {
            timeout: TIMEOUT_MS,
          });
          break;
        case "PUT":
          response = await axios.put(opts.url, opts.body, {
            timeout: TIMEOUT_MS,
          });
          break;
        case "DELETE":
          response = await axios.delete(opts.url, {
            data: opts.body,
            timeout: TIMEOUT_MS,
          });
          break;
        default:
          response = await axios.post(opts.url, opts.body, {
            timeout: TIMEOUT_MS,
          });
      }

      return response;
    } catch (err) {
      if (isNetworkError(err)) {
        queueOffline(opts);
        return null;
      }
      throw err;
    }
  };

  return { offlineFetch };
}
