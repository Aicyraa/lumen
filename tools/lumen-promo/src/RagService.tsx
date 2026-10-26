import { C, Frame, Label, Reveal, Title, Line, mono } from "./design";

export const RagService = () => (
  <Frame chapter="THE RAG SERVICE" number="03" seconds={12}>
    <div style={{ position: "absolute", left: 100, top: 210 }}>
      <Reveal>
        <Label>FROM FILES TO CONTEXT</Label>
        <Title>
          The RAG service.
          <br />
          <span style={{ color: C.lime }}>Working underneath.</span>
        </Title>
      </Reveal>
    </div>
    <div
      style={{
        position: "absolute",
        left: 100,
        top: 490,
        width: 1720,
        height: 225,
      }}
    >
      <svg width="1720" height="225" style={{ position: "absolute" }}>
        <Line d="M290 110H435" at={1.2} />
        <Line d="M725 110H870" at={2.4} />
        <Line d="M1160 110H1305" at={3.6} />
      </svg>
      <Node left={0} at={0.5} n="01" title="Chunk" detail="Split documents" />
      <Node left={435} at={1.7} n="02" title="Embed" detail="Encode meaning" />
      <Node
        left={870}
        at={2.9}
        n="03"
        title="Retrieve"
        detail="Vector + BM25"
      />
      <Node
        left={1305}
        at={4.1}
        n="04"
        title="Rerank"
        detail="Select context"
      />
    </div>
    <Reveal
      at={6}
      style={{
        position: "absolute",
        left: 100,
        right: 100,
        top: 770,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 70,
      }}
    >
      <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 28 }}>
        <div style={{ fontSize: 40 }}>Project-scoped retrieval.</div>
        <div style={{ color: C.muted, fontSize: 28, marginTop: 15 }}>
          Each request searches its own tenant’s documents.
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 28 }}>
        <div style={{ fontSize: 40 }}>Evidence-backed answers.</div>
        <div style={{ color: C.muted, fontSize: 28, marginTop: 15 }}>
          Quotes are checked before citations are rendered.
        </div>
      </div>
    </Reveal>
  </Frame>
);
function Node({
  left,
  at,
  n,
  title,
  detail,
}: {
  left: number;
  at: number;
  n: string;
  title: string;
  detail: string;
}) {
  return (
    <Reveal
      at={at}
      style={{
        position: "absolute",
        left,
        width: 290,
        height: 225,
        background: C.surface,
        border: `1px solid ${C.line}`,
        padding: 28,
      }}
    >
      <div style={{ ...mono, color: C.lime, fontSize: 21, marginBottom: 30 }}>
        {n} / RAG
      </div>
      <div style={{ fontSize: 48, letterSpacing: -2 }}>{title}</div>
      <div style={{ fontSize: 25, color: C.muted, marginTop: 14 }}>
        {detail}
      </div>
    </Reveal>
  );
}
