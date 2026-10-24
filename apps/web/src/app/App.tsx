import { MotionConfig } from "motion/react";
import { Navigate, Route, Routes } from "react-router";
import { ErrorBoundary } from "./ErrorBoundary";
import { SessionCacheGuard } from "../features/auth/SessionCacheGuard";
import { RequireSession } from "../features/auth/RequireSession";
import { Docs } from "../features/docs/Docs";
import { Home } from "../features/home/Home";
import { Privacy } from "../features/docs/Privacy";
import { SignIn } from "../features/auth/SignIn";
import { AppFrame } from "../shared/ui/AppFrame";
import { NoProjectRedirect } from "./NoProjectRedirect";
import { Account } from "../features/account/Account";
import { VerifyEmail } from "../features/auth/VerifyEmail";
import { Projects } from "../features/projects/Projects";
import { ProjectShell } from "../features/projects/ProjectShell";
import { Settings } from "../features/projects/Settings";
import { Analytics } from "../features/analytics/Analytics";
import { ApiKeys } from "../features/keys/ApiKeys";
import { Documents } from "../features/documents/Documents";
import { Models } from "../features/models/Models";
import { Requests } from "../features/requests/Requests";
import { TryIt } from "../features/try-it/TryIt";

export function App() {
  return (
    <ErrorBoundary>
    <MotionConfig reducedMotion="user">
      <SessionCacheGuard />
      <NoProjectRedirect />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/sign-in" element={<Navigate to="/signin" replace />} />
        <Route path="/dashboard/*" element={<Navigate to="/projects" replace />} />
        <Route element={<RequireSession />}>
          <Route element={<AppFrame />}>
            <Route path="/projects" element={<Projects />} />
            <Route path="/account" element={<Account />} />
          </Route>
          <Route path="/projects/:slug" element={<ProjectShell />}>
            <Route index element={<Navigate to="documents" replace />} />
            <Route path="documents" element={<Documents />} />
            <Route path="keys" element={<ApiKeys />} />
            <Route path="try" element={<TryIt />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="requests" element={<Requests />} />
            <Route path="models" element={<Models />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MotionConfig>
    </ErrorBoundary>
  );
}
