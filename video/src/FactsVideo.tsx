import React from "react";
import {AbsoluteFill, Sequence} from "remotion";
import {Audio} from "@remotion/media";
import {ProgressBar} from "./components/ProgressBar";
import {TransitionSeries, linearTiming} from "@remotion/transitions";
import {fade} from "@remotion/transitions/fade";
import {Intro} from "./components/Intro";
import {FactCard} from "./components/FactCard";
import {Outro} from "./components/Outro";
import {Background} from "./components/Background";
import {Globe} from "./components/Globe";
import {FactsProps} from "./data";

const INTRO = 132;
const FACT = 222;
const OUTRO = 192;
const TRANSITION = 12;

export const FactsVideo: React.FC<FactsProps> = ({
  kicker,
  topic,
  facts,
  accent,
  accent2,
  handle,
  audioSrc,
  imageSrc,
}) => {
  return (
    <AbsoluteFill>
      <Background accent={accent} accent2={accent2} imageSrc={imageSrc} />

      <Globe
        size={1120}
        accent={accent}
        speed={0.16}
        style={{
          position: "absolute",
          left: -20,
          top: 470,
          opacity: 0.24,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(58% 42% at 50% 52%, rgba(3,6,15,0.72) 0%, rgba(3,6,15,0.25) 60%, transparent 100%)",
        }}
      />

      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={INTRO}>
          <Intro kicker={kicker} topic={topic} accent={accent} accent2={accent2} />
        </TransitionSeries.Sequence>

        {facts.map((fact, index) => (
          <React.Fragment key={index}>
            <TransitionSeries.Transition
              presentation={fade()}
              timing={linearTiming({durationInFrames: TRANSITION})}
            />
            <TransitionSeries.Sequence durationInFrames={FACT}>
              <FactCard
                fact={fact}
                index={index}
                accent={accent}
                accent2={accent2}
                durationInFrames={FACT}
              />
            </TransitionSeries.Sequence>
          </React.Fragment>
        ))}

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({durationInFrames: TRANSITION})}
        />
        <TransitionSeries.Sequence durationInFrames={OUTRO}>
          <Outro accent={accent} accent2={accent2} handle={handle} />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      <ProgressBar accent={accent} />

      {audioSrc ? (
        <Sequence from={0}>
          <Audio src={audioSrc} volume={0.55} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
