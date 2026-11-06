import React from "react";
import {Composition, staticFile} from "remotion";
import {loadFont} from "@remotion/fonts";
import {FactsVideo} from "./FactsVideo";
import {defaultProps, factsSchema} from "./data";
import {EarthFacts} from "./EarthFacts";
import {TOTAL_FRAMES as EARTH_FRAMES} from "./earthScript";
import {USFacts} from "./USFacts";
import {TOTAL_FRAMES as US_FRAMES} from "./usScript";

loadFont({
  family: "Anton",
  url: staticFile("fonts/Anton-Regular.ttf"),
  weight: "400",
});

loadFont({
  family: "Inter",
  url: staticFile("fonts/Inter.ttf"),
  weight: "100 900",
});

export const RemotionRoot: React.FC = () => {
  return (
    <>
    <Composition
      id="FactsVideo"
      component={FactsVideo}
      durationInFrames={1350}
      fps={30}
      width={1080}
      height={1920}
      schema={factsSchema}
      defaultProps={defaultProps}
    />
    <Composition
      id="EarthFacts"
      component={EarthFacts}
      durationInFrames={EARTH_FRAMES}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="USFacts"
      component={USFacts}
      durationInFrames={US_FRAMES}
      fps={30}
      width={1080}
      height={1920}
    />
    </>
  );
};
