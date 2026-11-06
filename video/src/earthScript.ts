export const ACCENT = "#38BDF8";
export const ACCENT2 = "#FBBF24";
export const FPS = 30;

export type EarthScene =
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

// Scene durations match the generated narration (~52s) plus a short tail pad.
export const SCENES: EarthScene[] = [
  {
    kind: "hook",
    image: "scenes/scene1.jpg",
    audio: "audio/scene1.mp3",
    duration: 180,
    kicker: "THINK YOU KNOW YOUR PLANET?",
    top: "TOP 5",
    title: "EARTH FACTS",
  },
  {
    kind: "fact",
    image: "scenes/scene2.jpg",
    audio: "audio/scene2.mp3",
    duration: 260,
    index: 1,
    headline: "99% of life is underwater",
    detail: "We've only explored about 5% of the ocean.",
    stat: "99%",
    statLabel: "LIVING SPACE",
  },
  {
    kind: "fact",
    image: "scenes/scene3.jpg",
    audio: "audio/scene3.mp3",
    duration: 246,
    index: 2,
    headline: "Lightning is hotter than the Sun",
    detail: "A bolt can reach 30,000 K — 5× the Sun's surface.",
    stat: "30,000K",
    statLabel: "BOLT TEMPERATURE",
  },
  {
    kind: "fact",
    image: "scenes/scene4.jpg",
    audio: "audio/scene4.mp3",
    duration: 234,
    index: 3,
    headline: "Gravity isn't the same everywhere",
    detail: "Earth bulges at the equator, so you weigh less there.",
    stat: "0.5%",
    statLabel: "LIGHTER AT EQUATOR",
  },
  {
    kind: "fact",
    image: "scenes/scene5.jpg",
    audio: "audio/scene5.mp3",
    duration: 252,
    index: 4,
    headline: "A magnetic shield protects us",
    detail: "Without it, solar wind would strip our atmosphere.",
    stat: "SHIELD",
    statLabel: "INVISIBLE ARMOR",
  },
  {
    kind: "fact",
    image: "scenes/scene6.jpg",
    audio: "audio/scene6.mp3",
    duration: 285,
    index: 5,
    headline: "The Moon is leaving",
    detail: "It drifts away about 1.5 inches every year.",
    stat: "1.5 IN",
    statLabel: "PER YEAR",
  },
  {
    kind: "outro",
    image: "scenes/scene7.jpg",
    audio: "audio/scene7.mp3",
    duration: 160,
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
) as Array<{scene: Extract<EarthScene, {kind: "fact"}>; start: number}>;
