import {
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Img,
  staticFile,
  Easing,
} from "remotion";
import { C, Frame, ease } from "./design";

// Eight-second logo signature: enter, build the name, reveal the line, exit.
export const Closing = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exit = interpolate(f, [6.5 * fps, 7.8 * fps], [0, -2100], {
    ...ease,
    easing: Easing.bezier(0.65, 0, 0.8, 0.35),
  });
  return (
    <Frame>
      <div
        style={{ position: "absolute", inset: 0, translate: exit + "px 0px" }}
      >
        <div
          style={{
            position: "absolute",
            left: 360,
            top: 320,
            width: 1200,
            height: 240,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 48,
          }}
        >
          <Img
            src={staticFile("lumen-mark.svg")}
            style={{
              width: 180,
              height: 180,
              translate: interpolate(
                f,
                [0.15 * fps, 1.25 * fps],
                ["1550px 0px", "0px 0px"],
                ease,
              ),
              rotate: interpolate(
                f,
                [0.15 * fps, 1.25 * fps],
                ["12deg", "0deg"],
                ease,
              ),
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: 200,
              fontWeight: 500,
              lineHeight: 1,
              letterSpacing: -10,
              overflow: "hidden",
              height: 240,
              alignItems: "center",
            }}
          >
            {"lumen".split("").map((letter, i) => (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  opacity: interpolate(
                    f,
                    [(1.2 + i * 0.38) * fps, (1.8 + i * 0.38) * fps],
                    [0, 1],
                    ease,
                  ),
                  translate: interpolate(
                    f,
                    [(1.2 + i * 0.38) * fps, (1.95 + i * 0.38) * fps],
                    ["0px 210px", "0px 0px"],
                    ease,
                  ),
                }}
              >
                {letter}
              </span>
            ))}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 200,
            right: 200,
            top: 625,
            textAlign: "center",
            fontSize: 58,
            fontWeight: 400,
            letterSpacing: -2,
            lineHeight: 1.25,
          }}
        >
          {["“Where", "knowledge", "becomes", "an", "answer.”"].map(
            (word, i) => (
              <span
                key={word}
                style={{
                  display: "inline-block",
                  marginRight: 15,
                  color: i === 4 ? C.lime : C.text,
                  opacity: interpolate(
                    f,
                    [(3.35 + i * 0.12) * fps, (3.95 + i * 0.12) * fps],
                    [0, 1],
                    ease,
                  ),
                  translate: interpolate(
                    f,
                    [(3.35 + i * 0.12) * fps, (4.1 + i * 0.12) * fps],
                    ["0px 35px", "0px 0px"],
                    ease,
                  ),
                }}
              >
                {word}
              </span>
            ),
          )}
        </div>
      </div>
    </Frame>
  );
};
