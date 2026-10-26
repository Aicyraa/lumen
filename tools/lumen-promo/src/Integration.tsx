import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, Frame, Reveal, mono, ease } from "./design";
export const Integration = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const stage = Math.min(2, Math.floor(t / 2.6));
  return (
    <Frame>
      <Reveal
        at={0.2}
        style={{
          position: "absolute",
          top: 135,
          left: 100,
          right: 100,
          textAlign: "center",
          fontSize: 88,
          letterSpacing: -5,
        }}
      >
        Seamless <span style={{ color: C.lime }}>RAG integration.</span>
      </Reveal>
      <svg width="1920" height="1080" style={{ position: "absolute" }}>
        <path
          d="M160 520C460 760 720 280 1010 520S1510 760 1760 520"
          stroke={C.line}
          strokeWidth={2}
          fill="none"
        />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <circle
            key={i}
            cx={160 + ((t * 120 + i * 267) % 1600)}
            cy={520 + 95 * Math.sin((t * 120 + i * 267) / 260)}
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
            left: [140, 690, 1350][i],
            top: 360 + Math.sin(t * 0.8 + i) * 15,
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
            style={{ ...mono, fontSize: 22, color: C.muted, marginBottom: 22 }}
          >
            {
              ["PDF / TXT / MARKDOWN", "YOUR PROJECT API KEY", "YOUR BACKEND"][
                i
              ]
            }
          </div>
          <div
            style={{
              fontSize: 128,
              fontWeight: 500,
              letterSpacing: -8,
              color: stage === i ? C.lime : C.text,
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
          left: 180,
          top: 650,
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
          left: 790,
          top: 650,
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
          left: 1380,
          top: 650,
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
          top: 805,
          textAlign: "center",
          fontSize: 46,
          letterSpacing: -1.5,
        }}
      >
        One request.{" "}
        <span style={{ color: C.lime }}>Answer + sources + route.</span>
      </Reveal>
      <Reveal
        at={7}
        style={{
          position: "absolute",
          left: 150,
          right: 150,
          top: 900,
          textAlign: "center",
          fontSize: 27,
          color: C.muted,
        }}
      >
        Your documents stay at the center of the conversation.
      </Reveal>
    </Frame>
  );
};
