"use client";
import { useEffect, useRef } from "react";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebaseConfig";
import { useOfflineStore } from "@/hooks/useOfflineStore";

const PING_URL = `${process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL}/ping.json`;
const PING_THROTTLE_MS = 2000;

export function useFirebasePresence() {
  const lastPingRef = useRef(0);

  useEffect(() => {
    // ── .info/connected listener (baseline) ──
    let hasConnected = false;
    const connectedRef = ref(rtdb, ".info/connected");
    const unsubscribe = onValue(connectedRef, (snapshot) => {
      const connected = snapshot.val() === true;
      if (connected) {
        hasConnected = true;
        useOfflineStore.getState().goOnline();
      } else if (hasConnected) {
        useOfflineStore.getState().goOffline();
      }
    });

    // ── On every click, fetch-ping RTDB REST API for instant offline detection ──
    const handleClick = () => {
      const now = Date.now();
      if (now - lastPingRef.current < PING_THROTTLE_MS) return;
      lastPingRef.current = now;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      fetch(PING_URL, { signal: controller.signal })
        .then(() => {
          clearTimeout(timeout);
          // Got any HTTP response = network is up
          useOfflineStore.getState().goOnline();
        })
        .catch(() => {
          clearTimeout(timeout);
          useOfflineStore.getState().goOffline();
        });
    };

    window.addEventListener("click", handleClick);

    return () => {
      unsubscribe();
      window.removeEventListener("click", handleClick);
    };
  }, []);
}
