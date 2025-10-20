import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zen Workspace",
    short_name: "Zen",
    description:
      "A composed productivity companion that keeps tasks, rituals, notes, and relationships gracefully aligned with the Solace palette.",
    start_url: "/",
    display: "standalone",
    background_color: "#0E1622",
    theme_color: "#7199B6",
    orientation: "any",
    icons: [],
  };
}
