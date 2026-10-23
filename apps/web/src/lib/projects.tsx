import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { api } from "./api";
import { authClient } from "./auth-client";
import { readSession } from "./sessionShape";

// A project is a Better Auth organization and is the tenant.
export interface Workspace {
  id: string; name: string; slug: string; description: string | null; role: "owner" | "admin" | "member";
  created_at: string; documents: number; requests_this_month: number;
}

export const ProjectContext = createContext<Workspace | null>(null);
export function useProject(): Workspace {
  const p = useContext(ProjectContext);
  if (!p) throw new Error("useProject must be used inside a project route");
  return p;
}

export function useWorkspaces() {
  const { userId } = readSession(authClient.useSession());
  return useQuery({
    queryKey: ["workspaces", userId],
    enabled: !!userId,
    queryFn: () => api<{ workspaces?: Workspace[] }>("/api/dashboard/workspaces").then((r) => r.workspaces ?? []),
  });
}
