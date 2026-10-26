import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { C, Frame, Label, Reveal, Title, mono, ease } from "./design";

export const Opening = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Frame chapter="MEET LUMEN" number="01" seconds={7}>
      <div style={{ position: "absolute", left: 100, top: 235, width: 1270 }}>
        <Reveal at={0.2}>
          <Label>THE RAG GATEWAY FOR YOUR CHATBOT</Label>
        </Reveal>
        <Reveal at={0.5}>
          <Title size={142}>
            Your documents.
            <br />
            Answers that
            <br />
            <span style={{ color: C.lime }}>connect.</span>
          </Title>
        </Reveal>
        <Reveal
          at={1.6}
          style={{ marginTop: 40, fontSize: 42, color: C.muted }}
        >
          A RAG API. Built to fit your application.
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          right: 110,
          top: 300,
          width: 340,
          height: 440,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 260,
              height: 340,
              border: `1px solid ${i === 2 ? C.lime : C.line}`,
              background: C.surface,
              padding: 30,
              left: 40 - i * 25,
              top: i * 35,
              rotate: `${(i - 1) * 7}deg`,
              opacity: interpolate(
                f,
                [(1 + i * 0.2) * fps, (1.6 + i * 0.2) * fps],
                [0, 1],
                ease,
              ),
              translate: interpolate(
                f,
                [(1 + i * 0.2) * fps, (1.8 + i * 0.2) * fps],
                ["0px 80px", "0px 0px"],
                ease,
              ),
            }}
          >
            <div
              style={{
                ...mono,
                color: i === 2 ? C.lime : C.muted,
                fontSize: 19,
              }}
            >
              DOCUMENT / 0{i + 1}
            </div>
            {[0, 1, 2, 3, 4].map((j) => (
              <div
                key={j}
                style={{
                  height: 5,
                  width: `${j % 2 ? 70 : 100}%`,
                  background: j === 2 && i === 2 ? C.lime : C.line,
                  marginTop: 30,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </Frame>
  );
};
