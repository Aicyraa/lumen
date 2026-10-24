import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { authClient } from "../../shared/lib/auth-client";
import { isDev } from "../../shared/lib/config";
import { AnimateIcon, GithubMark, GoogleMark, Mail, MailCheck } from "../../shared/ui/icons";
import { Logo } from "../../shared/ui/Logo";
import { ErrorText } from "../../shared/ui/ui";
import { ResendNote } from "./ResendNote";
import { readSession } from "./sessionShape";
import { useResend } from "./useResend";

// Dev builds name the likely cause; production builds stay generic.
const WRONG_SERVER = isDev
  ? "Sign-in server not reachable (check VITE_API_URL)"
  : "Cannot reach the server. Check your connection and try again.";
const UNREACHABLE = "Cannot reach the server. Check your connection and try again.";
// An error without an HTTP status means the request never got an answer.
const failure = (e: { status?: number; message?: string }) =>
  e.status ? (e.message ?? "Something went wrong. Try again.") : UNREACHABLE;

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
  const [check, setCheck] = useState<null | { email: string; reason: "signup" | "unverified" }>(
    null,
  );
  const resend = useResend();
  const [params] = useSearchParams();
  const urlError = params.get("error");

  if (session) return <Navigate to="/projects" replace />;
  // The API lives on another origin, so the callback after OAuth must be an absolute URL of this app.
  const callbackURL = `${window.location.origin}/projects`;

  async function social(provider: "google" | "github") {
    setError("");
    try {
      const res = await authClient.signIn.social({
        provider,
        callbackURL,
        errorCallbackURL: `${window.location.origin}/signin`,
      });
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
      const res =
        mode === "in"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({
              name: name.trim(),
              email,
              password,
              callbackURL: `${window.location.origin}/verify-email`,
            });
      if (res.error) {
        if ((res.error as { code?: string }).code === "EMAIL_NOT_VERIFIED")
          setCheck({ email, reason: "unverified" });
        else setError(failure(res.error));
      } else if (mode === "up") {
        setCheck({ email, reason: "signup" }); // no session until the email is verified
      } else {
        qc.clear();
        navigate("/projects");
      } // nothing from an earlier account may survive a new sign-in
    } catch {
      setError(UNREACHABLE);
    } finally {
      setBusy(false);
    }
  }

  const linkError =
    urlError === "account_not_linked"
      ? "An account with this email already exists under another sign-in method. Sign in with your original method, then link this one in Account settings."
      : urlError
        ? "Sign-in did not complete. Try again."
        : "";

  return (
    <main className="signin">
      <section className="signin-left">
        <Logo />
        <h1 className="signin-h1">
          One login.
          <br />
          Your own tenant.
        </h1>
        <div className="mono small muted-3">A first project is created for you on sign-up.</div>
      </section>
      <section className="signin-right">
        <div className="signin-box">
          <Link to="/" className="label back">
            ← BACK
          </Link>
          {check ? (
            <div className="stack-sm">
              <MailCheck size={32} />
              <h2 className="signin-title">
                {check.reason === "signup" ? "Check your email" : "Verify your email"}
              </h2>
              <p className="body muted-2">
                {check.reason === "signup"
                  ? "We sent a verification link to "
                  : "This account is not verified yet. We sent a new link to "}
                <span className="mono text">{check.email}</span>. Open it to finish, then sign in.
              </p>
              <button
                type="button"
                className="btn btn-outline"
                disabled={resend.status === "sending"}
                onClick={() => void resend.resend(check.email)}
              >
                Resend email
              </button>
              <ResendNote status={resend.status} message={resend.message} />
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setCheck(null);
                  setMode("in");
                }}
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <h2 className="signin-title">Welcome to Lumen</h2>
              {linkError && (
                <div role="alert" className="error-text">
                  {linkError}
                </div>
              )}
              <AnimateIcon animateOnHover asChild>
                <button
                  type="button"
                  className="btn btn-primary btn-xl"
                  onClick={() => void social("google")}
                >
                  <GoogleMark />
                  Continue with Google
                </button>
              </AnimateIcon>
              <AnimateIcon animateOnHover asChild>
                <button
                  type="button"
                  className="btn btn-outline btn-xl"
                  onClick={() => void social("github")}
                >
                  <GithubMark />
                  Continue with GitHub
                </button>
              </AnimateIcon>
              <div className="or mono small muted-3" aria-hidden="true">
                OR WITH EMAIL
              </div>
              <form
                onSubmit={submit}
                className="stack-sm"
                aria-label={mode === "in" ? "Sign in with email" : "Sign up with email"}
              >
                {mode === "up" && (
                  <label className="field">
                    <span>Name</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      required
                    />
                  </label>
                )}
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </label>
                <label className="field">
                  <span>Password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "in" ? "current-password" : "new-password"}
                    minLength={mode === "up" ? 8 : undefined}
                    required
                  />
                </label>
                <ErrorText>{error}</ErrorText>
                <AnimateIcon animateOnHover asChild>
                  <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
                    <Mail size={18} />
                    {mode === "in" ? "Sign in" : "Sign up"}
                  </button>
                </AnimateIcon>
              </form>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setMode(mode === "in" ? "up" : "in");
                  setError("");
                }}
              >
                {mode === "in" ? "Create an account" : "I already have an account"}
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
