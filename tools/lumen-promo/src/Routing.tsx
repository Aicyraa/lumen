import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, Frame, Label, Reveal, Title, Line, mono, ease } from "./design";

export const Routing = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const mode = t < 6 ? "cheap" : t < 12 ? "expensive" : "none";
  return (
    <Frame chapter="CHEAP + EXPENSIVE MODELS" number="04" seconds={18}>
      <div style={{ position: "absolute", left: 100, top: 205 }}>
        <Reveal>
          <Label>TWO TIERS. ONE ROUTER.</Label>
          <Title>
            The right model.
            <br />
            <span style={{ color: C.lime }}>For the question.</span>
          </Title>
        </Reveal>
      </div>
      <Reveal
        at={1}
        style={{
          position: "absolute",
          left: 100,
          top: 495,
          width: 650,
          borderTop: `1px solid ${C.line}`,
          paddingTop: 30,
        }}
      >
        <div style={{ ...mono, color: C.lime, marginBottom: 22 }}>
          {mode === "cheap"
            ? "01 / EASY QUESTION"
            : mode === "expensive"
              ? "02 / HARD OR UNCERTAIN"
              : "03 / NO RELEVANT MATCH"}
        </div>
        <div
          style={{
            fontSize: 42,
            lineHeight: 1.22,
            letterSpacing: -1,
            maxWidth: 620,
          }}
        >
          {mode === "cheap"
            ? "“When does enrollment close?”"
            : mode === "expensive"
              ? "“Compare the policies and explain the exceptions.”"
              : "“What is outside these documents?”"}
        </div>
        <div
          style={{
            fontSize: 29,
            lineHeight: 1.5,
            color: C.muted,
            marginTop: 28,
          }}
        >
          {mode === "cheap"
            ? "Straightforward question → cheap tier."
            : mode === "expensive"
              ? "Complexity or weak evidence → expensive tier."
              : "No evidence to retrieve → no model call."}
        </div>
      </Reveal>
      <div
        style={{
          position: "absolute",
          left: 840,
          top: 320,
          width: 980,
          height: 520,
        }}
      >
        <svg width="980" height="520" style={{ position: "absolute" }}>
          <path
            d="M265 255H390V100H520M390 255V290H520M390 255V480H520"
            fill="none"
            stroke={C.line}
            strokeWidth={2}
          />
          <Line
            d={
              mode === "cheap"
                ? "M265 255H390V100H520"
                : mode === "expensive"
                  ? "M265 255H390V290H520"
                  : "M265 255H390V480H520"
            }
            at={mode === "cheap" ? 1.8 : mode === "expensive" ? 6.2 : 12.2}
            duration={0.8}
          />
        </svg>
        <Reveal
          at={0.6}
          style={{
            position: "absolute",
            left: 0,
            top: 175,
            width: 265,
            height: 160,
            border: `1px solid ${C.lime}`,
            background: C.surface,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <span style={{ ...mono, color: C.lime }}>LUMEN</span>
          <span style={{ fontSize: 48, letterSpacing: -2 }}>Router</span>
        </Reveal>
        <Tier
          top={10}
          active={mode === "cheap"}
          title="Cheap model"
          detail="For straightforward questions"
        />
        <Tier
          top={200}
          active={mode === "expensive"}
          title="Expensive model"
          detail="For hard questions & escalation"
        />
        <Tier
          top={390}
          active={mode === "none"}
          title="No model called"
          detail="When the documents have no match"
        />
      </div>
      <Reveal
        at={15}
        style={{
          position: "absolute",
          left: 100,
          right: 100,
          top: 880,
          fontSize: 36,
          color: C.muted,
          opacity: interpolate(f, [15 * fps, 15.5 * fps], [0, 1], ease),
        }}
      >
        Bring your own models. Order primary and backups within each tier.
      </Reveal>
    </Frame>
  );
};
function Tier({
  top,
  active,
  title,
  detail,
}: {
  top: number;
  active: boolean;
  title: string;
  detail: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 520,
        top,
        width: 460,
        height: 160,
        border: `1px solid ${active ? C.lime : C.line}`,
        background: active ? C.lime : C.surface,
        color: active ? C.bg : C.muted,
        padding: "24px 26px",
      }}
    >
      <div style={{ fontSize: 38, letterSpacing: -1.4, marginBottom: 12 }}>
        {title}
      </div>
      <div style={{ fontSize: 23 }}>{detail}</div>
    </div>
  );
}
