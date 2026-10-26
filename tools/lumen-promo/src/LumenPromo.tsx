import { staticFile, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Opening } from "./Opening";
import { Integration } from "./Integration";
import { RagService } from "./RagService";
import { Routing } from "./Routing";
import { Response } from "./Response";
import { Closing } from "./Closing";
import { SceneMotion } from "./motion";
export const LumenPromo = () => {
  const { fps } = useVideoConfig();
  // 63 seconds of scenes minus five 0.6-second overlaps = 60 seconds.
  return (
    <>
      <Audio
        name="Warm downtempo keys"
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
          <SceneMotion seconds={8}>
            <Opening />
          </SceneMotion>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 0.6 * fps })}
        />
        <TransitionSeries.Sequence
          name="Seamless RAG integration"
          durationInFrames={10 * fps}
          premountFor={fps}
        >
          <SceneMotion seconds={10}>
            <Integration />
          </SceneMotion>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 0.6 * fps })}
        />
        <TransitionSeries.Sequence
          name="Continuous RAG journey"
          durationInFrames={11 * fps}
          premountFor={fps}
        >
          <SceneMotion seconds={11}>
            <RagService />
          </SceneMotion>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 0.6 * fps })}
        />
        <TransitionSeries.Sequence
          name="Cheap and expensive model routing"
          durationInFrames={14 * fps}
          premountFor={fps}
        >
          <SceneMotion seconds={14}>
            <Routing />
          </SceneMotion>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 0.6 * fps })}
        />
        <TransitionSeries.Sequence
          name="An answer you can inspect"
          durationInFrames={12 * fps}
          premountFor={fps}
        >
          <SceneMotion seconds={12}>
            <Response />
          </SceneMotion>
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
          <SceneMotion seconds={8}>
            <Closing />
          </SceneMotion>
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </>
  );
};
