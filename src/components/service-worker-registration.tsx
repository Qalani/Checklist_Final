"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const register = async () => {
        try {
          const registration = await navigator.serviceWorker.register(
            "/service-worker.js",
            { scope: "/" }
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
