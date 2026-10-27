import { motion } from "motion/react";
import type { ReactNode } from "react";
import { usePageTitle } from "../lib/usePageTitle";

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  usePageTitle(title);
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
      </div>
      {children}
    </div>
  );
}

// Status dot + mono label in the status color (docs/WEBSITE.md). Color is paired with the word, never alone.
export function StatusDot({
  tone,
  children,
}: {
  tone: "ready" | "processing" | "failed" | "cheap" | "expensive" | "none";
  children: ReactNode;
}) {
  return (
    <span className={`status status-${tone}`}>
      <span className="dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  pills = false,
  plain = false,
}: {
  plain?: boolean;
  pills?: boolean;
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      className={`segmented${pills ? " pills" : ""}${plain ? " plain" : ""}`}
      role="group"
      aria-label={label}
    >
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          className={value === id ? "on" : ""}
          onClick={() => onChange(id)}
        >
          {value === id && (
            <motion.span
              layoutId={`seg-${label}`}
              className="seg-pill"
              transition={{ duration: 0.2 }}
            />
          )}
          {text}
        </button>
      ))}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <div role="alert" className="error-text">
      {children}
    </div>
  ) : null;
}
