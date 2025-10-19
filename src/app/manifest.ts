import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zen Workspace",
    short_name: "Zen Workspace",
    description:
      "A beautiful, minimalist productivity workspace to keep your tasks, routines, and reflections aligned.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#6366f1",
    orientation: "any",
    icons: [],
  };
}
