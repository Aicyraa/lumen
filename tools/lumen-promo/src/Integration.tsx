import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, Frame, Label, Reveal, Title, mono, ease } from "./design";
export const Integration = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stage = Math.min(2, Math.floor(f / fps / 2.6));
  const code =
    'const reply = await fetch("/v1/chat", {\n  method: "POST",\n  headers: {\n    "Content-Type": "application/json",\n    "x-api-key": process.env.LUMEN_KEY\n  },\n  body: JSON.stringify({\n    query: "What do my documents say?"\n  })\n});';
  return (
    <Frame chapter="SEAMLESS RAG INTEGRATION" number="02" seconds={10}>
      <div style={{ position: "absolute", left: 100, top: 225, width: 790 }}>
        <Reveal>
          <Label>FROM YOUR DOCS. INTO YOUR APP.</Label>
          <Title size={108}>
            Seamless
            <br />
            RAG integration.
          </Title>
        </Reveal>
        <div
          style={{
            marginTop: 55,
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          {[
            "Upload your documents",
            "Create a project API key",
            "Call POST /v1/chat",
          ].map((s, i) => (
            <Reveal
              key={s}
              at={0.6 + i * 0.4}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 25,
                fontSize: 35,
                color: stage === i ? C.text : C.muted,
              }}
            >
              <span
                style={{
                  ...mono,
                  width: 60,
                  height: 60,
                  display: "grid",
                  placeItems: "center",
                  background: stage === i ? C.lime : C.surface,
                  color: stage === i ? C.bg : C.muted,
                  border: "1px solid " + C.line,
                  borderRadius: 100,
                }}
              >
                0{i + 1}
              </span>
              {s}
            </Reveal>
          ))}
        </div>
        <Reveal
          at={6.5}
          style={{ marginTop: 35, fontSize: 28, color: C.muted }}
        >
          Keep your API key on your backend.
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          left: 955,
          top: 230,
          width: 865,
          perspective: 1600,
        }}
      >
        <Reveal
          at={0.5}
          style={{
            transform: "rotateY(-8deg) rotateX(3deg)",
            background: C.surface,
            border: "1px solid " + C.line,
            padding: 36,
            height: 610,
          }}
        >
          <div
            style={{
              ...mono,
              color: C.lime,
              borderBottom: "1px solid " + C.line,
              paddingBottom: 24,
              fontSize: 22,
            }}
          >
            YOUR BACKEND / JAVASCRIPT
          </div>
          <pre
            style={{
              fontFamily: "Geist Mono",
              fontSize: 22,
              lineHeight: 1.55,
              color: C.text,
              whiteSpace: "pre-wrap",
              marginTop: 28,
            }}
          >
            {code.slice(
              0,
              Math.floor(
                interpolate(f, [1.2 * fps, 5.3 * fps], [0, code.length], ease),
              ),
            )}
            <span style={{ color: C.lime, opacity: Math.floor(f / 12) % 2 }}>
              ▍
            </span>
          </pre>
        </Reveal>
        <Reveal
          at={6}
          style={{
            position: "absolute",
            left: 55,
            right: -15,
            top: 520,
            background: C.lime,
            color: C.bg,
            padding: "25px 30px",
            border: "1px solid " + C.bg,
            rotate: "-2deg",
          }}
        >
          <div style={{ ...mono, fontSize: 20 }}>ONE RESPONSE</div>
          <div style={{ fontSize: 36, marginTop: 12 }}>
            Answer + sources + route
          </div>
        </Reveal>
      </div>
    </Frame>
  );
};
