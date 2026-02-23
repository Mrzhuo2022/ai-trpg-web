import { useState, useEffect } from "react";

export type ViewMode = "play" | "library" | "admin";

function detectViewFromPath(pathname: string): ViewMode {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/play")) return "play";
  return "library";
}

export function useNavigation() {
  const [view, setView] = useState<ViewMode>(() =>
    detectViewFromPath(window.location.pathname)
  );

  useEffect(() => {
    const onPopState = () => setView(detectViewFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (next: ViewMode) => {
    if (next === view) return;
    const path =
      next === "admin" ? "/admin" : next === "play" ? "/play" : "/library";
    window.history.pushState(null, "", path);
    setView(next);
  };

  return { view, navigate } as const;
}
