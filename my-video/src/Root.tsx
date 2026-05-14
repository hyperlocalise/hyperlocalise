import "./index.css";
import "@fontsource/open-sans/400.css";
import "@fontsource/open-sans/500.css";
import "@fontsource/open-sans/600.css";
import "@fontsource/open-sans/700.css";
import "@fontsource/open-sans/800.css";
import { Composition } from "remotion";
import { HyperlocaliseLaunch, VIDEO_DURATION_IN_FRAMES } from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HyperlocaliseLaunch"
        component={HyperlocaliseLaunch}
        durationInFrames={VIDEO_DURATION_IN_FRAMES}
        fps={30}
        width={1080}
        height={700}
      />
    </>
  );
};
