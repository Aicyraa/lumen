import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, Frame, Reveal, mono, ease } from "./design";
export const Routing = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const mode = t < 4.5 ? 0 : t < 9 ? 1 : 2;
  const local = t - [0, 4.5, 9][mode];
  const paths = [
    "M960 530C780 530 690 650 420 720",
    "M960 530C1100 520 1190 640 1460 720",
    "M960 530V820",
  ];
  const endX = [420, 1460, 960][mode],
    endY = [720, 720, 820][mode];
  return (
    <Frame>
      <Reveal
        at={0.1}
        style={{
          position: "absolute",
          top: 100,
          left: 100,
          right: 100,
          textAlign: "center",
          fontSize: 91,
          letterSpacing: -5,
        }}
      >
        One question. <span style={{ color: C.lime }}>The right tier.</span>
      </Reveal>
      <div
        style={{
          position: "absolute",
          top: 245,
          left: 250,
          right: 250,
          textAlign: "center",
          fontSize: 38,
          color: C.muted,
          lineHeight: 1.3,
        }}
      >
        {
          [
            "“When does enrollment close?”",
            "“Compare the policies and explain the exceptions.”",
            "“What is outside these documents?”",
          ][mode]
        }
      </div>
      <svg width="1920" height="1080" style={{ position: "absolute" }}>
        {paths.map((d, i) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke={mode === i ? C.lime : C.line}
            strokeWidth={mode === i ? 4 : 1.5}
          />
        ))}
        <circle
          cx="960"
          cy="530"
          r="102"
          fill={C.bg}
          stroke={C.lime}
          strokeWidth="2"
        />
        <circle
          cx="960"
          cy="530"
          r={108 + (f % 70) * 0.65}
          fill="none"
          stroke={C.lime}
          strokeWidth="1"
          opacity={0.6 * (1 - (f % 70) / 70)}
        />
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            cx={interpolate((local * 0.5 + i / 3) % 1, [0, 1], [960, endX])}
            cy={interpolate((local * 0.5 + i / 3) % 1, [0, 1], [530, endY])}
            r={6}
            fill={C.lime}
            opacity={interpolate(local, [0.2, 0.7], [0, 1], ease)}
          />
        ))}
      </svg>
      <div
        style={{
          position: "absolute",
          left: 840,
          top: 510,
          width: 240,
          textAlign: "center",
          ...mono,
          fontSize: 32,
        }}
      >
        ROUTER
      </div>
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 730,
          width: 570,
          textAlign: "center",
          color: mode === 0 ? C.lime : C.muted,
        }}
      >
        <div style={{ fontSize: 65, letterSpacing: -3 }}>Cheap model</div>
        <div style={{ fontSize: 27, marginTop: 14 }}>
          Straightforward questions
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 100,
          top: 730,
          width: 620,
          textAlign: "center",
          color: mode === 1 ? C.lime : C.muted,
        }}
      >
        <div style={{ fontSize: 65, letterSpacing: -3 }}>Expensive model</div>
        <div style={{ fontSize: 27, marginTop: 14 }}>
          Complexity + escalation
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 700,
          top: 850,
          width: 520,
          textAlign: "center",
          color: mode === 2 ? C.lime : C.muted,
        }}
      >
        <div style={{ fontSize: 42, letterSpacing: -1.5 }}>
          No match? No model call.
        </div>
        <div style={{ fontSize: 24, marginTop: 13 }}>
          An honest not-found reply.
        </div>
      </div>
      <Reveal
        at={10.5}
        style={{
          position: "absolute",
          left: 100,
          right: 100,
          top: 995,
          textAlign: "center",
          fontSize: 24,
          color: C.muted,
        }}
      >
        Bring your own models. Order primary and backups within each tier.
      </Reveal>
    </Frame>
  );
};
