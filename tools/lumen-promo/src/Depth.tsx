import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, mono, ease } from "./design";

// Perspective planes add deterministic depth without a WebGL dependency.
export const DocumentRig = ({ engine = false }: { engine?: boolean }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const active = Math.min(3, Math.floor(Math.max(0, t - 1) / 2));
  const spread = interpolate(
    f,
    [0, 1.8 * fps, 7 * fps, 10 * fps],
    [15, 100, 100, 30],
    ease,
  );
  return (
    <div
      style={{
        width: 850,
        height: 650,
        perspective: 1600,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 200,
          top: 100,
          width: 430,
          height: 430,
          transformStyle: "preserve-3d",
          transform:
            "rotateX(" +
            (engine ? 53 : 18 + Math.sin(t * 0.65) * 7) +
            "deg) rotateY(" +
            (engine ? -24 : -24 + Math.sin(t * 0.4) * 12) +
            "deg) rotateZ(" +
            (engine ? -23 : -8) +
            "deg)",
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 430,
              height: 430,
              padding: 35,
              background: i === active ? C.lime : C.surface,
              color: i === active ? C.bg : C.text,
              border: "2px solid " + (i === active ? C.lime : C.line),
              transform: "translateZ(" + (i - 1.5) * spread + "px)",
              backfaceVisibility: "visible",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                ...mono,
                fontSize: 22,
              }}
            >
              <span>
                {engine
                  ? ["CHUNK", "EMBED", "RETRIEVE", "RERANK"][i]
                  : ["HANDBOOK.PDF", "POLICIES.MD", "GUIDE.TXT", "CONTEXT"][i]}
              </span>
              <span>0{i + 1}</span>
            </div>
            <div style={{ marginTop: 45 }}>
              {Array.from({ length: engine && i === 1 ? 16 : 5 }, (_, j) => (
                <div
                  key={j}
                  style={
                    engine && i === 1
                      ? {
                          display: "inline-block",
                          width: 44,
                          height: 44,
                          margin: 8,
                          border: "1px solid " + (i === active ? C.bg : C.line),
                          background:
                            j % 3 === 0
                              ? i === active
                                ? C.bg
                                : C.lime
                              : "transparent",
                        }
                      : {
                          height: 8,
                          width: (j % 2 ? 65 : 100) + "%",
                          marginBottom: 29,
                          background:
                            i === active ? C.bg : j === 2 ? C.lime : C.line,
                        }
                  }
                />
              ))}
            </div>
            <div
              style={{
                position: "absolute",
                bottom: 30,
                ...mono,
                fontSize: 18,
              }}
            >
              {engine
                ? [
                    "TEXT → CHUNKS",
                    "MEANING → VECTORS",
                    "VECTOR + BM25",
                    "RELEVANCE → CONTEXT",
                  ][i]
                : "YOUR KNOWLEDGE / CONNECTED"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
export const Packets = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <svg width="1640" height="150">
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <path
            d={"M0 " + (25 + i * 48) + "H1640"}
            stroke={C.line}
            fill="none"
          />
          {[0, 1, 2, 3].map((j) => (
            <rect
              key={j}
              x={((f / fps) * 170 + j * 410 + i * 77) % 1640}
              y={21 + i * 48}
              width={34}
              height={8}
              fill={i === 1 ? C.lime : C.text}
            />
          ))}
        </g>
      ))}
    </svg>
  );
};
