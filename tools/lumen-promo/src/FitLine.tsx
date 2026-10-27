import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { fitText } from "@remotion/layout-utils";
import { cancelRender, continueRender, delayRender } from "remotion";

type Props = {
  text: string;
  width: number;
  maxFontSize: number;
  weight?: number;
  spacing?: number;
  family?: string;
  children?: ReactNode;
  style?: CSSProperties;
};
export function FitLine({
  text,
  width,
  maxFontSize,
  weight = 400,
  spacing = 0,
  family = "Geist",
  children,
  style,
}: Props) {
  const [ready, setReady] = useState(false);
  const [handle] = useState(() =>
    delayRender("Load measured " + family + " text"),
  );
  useEffect(() => {
    let active = true;
    document.fonts
      .load(weight + ' 100px "' + family + '"')
      .then(() => {
        if (active) setReady(true);
        requestAnimationFrame(() => continueRender(handle));
      })
      .catch((error) => cancelRender(error));
    return () => {
      active = false;
      continueRender(handle);
    };
  }, [family, weight, handle]);
  if (!ready) return null;
  const fitted = fitText({
    text,
    // Pixel letter spacing stays fixed as font size changes; reserve it first.
    withinWidth: width - 4 - spacing * text.length,
    fontFamily: family,
    fontWeight: weight,
    letterSpacing: "0px",
    validateFontIsLoaded: true,
  });
  return (
    <div
      data-fit-line={text}
      data-fit-width={width}
      style={{
        ...style,
        width,
        fontFamily: family,
        fontWeight: weight,
        fontSize: Math.min(maxFontSize, fitted.fontSize),
        letterSpacing: spacing,
        whiteSpace: "nowrap",
        lineHeight: 1.25,
      }}
    >
      {children ?? text}
    </div>
  );
}
