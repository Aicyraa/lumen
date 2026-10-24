import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { authClient } from "../../shared/lib/auth-client";
import { AnimateIcon, GithubMark, GoogleMark, LinkIcon } from "../../shared/ui/icons";
import { Loading } from "../../shared/ui/Loading";
import { ErrorText } from "../../shared/ui/ui";
import { readSession } from "../auth/sessionShape";
import { useSignOut } from "../auth/useSignOut";

const METHODS = [
  ["credential", "Email and password"],
  ["google", "Google"],
  ["github", "GitHub"],
] as const;

export function Account() {
  const s = readSession(authClient.useSession());
  const user = s.user as { email?: string; name?: string; emailVerified?: boolean } | null;
  const { signOut, failed } = useSignOut();
  const [error, setError] = useState("");
  const accounts = useQuery({
    queryKey: ["accounts", s.userId],
    enabled: !!s.userId,
    queryFn: async () => {
      const res = await authClient.listAccounts();
      if (res?.error) throw new Error(res.error.message ?? "Could not load sign-in methods.");
      return ((res?.data ?? []) as { providerId: string }[]).map((a) => a.providerId);
    },
  });
  const linked = new Set(accounts.data ?? []);

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
      <div className="page-head">
        <div>
          <div className="label">YOUR ACCOUNT</div>
          <h1 className="page-title">Account</h1>
        </div>
      </div>
      <section className="card maxw" aria-label="Email">
        <div className="label">EMAIL</div>
        <div className="row-between">
          <span className="mono">{user?.email}</span>
          <span className={`status ${user?.emailVerified ? "status-ready" : "status-processing"}`}>
            <span className="dot" aria-hidden="true" />
            {user?.emailVerified ? "Verified" : "Not verified"}
          </span>
        </div>
        {!user?.emailVerified && (
          <p className="small muted-3">
            Email and password accounts must verify their email to sign in. Check your inbox, or
            sign in again to get a new link.
          </p>
        )}
      </section>
      <section className="card maxw" aria-label="Sign-in methods">
        <div className="label">SIGN-IN METHODS</div>
        {accounts.isPending && <Loading />}
        {accounts.isError && <ErrorText>{(accounts.error as Error).message}</ErrorText>}
        {accounts.isSuccess && (
          <ul className="list">
            {METHODS.filter(([id]) => linked.has(id)).map(([id, label]) => (
              <li key={id}>
                <span>{label}</span>
                <span className="status status-ready">
                  <span className="dot" aria-hidden="true" />
                  Linked
                </span>
              </li>
            ))}
          </ul>
        )}
        {accounts.isSuccess && (
          <div className="row-gap">
            {!linked.has("google") && (
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
            {!linked.has("github") && (
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
        )}
        <p className="small muted-3">
          Signing in with a provider whose email matches an existing account is not linked
          automatically. Link it here while signed in.
        </p>
        <ErrorText>{error}</ErrorText>
      </section>
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
