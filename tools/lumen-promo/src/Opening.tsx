import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, Frame, Label, Reveal, Title, ease, mono } from "./design";
import { DocumentRig, Packets, documentCenterX } from "./Depth";
import { FitLine } from "./FitLine";
export const Opening = () => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;

  return (
    <Frame>
      <div
        style={{
          position: "absolute",
          left: portrait ? 90 : 100,
          top: portrait ? 220 : 230,
          width: portrait ? 900 : 1080,
        }}
      >
        <Reveal at={0.2}>
          <Label>YOUR CHATBOT HAS A MISSING PIECE.</Label>
        </Reveal>
        <div style={{ height: portrait ? 250 : 285, position: "relative" }}>
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
            <Title size={portrait ? 112 : 136}>
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
            <Title size={portrait ? 112 : 136}>
              Give it
              <br />
              <span style={{ color: C.lime }}>Lumen.</span>
            </Title>
          </div>
        </div>
        <Reveal
          at={1.2}
          style={{
            fontSize: portrait ? 44 : 40,
            color: C.muted,
            marginTop: 38,
            maxWidth: portrait ? 850 : 810,
            lineHeight: 1.3,
          }}
        >
          {portrait ? (
            <>
              <FitLine
                text="Turn the documents you already have"
                width={850}
                maxFontSize={44}
              />
              <FitLine
                text="into answers your app can use."
                width={850}
                maxFontSize={44}
              />
            </>
          ) : (
            "Turn the documents you already have into answers your app can use."
          )}
        </Reveal>
        <Reveal at={4.2} style={{ ...mono, marginTop: 45, color: C.lime }}>
          A RAG GATEWAY. YOUR MODELS. ONE API.
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          left: portrait ? width / 2 - documentCenterX(f, fps) * 0.9 : 1020,
          top: portrait ? 920 : 195,
          scale: portrait ? 0.9 : 1.08,
          transformOrigin: portrait ? "top left" : undefined,
        }}
        data-document-stack
      >
        <DocumentRig />
      </div>
      <div
        style={{
          position: "absolute",
          left: portrait ? 90 : 100,
          top: portrait ? 1600 : 825,
          scale: portrait ? 0.53 : 1,
          transformOrigin: "top left",
        }}
      >
        <Packets />
      </div>
    </Frame>
  );
};
