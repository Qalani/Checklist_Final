import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-context";
import { DEFAULT_THEME_ID } from "@/lib/themes";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { PushNotificationInitializer } from "@/components/PushNotificationInitializer";
import ErrorBoundary from "@/components/ErrorBoundary";
import { GlobalNav } from "@/components/GlobalNav";
import { QuickCreateFAB } from "@/components/QuickCreateFAB";

export const metadata: Metadata = {
  title: "Zen Workspace - Composed Productivity Hub",
  description: "A sleek, calming productivity platform for harmonising tasks, notes, and relationships.",
  applicationName: "Zen Workspace",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Zen Workspace",
  },
};

export const viewport: Viewport = {
  themeColor: "#7199B6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME_ID}>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-sage-600 focus:text-white focus:rounded-xl"
        >
          Skip to main content
        </a>
        <ThemeProvider>
          <GlobalNav />
          <QuickCreateFAB />
          {/* pb-28 offsets the floating mobile pill nav; lg:pl-16 offsets the desktop sidebar */}
          <ErrorBoundary>
            <div id="main-content" className="pb-28 lg:pb-0 lg:pl-16">{children}</div>
          </ErrorBoundary>
        </ThemeProvider>
        <ServiceWorkerRegistration />
        <PushNotificationInitializer />
        <OfflineIndicator />
      </body>
    </html>
  );
}
