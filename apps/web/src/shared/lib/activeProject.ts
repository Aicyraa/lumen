import { useSyncExternalStore } from "react";

// The project this tab is showing. It rides along as X-Project-Id so the API can refuse a call made after another
// tab switched the session's active project (409 project_mismatch) instead of mixing two projects' data.
let activeId = "";
let mismatched = false;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

export function setActiveProjectId(id: string) {
  if (id === activeId) return;
  activeId = id;
  mismatched = false;
  emit();
}

export const projectMismatched = () => mismatched;
export function flagProjectMismatch() {
  mismatched = true;
  emit();
}
export function resetProjectMismatch() {
  mismatched = false;
  emit();
}
export const isProjectMismatch = (e: unknown) =>
  (e as { code?: string })?.code === "project_mismatch";

export function useProjectMismatch() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => mismatched,
  );
}

// Project data routes and Better Auth's API key routes. Not /workspaces or /account, which the API does not scope.
const SCOPED = /\/api\/(auth\/api-key\/|dashboard\/(?!workspaces|account))/;

export function withProjectId(url: string, headers: Headers) {
  if (activeId && SCOPED.test(url)) headers.set("x-project-id", activeId);
  return headers;
}
