import type { ReactNode } from "react";

// One loading, empty or error message for every dashboard tab: centred in the free content area, heading stays on top.
export function StatusMessage({
  state,
  children,
  onRetry,
}: {
  state: "loading" | "empty" | "error";
  children: ReactNode;
  onRetry?: () => unknown;
}) {
  return (
    <div role={state === "error" ? "alert" : "status"} className={`status-msg status-msg-${state}`}>
      <p className="status-msg-text">{children}</p>
      {state === "error" && onRetry && (
        <button type="button" className="btn btn-outline" onClick={() => void onRetry()}>
          Retry
        </button>
      )}
    </div>
  );
}
