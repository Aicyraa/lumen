import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../shared/lib/api";
import { authClient } from "../../shared/lib/auth-client";
import { fmtDateLong, fmtInt } from "../../shared/lib/format";
import { AnimateIcon, GithubMark, GoogleMark, LinkIcon } from "../../shared/ui/icons";
import { StatusMessage } from "../../shared/ui/StatusMessage";
import { ErrorText, PageHead } from "../../shared/ui/ui";
import { readSession } from "../auth/sessionShape";
import { useSignOut } from "../auth/useSignOut";
import type { AccountInfo } from "./types";

const METHODS = [
  ["email", "Email and password"],
  ["google", "Google"],
  ["github", "GitHub"],
] as const;

export function Account() {
  const s = readSession(authClient.useSession());
  const { signOut, failed } = useSignOut();
  const [error, setError] = useState("");
  const account = useQuery({
    queryKey: ["account", s.userId],
    enabled: !!s.userId,
    queryFn: () => api<AccountInfo>("/api/dashboard/account"),
  });
  const a = account.data;
  const linkedAt = new Map((a?.providers ?? []).map((p) => [p.provider, p.linked_at]));

  async function link(provider: "google" | "github") {
    setError("");
    try {
      const res = await authClient.linkSocial({
        provider,
        callbackURL: `${window.location.origin}/account`,
      });
      if (res?.error) setError(res.error.message ?? "Could not start linking.");
    } catch {
      setError("Cannot reach the server. Check your connection and try again.");
    }
  }

  return (
    <div className="stack">
      <PageHead title="Account" />
      {(account.isPending || !s.userId) && (
        <StatusMessage state="loading">Loading your account…</StatusMessage>
      )}
      {account.isError && (
        <StatusMessage state="error" onRetry={() => account.refetch()}>
          Could not load your account. {(account.error as Error).message}
        </StatusMessage>
      )}
      {a && (
        <div className="acct-grid">
          <section className="card acct-profile" aria-label="Profile">
            <div className="label">PROFILE</div>
            <h2 className="acct-name">{a.user.name?.trim() || a.user.email.split("@")[0]}</h2>
            <div className="row-between">
              <span className="mono">{a.user.email}</span>
              <span
                className={`status ${a.user.email_verified ? "status-ready" : "status-processing"}`}
              >
                <span className="dot" aria-hidden="true" />
                {a.user.email_verified ? "Verified" : "Not verified"}
              </span>
            </div>
            {!a.user.email_verified && (
              <p className="small muted-3">
                Email and password accounts must verify their email to sign in. Check your inbox, or
                sign in again to get a new link.
              </p>
            )}
            <div className="small muted-3">Member since {fmtDateLong(a.user.created_at)}</div>
            <div className="small muted-3">
              {fmtInt(a.projects.owned)} of {fmtInt(a.projects.max)} projects owned
            </div>
          </section>
          <section className="card" aria-label="Totals across your projects">
            <div className="label">TOTALS ACROSS YOUR PROJECTS</div>
            <dl className="acct-totals">
              {(
                [
                  ["Documents", a.totals.documents],
                  ["Requests this month", a.totals.requests_this_month],
                  ["API keys", a.totals.api_keys],
                  ["Models", a.totals.models],
                ] as const
              ).map(([label, n]) => (
                <div key={label} className="acct-total">
                  <dt className="small muted-3">{label}</dt>
                  <dd className="stat-value">{fmtInt(n)}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="card acct-methods" aria-label="Sign-in methods">
            <div className="label">SIGN-IN METHODS</div>
            <ul className="list">
              {METHODS.filter(([id]) => linkedAt.has(id)).map(([id, label]) => (
                <li key={id}>
                  <span>{label}</span>
                  <span className="status status-ready">
                    <span className="dot" aria-hidden="true" />
                    Linked {fmtDateLong(linkedAt.get(id)!)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="row-gap">
              {!linkedAt.has("google") && (
                <AnimateIcon animateOnHover asChild>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => void link("google")}
                  >
                    <GoogleMark />
                    <LinkIcon size={16} />
                    Link Google
                  </button>
                </AnimateIcon>
              )}
              {!linkedAt.has("github") && (
                <AnimateIcon animateOnHover asChild>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => void link("github")}
                  >
                    <GithubMark />
                    <LinkIcon size={16} />
                    Link GitHub
                  </button>
                </AnimateIcon>
              )}
            </div>
            <p className="small muted-3">
              Signing in with a provider whose email matches an existing account is not linked
              automatically. Link it here while signed in.
            </p>
            <ErrorText>{error}</ErrorText>
          </section>
        </div>
      )}
      <div>
        <button type="button" className="btn btn-outline" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
      {failed && (
        <div role="alert" className="error-text">
          Could not sign out, please try again
        </div>
      )}
    </div>
  );
}
