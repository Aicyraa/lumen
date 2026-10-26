import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, Frame, Label, Reveal, Title, ease, mono } from "./design";
import { DocumentRig, Packets } from "./Depth";
export const Opening = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const second = f > 3.2 * fps;
  return (
    <Frame>
      <div style={{ position: "absolute", left: 100, top: 230, width: 1080 }}>
        <Reveal at={0.2}>
          <Label>YOUR CHATBOT HAS A MISSING PIECE.</Label>
        </Reveal>
        <div
          style={{
            opacity: interpolate(
              f,
              second ? [3.2 * fps, 3.65 * fps] : [0, 0.6 * fps],
              [0, 1],
              ease,
            ),
          }}
        >
          <Title size={136}>
            {second ? (
              <>
                Give it
                <br />
                <span style={{ color: C.lime }}>Lumen.</span>
              </>
            ) : (
              <>
                It needs
                <br />
                <span style={{ color: C.lime }}>your context.</span>
              </>
            )}
          </Title>
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
