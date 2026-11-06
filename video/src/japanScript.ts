export const ACCENT = "#C8102E";
export const ACCENT2 = "#E8B84B";
export const FPS = 30;

export type JapanScene =
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
export const SCENES: JapanScene[] = [
  {
    kind: "splash",
    image: "kinetic/jp-hook.jpg",
    duration: 66,
    tagline: "TOP 5 JAPAN FACTS",
  },
  {
    kind: "hook",
    image: "kinetic/jp-hook.jpg",
    audio: "audio-jp/hook.mp3",
    duration: 350,
    kicker: "THINK YOU KNOW JAPAN?",
    top: "TOP 5",
    title: "JAPAN FACTS",
  },
  {
    kind: "fact",
    image: "kinetic/jp-fact1.jpg",
    audio: "audio-jp/fact1.mp3",
    duration: 406,
    index: 1,
    headline: "Over seven thousand islands",
    detail: "7,136 islands by the new survey — decades of maps said 6,852.",
    stat: "7,136",
    statLabel: "ISLANDS, NOT 6,852",
  },
  {
    kind: "fact",
    image: "kinetic/jp-fact2.jpg",
    audio: "audio-jp/fact2.mp3",
    duration: 300,
    index: 2,
    headline: "The oldest monarchy on Earth",
    detail: "The same imperial family has ruled for over 2,600 years.",
    stat: "2,600+",
    statLabel: "YEARS, ONE FAMILY",
  },
  {
    kind: "fact",
    image: "kinetic/jp-fact3.jpg",
    audio: "audio-jp/fact3.mp3",
    duration: 319,
    index: 3,
    headline: "Trains late by fifty-four seconds",
    detail: "That's the average delay. It includes typhoons and earthquakes.",
    stat: "54s",
    statLabel: "AVERAGE DELAY",
  },
  {
    kind: "fact",
    image: "kinetic/jp-fact4.jpg",
    audio: "audio-jp/fact4.mp3",
    duration: 282,
    index: 4,
    headline: "Five million vending machines",
    detail: "One machine for roughly every twenty-three people in Japan.",
    stat: "5M+",
    statLabel: "VENDING MACHINES",
  },
  {
    kind: "fact",
    image: "kinetic/jp-fact5.jpg",
    audio: "audio-jp/fact5.mp3",
    duration: 301,
    index: 5,
    headline: "The rabbit island",
    detail: "Okunoshima is overrun by hundreds of wild rabbits.",
    stat: "900+",
    statLabel: "WILD RABBITS",
  },
  {
    kind: "outro",
    image: "kinetic/jp-fact5.jpg",
    audio: "audio-jp/outro.mp3",
    duration: 279,
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
) as Array<{scene: Extract<JapanScene, {kind: "fact"}>; start: number}>;
