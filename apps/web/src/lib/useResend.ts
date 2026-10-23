import { useState } from "react";
import { authClient } from "./auth-client";

// Resend the verification email. The API rate-limits it (429), so that case gets its own wording.
export function useResend() {
  const [state, setState] = useState<{ status: "idle" | "sending" | "sent" | "error"; message: string }>({ status: "idle", message: "" });
  async function resend(email: string) {
    setState({ status: "sending", message: "" });
    try {
      const res = await authClient.sendVerificationEmail({ email, callbackURL: `${window.location.origin}/verify-email` });
      if (res?.error) {
        setState({ status: "error", message: res.error.status === 429 ? "Too many requests. Wait a minute, then try again." : (res.error.message ?? "Could not send the email. Try again.") });
      } else {
        setState({ status: "sent", message: "A new email has been sent. It can take a minute to arrive." });
      }
    } catch {
      setState({ status: "error", message: "Cannot reach the server. Check your connection and try again." });
    }
  }
  return { ...state, resend };
}
