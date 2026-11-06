import React from "react";
import {TopNFacts} from "./TopNFacts";
import {
  ACCENT,
  ACCENT2,
  FACT_SCENES,
  SCENES,
  SCENE_STARTS,
} from "./oceanScript";

export const OceanFacts: React.FC = () => (
  <TopNFacts
    scenes={SCENES}
    sceneStarts={SCENE_STARTS}
    factScenes={FACT_SCENES}
    accent={ACCENT}
    accent2={ACCENT2}
    chipLabel="OCEAN · Top 5"
    music="audio-ocean/music.mp3"
    musicVolume={0.12}
  />
);
