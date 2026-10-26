import { Series, staticFile, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { Opening } from "./Opening";
import { Integration } from "./Integration";
import { RagService } from "./RagService";
import { Routing } from "./Routing";
import { Closing } from "./Closing";

export const LumenPromo = () => {
  const { fps } = useVideoConfig();
  return (
    <>
      <Audio
        name="Original electronic score"
        src={staticFile("lumen-score.wav")}
        volume={0.65}
        premountFor={fps}
      />
      <Series>
        <Series.Sequence
          name="Meet Lumen"
          durationInFrames={7 * fps}
          premountFor={fps}
        >
          <Opening />
        </Series.Sequence>
        <Series.Sequence
          name="Seamless RAG integration"
          durationInFrames={12 * fps}
          premountFor={fps}
        >
          <Integration />
        </Series.Sequence>
        <Series.Sequence
          name="Inside the RAG service"
          durationInFrames={12 * fps}
          premountFor={fps}
        >
          <RagService />
        </Series.Sequence>
        <Series.Sequence
          name="Cheap and expensive model routing"
          durationInFrames={18 * fps}
          premountFor={fps}
        >
          <Routing />
        </Series.Sequence>
        <Series.Sequence
          name="Build with Lumen"
          durationInFrames={11 * fps}
          premountFor={fps}
        >
          <Closing />
        </Series.Sequence>
      </Series>
    </>
  );
};
