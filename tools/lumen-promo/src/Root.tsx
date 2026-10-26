import { Composition, Folder } from "remotion";
import { LumenPromo, LumenPromoMobile } from "./LumenPromo";
import { Opening } from "./Opening";
import { Integration } from "./Integration";
import { RagService } from "./RagService";
import { Routing } from "./Routing";
import { Closing } from "./Closing";
import { Response } from "./Response";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="LumenPromo"
        component={LumenPromo}
        durationInFrames={1800}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="LumenPromoMobile"
        component={LumenPromoMobile}
        durationInFrames={1800}
        fps={30}
        width={1080}
        height={1920}
      />
      <Folder name="Scenes">
        <Composition
          id="Opening"
          component={Opening}
          durationInFrames={240}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Integration"
          component={Integration}
          durationInFrames={300}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="RagService"
          component={RagService}
          durationInFrames={330}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Routing"
          component={Routing}
          durationInFrames={420}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Response"
          component={Response}
          durationInFrames={360}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Closing"
          component={Closing}
          durationInFrames={240}
          fps={30}
          width={1920}
          height={1080}
        />
      </Folder>
    </>
  );
};
