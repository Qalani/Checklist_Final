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
        <ThemeProvider>
          <GlobalNav />
          <QuickCreateFAB />
          {/* pb-16 offsets the mobile bottom tab bar; lg:pl-16 offsets the desktop sidebar */}
          <ErrorBoundary>
            <div className="pb-16 lg:pb-0 lg:pl-16">{children}</div>
          </ErrorBoundary>
        </ThemeProvider>
        <ServiceWorkerRegistration />
        <PushNotificationInitializer />
        <OfflineIndicator />
      </body>
    </html>
  );
}
