import { MotionConfig } from "motion/react";
import { type ComponentType, lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { RequireSession } from "../features/auth/RequireSession";
import { SessionCacheGuard } from "../features/auth/SessionCacheGuard";
import { AppFrame } from "../shared/ui/AppFrame";
import { Loading } from "../shared/ui/Loading";
import { ErrorBoundary } from "./ErrorBoundary";
import { NoProjectRedirect } from "./NoProjectRedirect";

// Every page is its own chunk; the Suspense fallback is announced as a status while it loads.
const page = <K extends string>(load: () => Promise<Record<K, ComponentType<any>>>, key: K) =>
  lazy(() => load().then((m) => ({ default: m[key] })));
const Account = page(() => import("../features/account/Account"), "Account");
const Analytics = page(() => import("../features/analytics/Analytics"), "Analytics");
const SignIn = page(() => import("../features/auth/SignIn"), "SignIn");
const VerifyEmail = page(() => import("../features/auth/VerifyEmail"), "VerifyEmail");
const Docs = page(() => import("../features/docs/Docs"), "Docs");
const Privacy = page(() => import("../features/docs/Privacy"), "Privacy");
const Terms = page(() => import("../features/docs/Terms"), "Terms");
const Documents = page(() => import("../features/documents/Documents"), "Documents");
const Home = page(() => import("../features/home/Home"), "Home");
const ApiKeys = page(() => import("../features/keys/ApiKeys"), "ApiKeys");
const Models = page(() => import("../features/models/Models"), "Models");
const ProjectShell = page(() => import("../features/projects/ProjectShell"), "ProjectShell");
const Projects = page(() => import("../features/projects/Projects"), "Projects");
const Settings = page(() => import("../features/projects/Settings"), "Settings");
const Requests = page(() => import("../features/requests/Requests"), "Requests");
const TryIt = page(() => import("../features/try-it/TryIt"), "TryIt");

export function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <SessionCacheGuard />
        <NoProjectRedirect />
        <Suspense fallback={<Loading label="Loading page…" />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
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
        </Suspense>
      </MotionConfig>
    </ErrorBoundary>
  );
}
