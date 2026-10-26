import { interpolateColors, useCurrentFrame, useVideoConfig } from "remotion";
import { C, Frame, Reveal, mono } from "./design";
import { routeFocus } from "./motion";
export const Routing = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const paths = [
    "M960 530C780 530 690 650 420 720",
    "M960 530C1100 520 1190 640 1460 720",
    "M960 530V820",
  ];
  const questions = [
    "“When does enrollment close?”",
    "“Compare the policies and explain the exceptions.”",
    "“What is outside these documents?”",
  ];
  const point = (p: number, i: number) => {
    if (i === 2) return [960, 530 + 290 * p];
    const a = 1 - p;
    const c1 = i === 0 ? [780, 530] : [1100, 520];
    const c2 = i === 0 ? [690, 650] : [1190, 640];
    const end = i === 0 ? [420, 720] : [1460, 720];
    return [
      a * a * a * 960 +
        3 * a * a * p * c1[0] +
        3 * a * p * p * c2[0] +
        p * p * p * end[0],
      a * a * a * 530 +
        3 * a * a * p * c1[1] +
        3 * a * p * p * c2[1] +
        p * p * p * end[1],
    ];
  };
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
          left: 0,
          right: 0,
          top: 220,
          height: 110,
          overflow: "hidden",
        }}
      >
        {questions.map((q, i) => {
          const w = routeFocus(t, i);
          return (
            <div
              key={q}
              style={{
                position: "absolute",
                top: 25,
                left: 250,
                right: 250,
                textAlign: "center",
                fontSize: 38,
                color: C.muted,
                opacity: w,
                translate:
                  "0px " + (1 - w) * (t < [0, 4.5, 9][i] ? 90 : -90) + "px",
              }}
            >
              {q}
            </div>
          );
        })}
      </div>
      <svg width="1920" height="1080" style={{ position: "absolute" }}>
        {paths.map((d, i) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke={interpolateColors(
              routeFocus(t, i),
              [0, 1],
              [C.line, C.lime],
            )}
            strokeWidth={1.5 + 2.5 * routeFocus(t, i)}
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
        {[0, 1, 2].map((i) =>
          [0, 1, 2].map((j) => {
            const p = (t * 0.45 + j / 3) % 1;
            const [x, y] = point(p, i);
            return (
              <circle
                key={i + "-" + j}
                cx={x}
                cy={y}
                r="6"
                fill={C.lime}
                opacity={routeFocus(t, i) * Math.sin(Math.PI * p)}
              />
            );
          }),
        )}
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
      {["Cheap model", "Expensive model", "No match? No model call."].map(
        (name, i) => (
          <div
            key={name}
            style={{
              position: "absolute",
              left: [120, 1200, 700][i],
              top: i === 2 ? 850 : 730,
              width: i === 2 ? 520 : 600,
              textAlign: "center",
              color: interpolateColors(
                routeFocus(t, i),
                [0, 1],
                [C.muted, C.lime],
              ),
              scale: 1 + 0.025 * routeFocus(t, i),
            }}
          >
            <div style={{ fontSize: i === 2 ? 42 : 65, letterSpacing: -3 }}>
              {name}
            </div>
            <div style={{ fontSize: i === 2 ? 24 : 27, marginTop: 14 }}>
              {
                [
                  "Straightforward questions",
                  "Complexity + escalation",
                  "An honest not-found reply.",
                ][i]
              }
            </div>
          </div>
        ),
      )}
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
