import { Link } from "react-router";

// Hand-written mark (public/favicon.svg is the same shape). "dark" = lime mark for dark surfaces, "light" = ink mark for light ones.
export function LogoMark({
  variant = "dark",
  className,
}: {
  variant?: "dark" | "light";
  className?: string;
}) {
  const body = variant === "dark" ? "var(--lime)" : "var(--bg)";
  const bars = variant === "dark" ? "var(--bg)" : "var(--text)";
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path fill={body} d="M3 0H58a6 6 0 0 1 6 6V64H26A26 26 0 0 1 0 38V3A3 3 0 0 1 3 0Z" />
      <g fill={bars}>
        <rect x="8.5" y="14.5" width="37.5" height="5.5" rx="2.75" />
        <rect x="8.5" y="29.5" width="43.8" height="5.5" rx="2.75" />
        <rect x="8.5" y="44" width="27.8" height="5.5" rx="2.75" />
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
