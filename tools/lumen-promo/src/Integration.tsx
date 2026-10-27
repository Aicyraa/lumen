import { FitLine } from "./FitLine";
import {
  interpolate,
  interpolateColors,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, Frame, Reveal, mono, ease } from "./design";
export const Integration = () => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const t = f / fps;
  const focus = interpolate(
    t,
    [0, 2.05, 3.15, 4.65, 5.75, 10],
    [0, 0, 1, 1, 2, 2],
    ease,
  );
  return (
    <Frame>
      <Reveal
        at={0.2}
        style={{
          position: "absolute",
          top: portrait ? 180 : 135,
          left: portrait ? 90 : 100,
          right: portrait ? 120 : 100,
          textAlign: "center",
          fontSize: portrait ? 86 : 88,
          letterSpacing: -5,
        }}
      >
        Seamless{portrait ? <br /> : " "}
        <span style={{ color: C.lime }}>RAG integration.</span>
      </Reveal>
      <svg width={width} height={height} style={{ position: "absolute" }}>
        <path
          d={
            portrait
              ? "M540 550C790 730 300 820 540 1000S790 1240 540 1440"
              : "M160 520C460 760 720 280 1010 520S1510 760 1760 520"
          }
          stroke={C.line}
          strokeWidth={2}
          fill="none"
        />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <circle
            key={i}
            cx={
              portrait
                ? 540 + 120 * Math.sin((t * 90 + i * 148) / 170)
                : 160 + ((t * 120 + i * 267) % 1600)
            }
            cy={
              portrait
                ? 550 + ((t * 90 + i * 148) % 890)
                : 520 + 95 * Math.sin((t * 120 + i * 267) / 260)
            }
            r={4}
            fill={C.lime}
          />
        ))}
      </svg>
      {["Upload.", "Connect.", "Ask."].map((word, i) => (
        <div
          key={word}
          style={{
            position: "absolute",
            left: portrait ? 120 : [140, 690, 1350][i],
            top:
              (portrait ? [600, 900, 1200][i] : 360) +
              Math.sin(t * 0.8 + i) * 15,
            opacity: interpolate(
              f,
              [(0.5 + i * 0.35) * fps, (1.1 + i * 0.35) * fps],
              [0, 1],
              ease,
            ),
            translate: interpolate(
              f,
              [(0.5 + i * 0.35) * fps, (1.4 + i * 0.35) * fps],
              ["180px 0px", "0px 0px"],
              ease,
            ),
          }}
        >
          <div
            style={{
              ...mono,
              fontSize: portrait ? 26 : 22,
              color: C.muted,
              marginBottom: 22,
            }}
          >
            {
              ["PDF / TXT / MARKDOWN", "YOUR PROJECT API KEY", "YOUR BACKEND"][
                i
              ]
            }
          </div>
          <div
            style={{
              fontSize: portrait ? 120 : 128,
              fontWeight: 500,
              letterSpacing: -8,
              color: interpolateColors(
                Math.max(0, 1 - Math.abs(focus - i)),
                [0, 1],
                [C.text, C.lime],
              ),
              scale: 1 + 0.02 * Math.max(0, 1 - Math.abs(focus - i)),
            }}
          >
            {word}
          </div>
        </div>
      ))}
      <Reveal
        at={1.8}
        style={{
          position: "absolute",
          left: portrait ? 160 : 180,
          top: portrait ? 810 : 650,
          ...mono,
          fontSize: 23,
          color: C.muted,
          rotate: "-8deg",
        }}
      >
        handbook.pdf
      </Reveal>
      <Reveal
        at={2.8}
        style={{
          position: "absolute",
          left: portrait ? 170 : 790,
          top: portrait ? 1110 : 650,
          ...mono,
          fontSize: 23,
          color: C.muted,
          rotate: "6deg",
        }}
      >
        x-api-key
      </Reveal>
      <Reveal
        at={4}
        style={{
          position: "absolute",
          left: portrait ? 160 : 1380,
          top: portrait ? 1410 : 650,
          ...mono,
          fontSize: 23,
          color: C.muted,
          rotate: "-4deg",
        }}
      >
        POST /v1/chat
      </Reveal>
      <Reveal
        at={5.5}
        style={{
          position: "absolute",
          left: 150,
          right: 150,
          top: portrait ? 435 : 805,
          textAlign: "center",
          fontSize: portrait ? 44 : 46,
          letterSpacing: -1.5,
        }}
      >
        {portrait ? (
          <FitLine
            text="One request. Answer + sources + route."
            width={780}
            maxFontSize={44}
            spacing={-1.5}
          >
            One request.{" "}
            <span style={{ color: C.lime }}>Answer + sources + route.</span>
          </FitLine>
        ) : (
          <>
            One request.{" "}
            <span style={{ color: C.lime }}>Answer + sources + route.</span>
          </>
        )}
      </Reveal>
      <Reveal
        at={7}
        style={{
          position: "absolute",
          left: 150,
          right: 150,
          top: portrait ? 1490 : 900,
          textAlign: "center",
          fontSize: portrait ? 40 : 27,
          color: C.muted,
        }}
      >
        {portrait ? (
          <>
            <FitLine
              text="Your documents stay at the center"
              width={780}
              maxFontSize={40}
            />
            <FitLine text="of the conversation." width={780} maxFontSize={40} />
          </>
        ) : (
          "Your documents stay at the center of the conversation."
        )}
      </Reveal>
    </Frame>
  );
};
