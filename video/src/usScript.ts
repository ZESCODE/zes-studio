export const ACCENT = "#FF3B5C";
export const ACCENT2 = "#F3C969";
export const FPS = 30;

export type USScene =
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
export const SCENES: USScene[] = [
  {
    kind: "splash",
    image: "scenes-us/us-splash.jpg",
    duration: 66,
    tagline: "TOP 5 AMERICAN FACTS",
  },
  {
    kind: "hook",
    image: "scenes-us/us-hook.jpg",
    audio: "audio-us/hook.mp3",
    duration: 216,
    kicker: "THINK YOU KNOW AMERICA?",
    top: "TOP 5",
    title: "USA FACTS",
  },
  {
    kind: "fact",
    image: "scenes-us/us-01.jpg",
    audio: "audio-us/fact1.mp3",
    duration: 332,
    index: 1,
    headline: "Alaska swallows three states",
    detail: "Texas, California and Montana would all fit inside it.",
    stat: "663K",
    statLabel: "SQUARE MILES",
  },
  {
    kind: "fact",
    image: "scenes-us/us-02.jpg",
    audio: "audio-us/fact2.mp3",
    duration: 374,
    index: 2,
    headline: "America has no official language",
    detail: "Not English. Not Spanish. It is not in federal law.",
    stat: "0",
    statLabel: "OFFICIAL LANGUAGES",
  },
  {
    kind: "fact",
    image: "scenes-us/us-03.jpg",
    audio: "audio-us/fact3.mp3",
    duration: 330,
    index: 3,
    headline: "Four states, one single point",
    detail: "At Four Corners you can stand in four states at once.",
    stat: "4",
    statLabel: "STATES, ONE STEP",
  },
  {
    kind: "fact",
    image: "scenes-us/us-04.jpg",
    audio: "audio-us/fact4.mp3",
    duration: 327,
    index: 4,
    headline: "The Grand Canyon makes weather",
    detail: "It is so deep that storms form and die between its walls.",
    stat: "1 MILE",
    statLabel: "DEEP ENOUGH FOR STORMS",
  },
  {
    kind: "fact",
    image: "scenes-us/us-05.jpg",
    audio: "audio-us/fact5.mp3",
    duration: 336,
    index: 5,
    headline: "The largest library on Earth",
    detail: "The Library of Congress holds over 170 million items.",
    stat: "170M+",
    statLabel: "ITEMS ON SHELVES",
  },
  {
    kind: "outro",
    image: "scenes-us/us-outro.jpg",
    audio: "audio-us/outro.mp3",
    duration: 258,
    title: "Which fact shocked you?",
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
) as Array<{scene: Extract<USScene, {kind: "fact"}>; start: number}>;
