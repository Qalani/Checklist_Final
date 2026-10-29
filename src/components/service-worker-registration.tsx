"use client";

import { useEffect } from "react";
import { isCapacitorNative } from "@/lib/capacitor-auth";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    // Native builds already bundle every asset; development chunks are unstable.
    if (process.env.NODE_ENV === "production" && !isCapacitorNative() && "serviceWorker" in navigator) {
      const register = async () => {
        try {
          const registration = await navigator.serviceWorker.register(
            "/service-worker.js",
            { scope: "/", updateViaCache: "none" }
          );

          if (process.env.NODE_ENV === "development") {
            console.info("Service worker registered", registration);
          }
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.error("Service worker registration failed", error);
          }
        }
      };

      register();
    }
  }, []);

  return null;
}
