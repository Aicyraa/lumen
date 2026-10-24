// Small hand-written line icons and a dot-grid pattern for the Home page (decorative, palette tokens only).
const PATHS: Record<string, string> = {
  route: "M4 12h5M9 12l5-6h6M9 12l5 6h6",
  shield: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z",
  models: "M9 3v4M15 3v4M6 7h12v4a6 6 0 0 1-12 0zM12 17v4",
  honest: "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01",
  cited: "M7 4h10v17l-5-4-5 4z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  boxes: "M3 3h8v8H3zM13 13h8v8h-8z",
  key: "M12 12l8-8M17 7l3 3",
  nolog: "M6 3h9l4 4v14H6zM3 3l18 18",
  data: "M9 4c-2 0-3 1-3 3v2c0 1-1 3-3 3 2 0 3 2 3 3v2c0 2 1 3 3 3M15 4c2 0 3 1 3 3v2c0 1 1 3 3 3-2 0-3 2-3 3v2c0 2-1 3-3 3",
};

export function LineIcon({ name }: { name: keyof typeof PATHS | string }) {
  return (
    <svg
      className="line-icon"
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
      {name === "route" && (
        <>
          <circle cx="4" cy="12" r="1.2" />
          <circle cx="20" cy="6" r="1.2" />
          <circle cx="20" cy="18" r="1.2" />
        </>
      )}
      {name === "honest" && <circle cx="12" cy="12" r="9" />}
      {name === "key" && <circle cx="9" cy="15" r="4" />}
    </svg>
  );
}

// A plain dot grid in a corner of a section (SVG pattern, no gradient).
export function DotGrid({ id }: { id: string }) {
  return (
    <svg className="dot-grid" aria-hidden="true" focusable="false" width="320" height="200">
      <defs>
        <pattern id={id} width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.2" fill="var(--line-strong)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
