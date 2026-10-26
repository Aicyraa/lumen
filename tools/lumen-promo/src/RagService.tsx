import { useCurrentFrame, useVideoConfig } from "remotion";
import { C, Frame, Label, Reveal, Title, mono } from "./design";
import { DocumentRig } from "./Depth";
export const RagService = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const step = Math.min(3, Math.floor(Math.max(0, f / fps - 1) / 2));
  return (
    <Frame>
      <div style={{ position: "absolute", left: 100, top: 220, width: 850 }}>
        <Reveal>
          <Label>THE ENGINE UNDER THE ANSWER</Label>
          <Title size={108}>
            The RAG service.
            <br />
            <span style={{ color: C.lime }}>In motion.</span>
          </Title>
        </Reveal>
        <div
          style={{
            marginTop: 50,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 26,
          }}
        >
          {[
            "Chunk documents",
            "Embed meaning",
            "Retrieve context",
            "Rerank matches",
          ].map((s, i) => (
            <Reveal
              key={s}
              at={0.5 + i * 0.3}
              style={{
                borderTop: "2px solid " + (step === i ? C.lime : C.line),
                paddingTop: 20,
              }}
            >
              <div
                style={{
                  ...mono,
                  color: step === i ? C.lime : C.muted,
                  fontSize: 21,
                }}
              >
                0{i + 1} / {step === i ? "ACTIVE" : "RAG"}
              </div>
              <div style={{ fontSize: 31, marginTop: 14 }}>{s}</div>
            </Reveal>
          ))}
        </div>
        <Reveal
          at={7.6}
          style={{
            marginTop: 40,
            fontSize: 29,
            color: C.muted,
            lineHeight: 1.4,
          }}
        >
          Hybrid vector + keyword retrieval.
          <br />
          Context scoped to your project.
        </Reveal>
      </div>
      <div style={{ position: "absolute", left: 970, top: 220, scale: 1.1 }}>
        <DocumentRig engine />
      </div>
      <Reveal
        at={1.5}
        style={{
          position: "absolute",
          left: 1070,
          top: 875,
          width: 650,
          borderTop: "1px solid " + C.line,
          paddingTop: 20,
        }}
      >
        <div style={{ ...mono, color: C.lime, fontSize: 22 }}>
          RAG SERVICE / INTERNAL FASTAPI
        </div>
      </Reveal>
    </Frame>
  );
};
