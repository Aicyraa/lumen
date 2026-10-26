import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, Frame, Label, Reveal, Title, mono, ease } from "./design";
export const Routing = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const mode = t < 4.5 ? 0 : t < 9 ? 1 : 2;
  const local = t - (mode === 0 ? 0 : mode === 1 ? 4.5 : 9);
  const questions = [
    "When does enrollment close?",
    "Compare the policies and explain the exceptions.",
    "What is outside these documents?",
  ];
  const y = [150, 350, 550][mode];
  return (
    <Frame chapter="CHEAP + EXPENSIVE MODEL ROUTING" number="04" seconds={14}>
      <div style={{ position: "absolute", left: 100, top: 220, width: 900 }}>
        <Reveal>
          <Label>ONE QUESTION. THE RIGHT TIER.</Label>
          <Title size={110}>
            Route by
            <br />
            <span style={{ color: C.lime }}>what it takes.</span>
          </Title>
        </Reveal>
        <div
          style={{
            marginTop: 50,
            borderTop: "1px solid " + C.line,
            paddingTop: 30,
            width: 760,
          }}
        >
          <div style={{ ...mono, color: C.lime, fontSize: 23 }}>
            {
              [
                "01 / STRAIGHTFORWARD",
                "02 / HARD OR UNCERTAIN",
                "03 / NO RELEVANT MATCH",
              ][mode]
            }
          </div>
          <div
            style={{
              fontSize: 38,
              lineHeight: 1.3,
              marginTop: 25,
              minHeight: 110,
            }}
          >
            {"“" + questions[mode] + "”"}
          </div>
          <div style={{ fontSize: 28, color: C.muted, marginTop: 22 }}>
            {
              [
                "Use the cheap tier for easy questions.",
                "Escalate when the question needs more.",
                "Skip the model. Say the answer is not found.",
              ][mode]
            }
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 980,
          top: 250,
          width: 840,
          height: 660,
        }}
      >
        <svg width="840" height="660" style={{ position: "absolute" }}>
          <path
            d="M210 350H315V150H450M315 350H450M315 350V550H450"
            fill="none"
            stroke={C.line}
            strokeWidth={2}
          />
          <path
            d={"M210 350H315V" + y + "H450"}
            fill="none"
            stroke={C.lime}
            strokeWidth={4}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={interpolate(local, [0.25, 1.1], [1, 0], ease)}
          />
          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              cx={315 + (((f / fps) * 70 + i * 45) % 135)}
              cy={y}
              r={5}
              fill={C.lime}
              opacity={local > 1.1 ? 1 : 0}
            />
          ))}
        </svg>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 245,
            width: 220,
            height: 210,
            display: "grid",
            placeItems: "center",
            background: C.surface,
            border: "2px solid " + C.lime,
            transform:
              "perspective(900px) rotateY(" + Math.sin(t * 0.7) * 8 + "deg)",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{ ...mono, color: C.lime, fontSize: 20, marginBottom: 20 }}
            >
              LUMEN
            </div>
            <div style={{ fontSize: 48 }}>Router</div>
          </div>
        </div>
        {["Cheap model", "Expensive model", "No model call"].map((title, i) => (
          <div
            key={title}
            style={{
              position: "absolute",
              left: 450,
              top: 65 + i * 200,
              width: 390,
              height: 165,
              padding: 26,
              background: mode === i ? C.lime : C.surface,
              color: mode === i ? C.bg : C.muted,
              border: "1px solid " + (mode === i ? C.lime : C.line),
              scale: mode === i ? 1.025 : 1,
            }}
          >
            <div style={{ ...mono, fontSize: 18, marginBottom: 15 }}>
              {["EASY QUESTIONS", "COMPLEXITY / ESCALATION", "NO MATCH"][i]}
            </div>
            <div style={{ fontSize: 36, letterSpacing: -1.5 }}>{title}</div>
            <div style={{ fontSize: 21, marginTop: 10 }}>
              {
                [
                  "Your models, cheap tier",
                  "Your models, expensive tier",
                  "An honest not-found reply",
                ][i]
              }
            </div>
          </div>
        ))}
      </div>
      <Reveal
        at={10.5}
        style={{
          position: "absolute",
          left: 100,
          top: 900,
          fontSize: 30,
          color: C.muted,
        }}
      >
        Choose your models. Order primary and backups inside each tier.
      </Reveal>
    </Frame>
  );
};
