import React from "react";
import {TopNFacts} from "./TopNFacts";
import {
  ACCENT,
  ACCENT2,
  FACT_SCENES,
  SCENES,
  SCENE_STARTS,
} from "./russiaScript";

export const RussiaFacts: React.FC = () => (
  <TopNFacts
    scenes={SCENES}
    sceneStarts={SCENE_STARTS}
    factScenes={FACT_SCENES}
    accent={ACCENT}
    accent2={ACCENT2}
    chipLabel="RUSSIA · Top 5"
    music="audio-us/music.mp3"
    musicVolume={0.12}
  />
);

