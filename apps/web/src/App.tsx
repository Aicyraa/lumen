import { Navigate, Route, Routes } from "react-router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SessionCacheGuard } from "./components/SessionCacheGuard";
import { RequireSession } from "./components/RequireSession";
import { Docs } from "./pages/Docs";
import { Home } from "./pages/Home";
import { Privacy } from "./pages/Privacy";
import { SignIn } from "./pages/SignIn";
import { AppFrame } from "./components/AppFrame";
import { NoProjectRedirect } from "./components/NoProjectRedirect";
import { Projects } from "./pages/Projects";
import { ProjectShell } from "./pages/dashboard/ProjectShell";
import { Settings } from "./pages/dashboard/Settings";
import { Analytics } from "./pages/dashboard/Analytics";
import { ApiKeys } from "./pages/dashboard/ApiKeys";
import { Documents } from "./pages/dashboard/Documents";
import { Models } from "./pages/dashboard/Models";
import { Requests } from "./pages/dashboard/Requests";
import { TryIt } from "./pages/dashboard/TryIt";

export function App() {
  return (
    <ErrorBoundary>
      <SessionCacheGuard />
      <NoProjectRedirect />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/sign-in" element={<Navigate to="/signin" replace />} />
        <Route path="/dashboard/*" element={<Navigate to="/projects" replace />} />
        <Route element={<RequireSession />}>
          <Route element={<AppFrame />}>
            <Route path="/projects" element={<Projects />} />
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
    </ErrorBoundary>
  );
}
