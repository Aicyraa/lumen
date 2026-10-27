import {
  interpolate,
  interpolateColors,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, mono, ease } from "./design";

// Project the four plane corners through the same CSS rotations and perspective.
// The portrait parent centers the visible stack, rather than its empty 850px wrapper.
export function documentCenterX(frame: number, fps: number) {
  const t = frame / fps,
    rad = Math.PI / 180;
  const rx = (18 + Math.sin(t * 0.65) * 7) * rad,
    ry = (-24 + Math.sin(t * 0.4) * 12) * rad,
    rz = -8 * rad;
  const spread = interpolate(
    frame,
    [0, 1.8 * fps, 7 * fps, 10 * fps],
    [15, 100, 100, 30],
    ease,
  );
  const xs: number[] = [];
  for (let i = 0; i < 4; i++)
    for (const x of [-215, 215])
      for (const y of [-215, 215]) {
        const z = (i - 1.5) * spread;
        const x1 = x * Math.cos(rz) - y * Math.sin(rz),
          y1 = x * Math.sin(rz) + y * Math.cos(rz);
        const x2 = x1 * Math.cos(ry) + z * Math.sin(ry),
          z2 = -x1 * Math.sin(ry) + z * Math.cos(ry);
        const z3 = y1 * Math.sin(rx) + z2 * Math.cos(rx);
        xs.push(425 + ((415 + x2 - 425) * 1600) / (1600 - z3));
      }
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

// Perspective planes add deterministic depth without a WebGL dependency.
export const DocumentRig = ({ engine = false }: { engine?: boolean }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const focus = interpolate(
    t,
    [1, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5],
    [0, 0, 1, 1, 2, 2, 3],
    ease,
  );
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
            data-document-plane={i}
            style={{
              position: "absolute",
              width: 430,
              height: 430,
              padding: 35,
              background: interpolateColors(
                Math.max(0, 1 - Math.abs(focus - i)),
                [0, 1],
                [C.surface, C.lime],
              ),
              color: interpolateColors(
                Math.max(0, 1 - Math.abs(focus - i)),
                [0, 1],
                [C.text, C.bg],
              ),
              border:
                "2px solid " +
                interpolateColors(
                  Math.max(0, 1 - Math.abs(focus - i)),
                  [0, 1],
                  [C.line, C.lime],
                ),
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
                          border:
                            "1px solid " +
                            interpolateColors(
                              Math.max(0, 1 - Math.abs(focus - i)),
                              [0, 1],
                              [C.line, C.bg],
                            ),
                          background:
                            j % 3 === 0
                              ? interpolateColors(
                                  Math.max(0, 1 - Math.abs(focus - i)),
                                  [0, 1],
                                  [C.lime, C.bg],
                                )
                              : "transparent",
                        }
                      : {
                          height: 8,
                          width: (j % 2 ? 65 : 100) + "%",
                          marginBottom: 29,
                          background: interpolateColors(
                            Math.max(0, 1 - Math.abs(focus - i)),
                            [0, 1],
                            [j === 2 ? C.lime : C.line, C.bg],
                          ),
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
