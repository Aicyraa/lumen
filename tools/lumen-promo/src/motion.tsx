import type { ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
export const glide = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
  easing: Easing.bezier(0.4, 0, 0.2, 1),
} as const;
export const unit = (t: number, a: number, b: number) =>
  interpolate(t, [a, b], [0, 1], glide);
export const routeFocus = (t: number, i: number) => {
  const starts = [0, 4.5, 9];
  const enter = i === 0 ? 1 : unit(t, starts[i] - 0.6, starts[i] + 0.6);
  const leave =
    i === 2 ? 1 : 1 - unit(t, starts[i + 1] - 0.6, starts[i + 1] + 0.6);
  return enter * leave;
};
export function SceneMotion({
  children,
  seconds,
}: {
  children: ReactNode;
  seconds: number;
}) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        translate: interpolate(
          f,
          [0, 0.75 * fps, (seconds - 0.75) * fps, seconds * fps],
          ["54px 0px", "0px 0px", "0px 0px", "-54px 0px"],
          glide,
        ),
        scale: interpolate(
          f,
          [0, 0.75 * fps, (seconds - 0.75) * fps, seconds * fps],
          [1.025, 1, 1, 0.985],
          glide,
        ),
      }}
    >
      {children}
    </AbsoluteFill>
  );
}
