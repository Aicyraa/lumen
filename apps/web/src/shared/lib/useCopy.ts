import { useEffect, useRef, useState } from "react";

export const COPY_FAILED = "Copy failed, select and copy manually";

// "copied" only after the clipboard write resolved; a refusal or a missing clipboard API gives "failed".
// resetMs clears the state after a while (omit to keep it, as the one-time key dialog does).
export function useCopy(resetMs?: number) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy(text: string) {
    let next: "copied" | "failed" = "copied";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      next = "failed"; // also covers navigator.clipboard being undefined (insecure context)
    }
    setState(next);
    clearTimeout(timer.current);
    if (resetMs) timer.current = setTimeout(() => setState("idle"), resetMs);
  }
  const reset = () => setState("idle");
  return { state, copy, reset };
}
