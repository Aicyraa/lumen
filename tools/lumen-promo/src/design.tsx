import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "@fontsource/geist-mono/400.css";

export const C = {
  bg: "#0c0c0b",
  surface: "#141413",
  text: "#efeee9",
  muted: "#a9a8a2",
  line: "#33332f",
  lime: "#cee654",
};
export const mono: CSSProperties = {
  fontFamily: "Geist Mono",
  fontSize: 24,
  letterSpacing: 2,
  textTransform: "uppercase",
};
export const ease = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
  easing: Easing.bezier(0.16, 1, 0.3, 1),
} as const;

export function Frame({ children }: { children: ReactNode }) {
  return (
    <AbsoluteFill
      style={{
        background: C.bg,
        color: C.text,
        fontFamily: "Geist",
        overflow: "hidden",
      }}
    >
      <style>{"* {box-sizing:border-box;}"}</style>
      {children}
    </AbsoluteFill>
  );
}

export function Reveal({
  children,
  at = 0,
  style = {},
}: {
  children: ReactNode;
  at?: number;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        ...style,
        opacity: interpolate(
          frame,
          [at * fps, (at + 0.55) * fps],
          [0, 1],
          ease,
        ),
        translate: interpolate(
          frame,
          [at * fps, (at + 0.65) * fps],
          ["0px 36px", "0px 0px"],
          ease,
        ),
      }}
    >
      {children}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <div style={{ ...mono, color: C.lime, marginBottom: 25 }}>{children}</div>
  );
}
export function Title({
  children,
  size = 110,
}: {
  children: ReactNode;
  size?: number;
}) {
  return (
    <div
      style={{
        fontSize: size,
        fontWeight: 500,
        letterSpacing: -size * 0.055,
        lineHeight: 1.02,
      }}
    >
      {children}
    </div>
  );
}

export function Arrow({ style = {} }: { style?: CSSProperties }) {
  return <div style={{ fontSize: 54, color: C.lime, ...style }}>→</div>;
}

export function Line({
  d,
  at = 0,
  duration = 1,
  color = C.lime,
}: {
  d: string;
  at?: number;
  duration?: number;
  color?: string;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <path
      d={d}
      pathLength={1}
      fill="none"
      stroke={color}
      strokeWidth={3}
      strokeDasharray={1}
      strokeDashoffset={interpolate(
        frame,
        [at * fps, (at + duration) * fps],
        [1, 0],
        ease,
      )}
    />
  );
}
