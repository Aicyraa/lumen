import { FitLine } from "./FitLine";
import {
  interpolate,
  interpolateColors,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, Frame, Reveal, mono } from "./design";
import { glide } from "./motion";

// One continuous camera move replaces the four-cell highlight grid.
export const RagService = () => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const t = f / fps;
  const position = interpolate(
    t,
    [0, 1.8, 3.15, 4.25, 5.6, 6.7, 8.05, 11],
    [0, 0, 1, 1, 2, 2, 3, 3],
    glide,
  );
  const stages = ["Chunk", "Embed", "Retrieve", "Rerank"];
  const copy = [
    "Break documents into useful passages.",
    "Turn meaning into searchable vectors.",
    "Combine vector search with keywords.",
    "Bring the most relevant context forward.",
  ];
  return (
    <Frame>
      <Reveal
        at={0.15}
        style={{
          position: "absolute",
          left: portrait ? 90 : 120,
          top: portrait ? 210 : 100,
          ...mono,
          color: C.lime,
          fontSize: portrait ? 28 : 26,
        }}
      >
        THE RAG SERVICE
      </Reveal>
      <Reveal
        at={0.3}
        style={{
          position: "absolute",
          left: portrait ? 90 : 120,
          top: portrait ? 280 : 155,
          fontSize: portrait ? 76 : 64,
          width: portrait ? 860 : undefined,
          lineHeight: portrait ? 1.08 : undefined,
          letterSpacing: -3,
        }}
      >
        {portrait ? (
          <>
            <FitLine
              text="From documents"
              width={860}
              maxFontSize={76}
              spacing={-3}
            />
            <FitLine
              text="to relevant context."
              width={860}
              maxFontSize={76}
              spacing={-3}
            />
          </>
        ) : (
          "From documents to relevant context."
        )}
      </Reveal>
      <div
        style={{
          position: "absolute",
          left: portrait ? 90 : 460,
          top: portrait ? 640 : 310,
          width: portrait ? 900 : 1000,
          height: 445,
          translate: -position * (portrait ? 1120 : 1420) + "px 0px",
        }}
      >
        {stages.map((name, i) => {
          const w = Math.max(0, 1 - Math.abs(position - i));
          return (
            <div
              key={name}
              style={{
                position: "absolute",
                left: i * (portrait ? 1120 : 1420),
                width: portrait ? 900 : 1000,
                height: 445,
                opacity: 0.15 + 0.85 * w,
                scale: 0.9 + 0.1 * w,
              }}
            >
              <div
                style={{
                  fontSize: portrait ? 110 : 100,
                  fontWeight: 500,
                  letterSpacing: -5,
                  textAlign: "center",
                  color: interpolateColors(w, [0, 1], [C.muted, C.text]),
                }}
              >
                {name}
                <span style={{ color: C.lime }}>.</span>
              </div>
              <svg
                width={portrait ? 900 : 1000}
                height={portrait ? 400 : 280}
                viewBox="0 0 1000 280"
                style={{ marginTop: 35 }}
              >
                {i === 0 &&
                  [0, 1, 2, 3, 4].map((j) => (
                    <g
                      key={j}
                      style={{
                        translate: Math.sin(t * 0.65 + j) * 7 + "px 0px",
                      }}
                    >
                      <rect
                        x={120 + j * 150}
                        y={65 + (j % 2) * 30}
                        width="115"
                        height="120"
                        rx="4"
                        fill={C.surface}
                        stroke={C.line}
                      />
                      {[0, 1, 2, 3].map((k) => (
                        <rect
                          key={k}
                          x={138 + j * 150}
                          y={85 + (j % 2) * 30 + k * 20}
                          width={k % 2 ? 55 : 78}
                          height="4"
                          fill={k === 1 ? C.lime : C.muted}
                        />
                      ))}
                    </g>
                  ))}
                {i === 1 &&
                  Array.from({ length: 45 }, (_, j) => (
                    <circle
                      key={j}
                      cx={125 + (j % 15) * 54}
                      cy={
                        65 +
                        Math.floor(j / 15) * 70 +
                        Math.sin(t + j * 0.45) * 15
                      }
                      r={6 + (j % 4) * 2}
                      fill={j % 4 === 0 ? C.lime : C.muted}
                    />
                  ))}
                {i === 2 &&
                  [0, 1, 2, 3].map((j) => (
                    <g key={j}>
                      <path
                        d={"M130 " + (50 + j * 55) + "H860"}
                        stroke={C.line}
                        strokeWidth="2"
                      />
                      <rect
                        x={130 + ((t * 90 + j * 130) % 650)}
                        y={43 + j * 55}
                        width="75"
                        height="14"
                        fill={j === 1 ? C.lime : C.muted}
                      />
                    </g>
                  ))}
                {i === 3 &&
                  [0, 1, 2].map((j) => (
                    <g
                      key={j}
                      style={{
                        translate:
                          (j === 0 ? Math.sin(t * 0.5) * 8 : 0) + "px 0px",
                      }}
                    >
                      <rect
                        x={210 + j * 225}
                        y={j === 0 ? 35 : 65}
                        width="180"
                        height={j === 0 ? 170 : 140}
                        rx="4"
                        fill={j === 0 ? C.lime : C.surface}
                        stroke={j === 0 ? C.lime : C.line}
                      />
                      {[0, 1, 2].map((k) => (
                        <rect
                          key={k}
                          x={235 + j * 225}
                          y={(j === 0 ? 75 : 100) + k * 27}
                          width={k === 2 ? 85 : 130}
                          height="5"
                          fill={j === 0 ? C.bg : C.muted}
                        />
                      ))}
                    </g>
                  ))}
              </svg>
            </div>
          );
        })}
      </div>
      {copy.map((text, i) => {
        const w = Math.max(0, 1 - 2 * Math.abs(position - i));
        return (
          <div
            key={text}
            style={{
              position: "absolute",
              left: portrait ? 100 : 250,
              right: portrait ? 120 : 250,
              top: portrait ? 1300 : 825,
              textAlign: "center",
              fontSize: portrait ? 46 : 39,
              letterSpacing: -1,
              color: C.muted,
              opacity: w,
              translate: "0px " + (1 - w) * 40 * (position > i ? -1 : 1) + "px",
            }}
          >
            {portrait ? (
              <FitLine text={text} width={860} maxFontSize={46} spacing={-1} />
            ) : (
              text
            )}
          </div>
        );
      })}
      <svg
        width="460"
        height="12"
        style={{
          position: "absolute",
          left: portrait ? 310 : 730,
          top: portrait ? 1480 : 958,
        }}
      >
        <path d="M0 6H460" stroke={C.line} strokeWidth="2" />
        <circle cx={10 + position * 146} cy="6" r="5" fill={C.lime} />
      </svg>
    </Frame>
  );
};
