import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-context";
import { DEFAULT_THEME_ID } from "@/lib/themes";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Zen Workspace - Mindful Productivity Hub",
  description: "A beautiful, minimalist productivity workspace",
  applicationName: "Zen Workspace",
  themeColor: "#6366f1",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Zen Workspace",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME_ID}>
      <body className={inter.className}>
        <ThemeProvider>{children}</ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}