import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, Frame, Label, Reveal, Title, ease, mono } from "./design";
import { DocumentRig, Packets } from "./Depth";
export const Opening = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Frame>
      <div style={{ position: "absolute", left: 100, top: 230, width: 1080 }}>
        <Reveal at={0.2}>
          <Label>YOUR CHATBOT HAS A MISSING PIECE.</Label>
        </Reveal>
        <div style={{ height: 285, position: "relative" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: interpolate(f, [2.7 * fps, 3.25 * fps], [1, 0], ease),
              translate: interpolate(
                f,
                [2.7 * fps, 3.25 * fps],
                ["0px 0px", "0px -60px"],
                ease,
              ),
            }}
          >
            <Title size={136}>
              It needs
              <br />
              <span style={{ color: C.lime }}>your context.</span>
            </Title>
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: interpolate(f, [3.15 * fps, 3.8 * fps], [0, 1], ease),
              translate: interpolate(
                f,
                [3.15 * fps, 3.8 * fps],
                ["0px 60px", "0px 0px"],
                ease,
              ),
            }}
          >
            <Title size={136}>
              Give it
              <br />
              <span style={{ color: C.lime }}>Lumen.</span>
            </Title>
          </div>
        </div>
        <Reveal
          at={1.2}
          style={{
            fontSize: 40,
            color: C.muted,
            marginTop: 38,
            maxWidth: 810,
            lineHeight: 1.3,
          }}
        >
          Turn the documents you already have into answers your app can use.
        </Reveal>
        <Reveal at={4.2} style={{ ...mono, marginTop: 45, color: C.lime }}>
          A RAG GATEWAY. YOUR MODELS. ONE API.
        </Reveal>
      </div>
      <div style={{ position: "absolute", left: 1020, top: 195, scale: 1.08 }}>
        <DocumentRig />
      </div>
      <div style={{ position: "absolute", left: 100, top: 825 }}>
        <Packets />
      </div>
    </Frame>
  );
};
