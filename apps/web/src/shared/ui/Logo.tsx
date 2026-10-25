import { Link } from "react-router";

// Hand-written leaf mark with a folded corner and three text lines (public/favicon.svg is the same shape). "dark" = lime mark for dark surfaces, "light" = ink mark for light ones.
export function LogoMark({
  variant = "dark",
  className,
}: {
  variant?: "dark" | "light";
  className?: string;
}) {
  const body = variant === "dark" ? "var(--lime)" : "var(--bg)";
  const lines = variant === "dark" ? "var(--bg)" : "var(--text)";
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path
        fill={body}
        d="M0 21 21 0H38A26 26 0 0 1 64 26V61A3 3 0 0 1 61 64H18A18 18 0 0 1 0 46Z"
      />
      <path fill="var(--text)" d="M0 21 21 0V18A3 3 0 0 1 18 21Z" />
      <g fill={lines}>
        <rect x="36" y="24" width="18" height="4.2" rx="2.1" />
        <rect x="21" y="34.5" width="36" height="4.2" rx="2.1" />
        <rect x="21" y="45" width="24" height="4.2" rx="2.1" />
      </g>
    </svg>
  );
}

export function Logo({
  size = "lg",
  variant = "dark",
}: {
  size?: "lg" | "sm";
  variant?: "dark" | "light";
}) {
  return (
    <Link to="/" className={`logo logo-${size}`} aria-label="Lumen home">
      <LogoMark variant={variant} className="logo-mark" />
      lumen
    </Link>
  );
}
