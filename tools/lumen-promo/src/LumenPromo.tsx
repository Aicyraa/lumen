import { staticFile, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { fade } from "@remotion/transitions/fade";
import { Opening } from "./Opening";
import { Integration } from "./Integration";
import { RagService } from "./RagService";
import { Routing } from "./Routing";
import { Response } from "./Response";
import { Closing } from "./Closing";
export const LumenPromo = () => {
  const { fps } = useVideoConfig();
  // 63 seconds of scenes minus five 0.6-second overlaps = 60 seconds.
  return (
    <>
      <Audio
        name="Original electronic score"
        src={staticFile("lumen-score.wav")}
        volume={0.75}
        premountFor={fps}
      />
      <TransitionSeries>
        <TransitionSeries.Sequence
          name="The missing piece"
          durationInFrames={8 * fps}
          premountFor={fps}
        >
          <Opening />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-right" })}
          timing={linearTiming({ durationInFrames: 0.6 * fps })}
        />
        <TransitionSeries.Sequence
          name="Seamless RAG integration"
          durationInFrames={10 * fps}
          premountFor={fps}
        >
          <Integration />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={linearTiming({ durationInFrames: 0.6 * fps })}
        />
        <TransitionSeries.Sequence
          name="Exploded RAG engine"
          durationInFrames={11 * fps}
          premountFor={fps}
        >
          <RagService />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-left" })}
          timing={linearTiming({ durationInFrames: 0.6 * fps })}
        />
        <TransitionSeries.Sequence
          name="Cheap and expensive model routing"
          durationInFrames={14 * fps}
          premountFor={fps}
        >
          <Routing />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={linearTiming({ durationInFrames: 0.6 * fps })}
        />
        <TransitionSeries.Sequence
          name="An answer you can inspect"
          durationInFrames={12 * fps}
          premountFor={fps}
        >
          <Response />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 0.6 * fps })}
        />
        <TransitionSeries.Sequence
          name="Build with Lumen"
          durationInFrames={8 * fps}
          premountFor={fps}
        >
          <Closing />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </>
  );
};
