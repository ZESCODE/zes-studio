export const ACCENT = "#2E7D32";
export const ACCENT2 = "#F9A825";
export const FPS = 30;

export type AmazonScene =
  | {
      kind: "splash";
      image: string;
      duration: number;
      tagline: string;
    }
  | {
      kind: "hook";
      image: string;
      audio: string;
      duration: number;
      kicker: string;
      top: string;
      title: string;
    }
  | {
      kind: "fact";
      image: string;
      audio: string;
      duration: number;
      index: number;
      headline: string;
      detail: string;
      stat: string;
      statLabel: string;
    }
  | {
      kind: "outro";
      image: string;
      audio: string;
      duration: number;
      title: string;
      sub: string;
      handle: string;
    };

// Durations are narration length + a short breath pad, rounded to 30fps frames.
// Narration: ElevenLabs el/eleven_multilingual_v2/TX3LPaxmHKxFdv7VOQHJ via 9Router.
export const SCENES: AmazonScene[] = [
  {
    kind: "splash",
    image: "kinetic/am-hook.jpg",
    duration: 66,
    tagline: "TOP 5 AMAZON FACTS",
  },
  {
    kind: "hook",
    image: "kinetic/am-hook.jpg",
    audio: "audio-am/hook.mp3",
    duration: 375,
    kicker: "THINK YOU KNOW THE AMAZON?",
    top: "TOP 5",
    title: "AMAZON FACTS",
  },
  {
    kind: "fact",
    image: "kinetic/am-fact1.jpg",
    audio: "audio-am/fact1.mp3",
    duration: 352,
    index: 1,
    headline: "Six thousand kilometres, zero bridges",
    detail: "The river winds through the continent and there is not one bridge.",
    stat: "0",
    statLabel: "BRIDGES, 6,400 KM",
  },
  {
    kind: "fact",
    image: "kinetic/am-fact2.jpg",
    audio: "audio-am/fact2.mp3",
    duration: 314,
    index: 2,
    headline: "One in ten species",
    detail: "One in every ten known species on Earth lives in the Amazon.",
    stat: "10%",
    statLabel: "OF KNOWN SPECIES",
  },
  {
    kind: "fact",
    image: "kinetic/am-fact3.jpg",
    audio: "audio-am/fact3.mp3",
    duration: 325,
    index: 3,
    headline: "A fifth of all river water",
    detail: "Over 200,000 liters a second rush into the Atlantic — a fifth of Earth's total.",
    stat: "1/5",
    statLabel: "OF ALL RIVER WATER",
  },
  {
    kind: "fact",
    image: "kinetic/am-fact4.jpg",
    audio: "audio-am/fact4.mp3",
    duration: 336,
    index: 4,
    headline: "Tribes never contacted",
    detail: "More than 100 isolated groups still live hidden in the forest.",
    stat: "100+",
    statLabel: "UNCONTACTED TRIBES",
  },
  {
    kind: "fact",
    image: "kinetic/am-fact5.jpg",
    audio: "audio-am/fact5.mp3",
    duration: 348,
    index: 5,
    headline: "The forest makes its rain",
    detail: "A single big tree releases 1,000 liters of water a day. It flies its own weather.",
    stat: "1,000",
    statLabel: "LITERS PER TREE / DAY",
  },
  {
    kind: "outro",
    image: "kinetic/am-fact5.jpg",
    audio: "audio-am/outro.mp3",
    duration: 273,
    title: "Which fact sounded fake?",
    sub: "Comment below",
    handle: "@5factsdaily",
  },
];

export const TOTAL_FRAMES = SCENES.reduce((sum, s) => sum + s.duration, 0);

/** Absolute start frame for each scene. */
export const SCENE_STARTS = SCENES.reduce<number[]>((acc, scene, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + SCENES[i - 1].duration);
  return acc;
}, []);

export const FACT_SCENES = SCENES.map((scene, i) => ({scene, start: SCENE_STARTS[i]})).filter(
  (entry) => entry.scene.kind === "fact",
) as Array<{scene: Extract<AmazonScene, {kind: "fact"}>; start: number}>;
