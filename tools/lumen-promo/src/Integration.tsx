import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { Arrow, C, Frame, Label, Reveal, Title, mono, ease } from "./design";

export const Integration = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Frame chapter="SEAMLESS INTEGRATION" number="02" seconds={12}>
      <div style={{ position: "absolute", left: 100, top: 210 }}>
        <Reveal>
          <Label>CONNECT YOUR CHATBOT</Label>
          <Title>
            Seamless RAG
            <br />
            <span style={{ color: C.lime }}>integration.</span>
          </Title>
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          left: 100,
          right: 100,
          top: 490,
          display: "grid",
          gridTemplateColumns: "1fr 70px 1fr 70px 1fr",
          alignItems: "center",
          gap: 24,
        }}
      >
        <Reveal at={0.7}>
          <Step n="01" title="Upload documents" detail="PDF · TXT · Markdown" />
        </Reveal>
        <Reveal at={1.4}>
          <Arrow />
        </Reveal>
        <Reveal at={1.7}>
          <Step
            n="02"
            title="Create an API key"
            detail="Scoped to your project"
          />
        </Reveal>
        <Reveal at={2.4}>
          <Arrow />
        </Reveal>
        <Reveal at={2.7}>
          <Step n="03" title="Call /v1/chat" detail="From your backend" />
        </Reveal>
      </div>
      <Reveal
        at={4}
        style={{
          position: "absolute",
          left: 100,
          right: 100,
          top: 750,
          border: `1px solid ${C.line}`,
          background: C.surface,
          padding: "26px 36px",
          display: "flex",
          alignItems: "center",
          gap: 40,
        }}
      >
        <div style={{ ...mono, color: C.lime, fontSize: 25 }}>
          POST /v1/chat
        </div>
        <code style={{ fontFamily: "Geist Mono", fontSize: 30, color: C.text }}>
          {'{ "query": "What do my documents say?" }'.slice(
            0,
            Math.floor(interpolate(f, [4.3 * fps, 6.3 * fps], [0, 47], ease)),
          )}
        </code>
      </Reveal>
      <Reveal
        at={7.5}
        style={{
          position: "absolute",
          left: 100,
          top: 875,
          fontSize: 40,
          color: C.muted,
        }}
      >
        One endpoint. Answers, sources, and the route taken.
      </Reveal>
    </Frame>
  );
};
function Step({
  n,
  title,
  detail,
}: {
  n: string;
  title: string;
  detail: string;
}) {
  return (
    <div
      style={{ borderTop: `2px solid ${C.line}`, paddingTop: 25, height: 188 }}
    >
      <div style={{ ...mono, color: C.lime, marginBottom: 23 }}>{n}</div>
      <div style={{ fontSize: 39, letterSpacing: -1.5, whiteSpace: "nowrap" }}>
        {title}
      </div>
      <div style={{ fontSize: 27, color: C.muted, marginTop: 16 }}>
        {detail}
      </div>
    </div>
  );
}
