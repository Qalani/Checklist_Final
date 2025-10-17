import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-context";
import { DEFAULT_THEME_ID } from "@/lib/themes";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Zen Tasks - Mindful Task Management",
  description: "A beautiful, minimalist task management application",
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
      </body>
    </html>
  );
}