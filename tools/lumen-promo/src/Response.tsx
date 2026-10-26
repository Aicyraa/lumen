import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, Frame, Label, Reveal, Title, mono, ease } from "./design";
export const Response = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reply = "Lumen retrieves context from your project’s documents. [1]";
  return (
    <Frame chapter="ANSWERS YOU CAN INSPECT" number="05" seconds={12}>
      <div style={{ position: "absolute", left: 100, top: 220, width: 800 }}>
        <Reveal>
          <Label>SEE WHAT HAPPENED</Label>
          <Title size={112}>
            More than
            <br />
            <span style={{ color: C.lime }}>an answer.</span>
          </Title>
        </Reveal>
        <Reveal
          at={1}
          style={{
            marginTop: 40,
            fontSize: 37,
            lineHeight: 1.35,
            color: C.muted,
            maxWidth: 710,
          }}
        >
          Sources to trace.
          <br />A route to understand.
          <br />
          Usage to inspect.
        </Reveal>
        <Reveal
          at={6}
          style={{
            marginTop: 45,
            display: "flex",
            gap: 15,
            flexWrap: "wrap",
            width: 750,
          }}
        >
          {["Support bots", "Internal knowledge", "Document Q&A"].map((s) => (
            <div
              key={s}
              style={{
                padding: "14px 20px",
                border: "1px solid " + C.line,
                fontSize: 24,
                borderRadius: 100,
              }}
            >
              {s}
            </div>
          ))}
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          left: 970,
          top: 220,
          width: 850,
          perspective: 1400,
        }}
      >
        <Reveal
          at={0.6}
          style={{
            background: C.surface,
            border: "1px solid " + C.line,
            padding: 36,
            transform: "rotateY(-5deg) rotateX(2deg)",
          }}
        >
          <div style={{ ...mono, color: C.muted, fontSize: 20 }}>
            ILLUSTRATIVE RESPONSE / TRY IT
          </div>
          <div
            style={{
              fontSize: 34,
              marginTop: 35,
              lineHeight: 1.4,
              minHeight: 145,
            }}
          >
            {reply.slice(
              0,
              Math.floor(
                interpolate(f, [1.2 * fps, 3.4 * fps], [0, reply.length], ease),
              ),
            )}
          </div>
          <Reveal
            at={3.4}
            style={{
              padding: 24,
              border: "1px solid " + C.line,
              background: C.bg,
            }}
          >
            <div style={{ ...mono, color: C.lime, fontSize: 20 }}>
              SOURCE [1]
            </div>
            <div style={{ fontSize: 27, marginTop: 15 }}>
              Project documents · retrieved context
            </div>
            <div style={{ fontSize: 23, color: C.muted, marginTop: 12 }}>
              Evidence quotes checked before citations.
            </div>
          </Reveal>
          <Reveal
            at={4.8}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 25,
              marginTop: 30,
            }}
          >
            <div style={{ borderTop: "1px solid " + C.line, paddingTop: 20 }}>
              <div style={{ ...mono, fontSize: 18, color: C.muted }}>ROUTE</div>
              <div style={{ fontSize: 30, marginTop: 10, color: C.lime }}>
                cheap / expensive
              </div>
            </div>
            <div style={{ borderTop: "1px solid " + C.line, paddingTop: 20 }}>
              <div style={{ ...mono, fontSize: 18, color: C.muted }}>
                VISIBILITY
              </div>
              <div style={{ fontSize: 30, marginTop: 10 }}>
                Tokens + latency
              </div>
            </div>
          </Reveal>
        </Reveal>
        <Reveal
          at={7.2}
          style={{
            marginTop: 28,
            display: "flex",
            gap: 40,
            ...mono,
            fontSize: 21,
            color: C.lime,
          }}
        >
          <span>REQUEST LOGS / ROUTING ANALYTICS</span>
        </Reveal>
      </div>
    </Frame>
  );
};
