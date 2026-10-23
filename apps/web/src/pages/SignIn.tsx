import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "react-router";
import { Logo } from "../components/Logo";
import { ErrorText } from "../components/ui";
import { authClient } from "../lib/auth-client";
import { isDev } from "../lib/config";
import { readSession } from "../lib/sessionShape";

// Dev builds name the likely cause; production builds stay generic.
const WRONG_SERVER = isDev ? "Sign-in server not reachable (check VITE_API_URL)" : "Cannot reach the server. Check your connection and try again.";
const UNREACHABLE = "Cannot reach the server. Check your connection and try again.";
// An error without an HTTP status means the request never got an answer.
const failure = (e: { status?: number; message?: string }) => (e.status ? (e.message ?? "Something went wrong. Try again.") : UNREACHABLE);

export function SignIn() {
  const session = readSession(authClient.useSession()).user;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/dashboard" replace />;
  // The API lives on another origin, so the callback after OAuth must be an absolute URL of this app.
  const callbackURL = `${window.location.origin}/dashboard`;

  async function social(provider: "google" | "github") {
    setError("");
    try {
      const res = await authClient.signIn.social({ provider, callbackURL });
      if (res?.error) setError(failure(res.error));
      else if (res && !res.data?.url) setError(WRONG_SERVER); // not the expected { url }
    } catch {
      setError(WRONG_SERVER);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = mode === "in" ? await authClient.signIn.email({ email, password }) : await authClient.signUp.email({ name: name.trim(), email, password });
      if (res.error) setError(failure(res.error));
      else { qc.clear(); navigate("/dashboard"); } // nothing from an earlier account may survive a new sign-in
    } catch {
      setError(UNREACHABLE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="signin">
      <section className="signin-left">
        <Logo />
        <h1 className="signin-h1">One login.<br />Your own tenant.</h1>
        <div className="mono small muted-3">A personal workspace is created on first sign-in.</div>
      </section>
      <section className="signin-right">
        <div className="signin-box">
          <Link to="/" className="label back">← BACK</Link>
          <h2 className="signin-title">Welcome to Lumen</h2>
          <button type="button" className="btn btn-primary btn-xl" onClick={() => void social("google")}>Continue with Google</button>
          <button type="button" className="btn btn-outline btn-xl" onClick={() => void social("github")}>Continue with GitHub</button>
          <div className="or mono small muted-3" aria-hidden="true">OR WITH EMAIL</div>
          <form onSubmit={submit} className="stack-sm" aria-label={mode === "in" ? "Sign in with email" : "Sign up with email"}>
            {mode === "up" && <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></label>}
            <label className="field"><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
            <label className="field"><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={mode === "up" ? 8 : undefined} required /></label>
            <ErrorText>{error}</ErrorText>
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{mode === "in" ? "Sign in" : "Sign up"}</button>
          </form>
          <button type="button" className="link-btn" onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(""); }}>
            {mode === "in" ? "Create an account" : "I already have an account"}
          </button>
        </div>
      </section>
    </main>
  );
}
