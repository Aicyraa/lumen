import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { authClient } from "./auth-client";

// Only leaves when sign-out really worked: no throw, no error result, and no session afterwards.
// The cache is cleared either way, so nothing from this account outlives the attempt.
export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  async function signOut() {
    setFailed(false);
    let ok = false;
    try {
      const res = await authClient.signOut();
      ok = !res?.error && !(await authClient.getSession())?.data;
    } catch {
      ok = false;
    } finally {
      qc.clear();
    }
    if (ok) navigate("/");
    else setFailed(true);
  }
  return { signOut, failed };
}
