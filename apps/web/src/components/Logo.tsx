import { Link } from "react-router";

export function Logo({ size = "lg" }: { size?: "lg" | "sm" }) {
  return <Link to="/" className={`logo logo-${size}`} aria-label="Lumen home"><span className="logo-dot" aria-hidden="true" />lumen</Link>;
}
