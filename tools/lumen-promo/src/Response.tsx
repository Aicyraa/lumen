import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, Frame, Reveal, mono, ease } from "./design";
export const Response = () => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const reply = "Your knowledge.\nAn answer with evidence.";
  return (
    <Frame>
      <Reveal
        at={0.2}
        style={{
          position: "absolute",
          left: portrait ? 90 : 120,
          top: portrait ? 200 : 120,
          ...mono,
          color: C.lime,
        }}
      >
        MORE THAN AN ANSWER
      </Reveal>
      <div
        style={{
          position: "absolute",
          left: portrait ? 90 : 120,
          top: portrait ? 330 : 265,
          width: portrait ? 850 : 1500,
          fontSize: portrait ? 86 : 112,
          letterSpacing: -5,
          lineHeight: 1.1,
          whiteSpace: "pre-line",
        }}
      >
        {reply.slice(
          0,
          Math.floor(
            interpolate(f, [0.5 * fps, 2.7 * fps], [0, reply.length], ease),
          ),
        )}
        <span
          style={{
            fontFamily: "Geist Mono",
            fontSize: 65,
            color: C.lime,
            opacity: interpolate(f, [2.5 * fps, 3 * fps], [0, 1], ease),
          }}
        >
          {" "}
          [1]
        </span>
      </div>
      <svg width={width} height={height} style={{ position: "absolute" }}>
        <path
          d={
            portrait
              ? "M930 620C1050 790 990 1040 760 1140"
              : "M1690 430C1810 430 1760 685 1490 710"
          }
          fill="none"
          stroke={C.lime}
          strokeWidth={2}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={interpolate(
            f,
            [2.8 * fps, 4.4 * fps],
            [1, 0],
            ease,
          )}
        />
      </svg>
      <Reveal
        at={3.5}
        style={{
          position: "absolute",
          left: portrait ? 120 : 1130,
          top: portrait ? 1140 : 685,
          width: portrait ? 800 : 630,
        }}
      >
        <div style={{ ...mono, color: C.lime, fontSize: 25 }}>
          [1] CHECKED EVIDENCE
        </div>
        <div
          style={{
            fontSize: portrait ? 44 : 32,
            lineHeight: 1.4,
            color: C.muted,
            marginTop: 22,
          }}
        >
          Retrieved from your project.
          <br />
          Quotes checked before citations.
        </div>
      </Reveal>
      <Reveal
        at={4.8}
        style={{
          position: "absolute",
          left: portrait ? 90 : 120,
          top: portrait ? 750 : 665,
          fontSize: 48,
          lineHeight: 1.7,
          letterSpacing: -2,
        }}
      >
        <div>
          <span style={{ color: C.lime }}>+</span> Trace the sources.
        </div>
        <div>
          <span style={{ color: C.lime }}>+</span> Understand the route.
        </div>
        <div>
          <span style={{ color: C.lime }}>+</span> Inspect tokens + latency.
        </div>
      </Reveal>
      <Reveal
        at={7}
        style={{
          position: "absolute",
          left: portrait ? 90 : 120,
          top: portrait ? 1450 : 950,
          ...mono,
          fontSize: portrait ? 28 : 25,
          maxWidth: portrait ? 800 : undefined,
          color: C.muted,
        }}
      >
        SUPPORT BOTS / INTERNAL KNOWLEDGE / DOCUMENT Q&A
      </Reveal>
    </Frame>
  );
};
