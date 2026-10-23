import { Navigate, Route, Routes } from "react-router";
import { RequireSession } from "./components/RequireSession";
import { Docs } from "./pages/Docs";
import { Home } from "./pages/Home";
import { Privacy } from "./pages/Privacy";
import { SignIn } from "./pages/SignIn";
import { Analytics } from "./pages/dashboard/Analytics";
import { ApiKeys } from "./pages/dashboard/ApiKeys";
import { Documents } from "./pages/dashboard/Documents";
import { Models } from "./pages/dashboard/Models";
import { Requests } from "./pages/dashboard/Requests";
import { Shell } from "./pages/dashboard/Shell";
import { TryIt } from "./pages/dashboard/TryIt";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/docs" element={<Docs />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/signin" element={<SignIn />} />
      <Route element={<RequireSession />}>
        <Route path="/dashboard" element={<Shell />}>
          <Route index element={<Navigate to="documents" replace />} />
          <Route path="documents" element={<Documents />} />
          <Route path="keys" element={<ApiKeys />} />
          <Route path="try" element={<TryIt />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="requests" element={<Requests />} />
          <Route path="models" element={<Models />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
