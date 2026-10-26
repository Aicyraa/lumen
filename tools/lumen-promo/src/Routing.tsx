import { interpolateColors, useCurrentFrame, useVideoConfig } from "remotion";
import { C, Frame, Reveal, mono } from "./design";
import { routeFocus } from "./motion";
export const Routing = () => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const t = f / fps;
  const paths = portrait
    ? [
        "M540 850C430 850 390 1000 260 1050",
        "M540 850C650 850 700 1000 800 1050",
        "M540 850V1340",
      ]
    : [
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
    if (portrait) {
      if (i === 2) return [540, 850 + 490 * p];
      const a = 1 - p,
        c1 = i === 0 ? [430, 850] : [650, 850],
        c2 = i === 0 ? [390, 1000] : [700, 1000],
        end = i === 0 ? [260, 1050] : [800, 1050];
      return [
        a * a * a * 540 +
          3 * a * a * p * c1[0] +
          3 * a * p * p * c2[0] +
          p * p * p * end[0],
        a * a * a * 850 +
          3 * a * a * p * c1[1] +
          3 * a * p * p * c2[1] +
          p * p * p * end[1],
      ];
    }
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
          top: portrait ? 200 : 100,
          left: portrait ? 90 : 100,
          right: portrait ? 120 : 100,
          textAlign: "center",
          fontSize: portrait ? 88 : 91,
          letterSpacing: -5,
        }}
      >
        One question.{portrait ? <br /> : " "}
        <span style={{ color: C.lime }}>The right tier.</span>
      </Reveal>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: portrait ? 470 : 220,
          height: portrait ? 170 : 110,
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
                left: portrait ? 100 : 250,
                right: portrait ? 140 : 250,
                textAlign: "center",
                fontSize: portrait ? 44 : 38,
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
      <svg width={width} height={height} style={{ position: "absolute" }}>
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
          cx={portrait ? 540 : 960}
          cy={portrait ? 850 : 530}
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
          left: portrait ? 420 : 840,
          top: portrait ? 830 : 510,
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
              left: portrait ? [70, 590, 150][i] : [120, 1200, 700][i],
              top: portrait ? (i === 2 ? 1360 : 1110) : i === 2 ? 850 : 730,
              width: portrait ? (i === 2 ? 780 : 410) : i === 2 ? 520 : 600,
              textAlign: "center",
              color: interpolateColors(
                routeFocus(t, i),
                [0, 1],
                [C.muted, C.lime],
              ),
              scale: 1 + 0.025 * routeFocus(t, i),
            }}
          >
            <div
              style={{
                fontSize: portrait ? (i === 2 ? 42 : 52) : i === 2 ? 42 : 65,
                letterSpacing: -3,
              }}
            >
              {name}
            </div>
            <div
              style={{
                fontSize: portrait ? (i === 2 ? 34 : 44) : i === 2 ? 24 : 27,
                marginTop: 14,
              }}
            >
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
          left: portrait ? 90 : 100,
          right: portrait ? 120 : 100,
          top: portrait ? 1515 : 995,
          textAlign: "center",
          fontSize: portrait ? 32 : 24,
          color: C.muted,
        }}
      >
        Bring your own models. Order primary and backups within each tier.
      </Reveal>
    </Frame>
  );
};
