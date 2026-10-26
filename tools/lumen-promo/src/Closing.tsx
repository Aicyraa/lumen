import { C, Frame, Reveal, Title, mono } from "./design";

export const Closing = () => (
  <Frame chapter="BUILD WITH LUMEN" number="05" light seconds={11}>
    <div style={{ position: "absolute", left: 100, top: 230, right: 100 }}>
      <Reveal at={0.2}>
        <div style={{ ...mono, marginBottom: 35 }}>
          SEAMLESS RAG INTEGRATION
        </div>
      </Reveal>
      <Reveal at={0.5}>
        <Title size={124}>
          Your knowledge.
          <br />
          Your models.
          <br />
          One Lumen API.
        </Title>
      </Reveal>
      <Reveal at={2.3} style={{ marginTop: 48, fontSize: 39 }}>
        Upload documents. Connect models. Call{" "}
        <span style={{ fontFamily: "Geist Mono" }}>/v1/chat</span>.
      </Reveal>
      <Reveal
        at={4}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 45,
          marginTop: 45,
        }}
      >
        <div
          style={{
            background: C.bg,
            color: C.text,
            padding: "25px 38px",
            borderRadius: 100,
            fontSize: 33,
          }}
        >
          Explore Lumen
        </div>
        <div style={{ fontFamily: "Geist Mono", fontSize: 27 }}>
          github.com/Aicyraa/lumen
        </div>
      </Reveal>
    </div>
  </Frame>
);
