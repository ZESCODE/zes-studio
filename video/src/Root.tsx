import React from "react";
import {Composition, staticFile} from "remotion";
import {loadFont} from "@remotion/fonts";
import {FactsVideo} from "./FactsVideo";
import {defaultProps, factsSchema} from "./data";
import {EarthFacts} from "./EarthFacts";
import {TOTAL_FRAMES as EARTH_FRAMES} from "./earthScript";
import {USFacts} from "./USFacts";
import {TOTAL_FRAMES as US_FRAMES} from "./usScript";
import {RussiaFacts} from "./RussiaFacts";
import {TOTAL_FRAMES as RU_FRAMES} from "./russiaScript";
import {AustraliaFacts} from "./AustraliaFacts";
import {TOTAL_FRAMES as AU_FRAMES} from "./australiaScript";
import {OctopusFacts} from "./OctopusFacts";
import {TOTAL_FRAMES as OC_FRAMES} from "./octopusScript";
import {OceanFacts} from "./OceanFacts";
import {TOTAL_FRAMES as OC2_FRAMES} from "./oceanScript";
import {AmazonFacts} from "./AmazonFacts";
import {TOTAL_FRAMES as AM_FRAMES} from "./amazonScript";
import {KineticVideo} from "./KineticVideo";
import {kineticDefaultProps, kineticSchema} from "./kinetic";

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
    <Composition
      id="RussiaFacts"
      component={RussiaFacts}
      durationInFrames={RU_FRAMES}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="AustraliaFacts"
      component={AustraliaFacts}
      durationInFrames={AU_FRAMES}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="OctopusFacts"
      component={OctopusFacts}
      durationInFrames={OC_FRAMES}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="OceanFacts"
      component={OceanFacts}
      durationInFrames={OC2_FRAMES}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="AmazonFacts"
      component={AmazonFacts}
      durationInFrames={AM_FRAMES}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="KineticVideo"
      component={KineticVideo}
      schema={kineticSchema}
      defaultProps={kineticDefaultProps}
      durationInFrames={kineticDefaultProps.durationInFrames}
      fps={30}
      width={1080}
      height={1920}
      calculateMetadata={({props}) => ({
        durationInFrames: props.durationInFrames,
        fps: props.fps,
      })}
    />
    </>
  );
};
