import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate } from "react-router";

// The API answers 403 no_active_project when the session has no (or no longer a valid) active project.
// Whatever request got it, the way forward is the Projects page.
export function NoProjectRedirect() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => {
    const check = (e: unknown) => {
      const ev = e as {
        type?: string;
        action?: { type?: string; error?: { code?: string } };
        mutation?: { state?: { error?: { code?: string } } };
      };
      const code =
        ev.action?.type === "error" ? ev.action.error?.code : ev.mutation?.state?.error?.code;
      if (code === "no_active_project") navigate("/projects", { replace: true });
    };
    const a = qc.getQueryCache().subscribe(check);
    const b = qc.getMutationCache().subscribe(check);
    return () => {
      a();
      b();
    };
  }, [qc, navigate]);
  return null;
}
