import { useEffect } from "react";

const DEFAULT_TITLE = "Lumen"; // same as index.html

// Sets the tab title for the page that calls it and puts the default back when the page goes away.
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ${DEFAULT_TITLE}`;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title]);
}
