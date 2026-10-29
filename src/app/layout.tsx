import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";
import { ThemeProvider } from "@/lib/theme-context";
import { DEFAULT_THEME_ID } from "@/lib/themes";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { OfflineBootstrap } from "@/components/OfflineBootstrap";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { PushNotificationInitializer } from "@/components/PushNotificationInitializer";
import ErrorBoundary from "@/components/ErrorBoundary";
import { GlobalNav } from "@/components/GlobalNav";
import { QuickCreateFAB } from "@/components/QuickCreateFAB";
import { ActionFeedbackProvider } from "@/components/ActionFeedback";
import "./globals.css";
import "./mobile.css";

const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-body",
  display: "swap",
});

const sora = localFont({
  src: "./fonts/sora-latin-wght-normal.woff2",
  weight: "100 800",
  variable: "--font-display",
  display: "swap",
});

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
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME_ID} className={`${inter.variable} ${sora.variable}`}>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-sage-600 focus:text-white focus:rounded-xl"
        >
          Skip to main content
        </a>
        <ThemeProvider>
          <ActionFeedbackProvider>
            <Suspense fallback={null}><GlobalNav /></Suspense>
            <QuickCreateFAB />
            {/* Keep content clear of the mobile navigation and labeled desktop sidebar. */}
            {/* pt-[env(safe-area-inset-top)] ensures content clears the phone's status bar on mobile */}
            <ErrorBoundary>
              <div id="main-content" className="app-shell pb-28 pt-[env(safe-area-inset-top)] lg:pb-0 lg:pl-56 lg:pt-0">{children}</div>
            </ErrorBoundary>
          </ActionFeedbackProvider>
        </ThemeProvider>
        <ServiceWorkerRegistration />
        <OfflineBootstrap />
        <PushNotificationInitializer />
        <OfflineIndicator />
      </body>
    </html>
  );
}
