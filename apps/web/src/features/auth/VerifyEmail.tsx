import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { authClient } from "../../shared/lib/auth-client";
import { usePageTitle } from "../../shared/lib/usePageTitle";
import { Mail, MailCheck } from "../../shared/ui/icons";
import { PublicLayout } from "../../shared/ui/PublicLayout";
import { ResendNote } from "./ResendNote";
import { readSession } from "./sessionShape";
import { useResend } from "./useResend";

// The API redirects here after the user clicks the link in the email: ?status=verified on success, and
// ?status=verified&error=CODE on failure (a present error always wins over status).
export function VerifyEmail() {
  usePageTitle("Verify your email");
  const [params] = useSearchParams();
  const signedIn = !!readSession(authClient.useSession()).user;
  const error = params.get("error");
  const verified = !error && params.get("status") === "verified";

  return (
    <PublicLayout>
      <main className="doc center-card">
        {verified ? (
          <section className="stack-sm">
            <MailCheck size={36} />
            <h1 className="doc-h1 small-h1">Email verified</h1>
            <p className="lead">Your email address is confirmed. You can use your account now.</p>
            <div>
              <Link to={signedIn ? "/projects" : "/signin"} className="btn btn-primary">
                {signedIn ? "Continue to Projects" : "Continue to sign in"}
              </Link>
            </div>
          </section>
        ) : error ? (
          <ResendForm
            title={error === "TOKEN_EXPIRED" ? "This link has expired" : "This link is not valid"}
            body={
              error === "TOKEN_EXPIRED"
                ? "Verification links work for a limited time. Enter your email and we will send a new one."
                : "The link was changed or is incomplete. Enter your email and we will send a new one."
            }
          />
        ) : (
          <ResendForm
            title="Verify your email"
            body="Open the link in the email we sent you. If it did not arrive, enter your email and we will send a new one."
          />
        )}
      </main>
    </PublicLayout>
  );
}

function ResendForm({ title, body }: { title: string; body: string }) {
  const [email, setEmail] = useState("");
  const resend = useResend();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) void resend.resend(email.trim());
  };
  return (
    <section className="stack-sm">
      <Mail size={36} />
      <h1 className="doc-h1 small-h1">{title}</h1>
      <p className="lead">{body}</p>
      <form onSubmit={submit} className="stack-sm maxw-sm">
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
        <button type="submit" className="btn btn-primary" disabled={resend.status === "sending"}>
          Send a new link
        </button>
        <ResendNote status={resend.status} message={resend.message} />
      </form>
      <Link to="/signin" className="link-btn">
        Back to sign in
      </Link>
    </section>
  );
}
