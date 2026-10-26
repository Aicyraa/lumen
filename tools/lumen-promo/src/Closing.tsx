import {
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Img,
  staticFile,
} from "remotion";
import { C, Frame, Reveal, Title, mono, ease } from "./design";
export const Closing = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Frame chapter="BUILD WITH LUMEN" number="06" seconds={8} light>
      <div style={{ position: "absolute", left: 100, top: 225, width: 1220 }}>
        <Reveal>
          <div style={{ ...mono, marginBottom: 35 }}>
            LESS WIRING. MORE BUILDING.
          </div>
        </Reveal>
        <Reveal at={0.4}>
          <Title size={136}>
            Give your app
            <br />
            your knowledge.
          </Title>
        </Reveal>
        <Reveal
          at={1.5}
          style={{ fontSize: 39, marginTop: 45, lineHeight: 1.4 }}
        >
          Seamless RAG integration.
          <br />
          Cheap + expensive model routing.
          <br />
          One connected RAG service.
        </Reveal>
        <Reveal
          at={3.4}
          style={{
            marginTop: 45,
            display: "inline-block",
            padding: "25px 35px",
            background: C.bg,
            color: C.text,
            borderRadius: 100,
            fontSize: 31,
          }}
        >
          Explore Lumen on GitHub
        </Reveal>
        <Reveal
          at={4}
          style={{ fontFamily: "Geist Mono", fontSize: 29, marginTop: 27 }}
        >
          github.com/Aicyraa/lumen
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          left: 1420,
          top: 340,
          width: 300,
          height: 330,
          perspective: 1200,
        }}
      >
        <Img
          src={staticFile("lumen-mark.svg")}
          style={{
            width: 300,
            height: 300,
            background: C.bg,
            padding: 25,
            borderRadius: 35,
            transform:
              "rotateY(" +
              interpolate(f, [0, 3 * fps], [100, -15], ease) +
              "deg) rotateZ(" +
              Math.sin(f / fps) * 5 +
              "deg)",
          }}
        />
      </div>
    </Frame>
  );
};
