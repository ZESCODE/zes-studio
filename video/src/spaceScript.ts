export const ACCENT = "#7C5CFF";
export const ACCENT2 = "#4DD8FF";
export const FPS = 30;

export type SpaceScene =
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
export const SCENES: SpaceScene[] = [
  {
    kind: "splash",
    image: "scenes-space/sp-splash.jpg",
    duration: 66,
    tagline: "TOP 5 SPACE FACTS",
  },
  {
    kind: "hook",
    image: "scenes-space/sp-hook.jpg",
    audio: "audio-space/hook.mp3",
    duration: 240,
    kicker: "THINK YOU KNOW SPACE?",
    top: "TOP 5",
    title: "SPACE FACTS",
  },
  {
    kind: "fact",
    image: "scenes-space/sp-01.jpg",
    audio: "audio-space/fact1.mp3",
    duration: 386,
    index: 1,
    headline: "Space is completely silent",
    detail: "There is no air in space to carry sound, so nothing can be heard.",
    stat: "0 dB",
    statLabel: "IN THE VOID",
  },
  {
    kind: "fact",
    image: "scenes-space/sp-02.jpg",
    audio: "audio-space/fact2.mp3",
    duration: 420,
    index: 2,
    headline: "Venus is hotter than Mercury",
    detail: "Its thick CO2 atmosphere traps heat at 465 degrees Celsius.",
    stat: "465 C",
    statLabel: "SURFACE HEAT",
  },
  {
    kind: "fact",
    image: "scenes-space/sp-03.jpg",
    audio: "audio-space/fact3.mp3",
    duration: 415,
    index: 3,
    headline: "A day on Venus outlasts its year",
    detail: "It spins once in 243 Earth days but orbits the Sun in 225.",
    stat: "243",
    statLabel: "DAYS PER SPIN",
  },
  {
    kind: "fact",
    image: "scenes-space/sp-04.jpg",
    audio: "audio-space/fact4.mp3",
    duration: 383,
    index: 4,
    headline: "Moon footprints last millions of years",
    detail: "With no wind or rain, the Apollo tracks are still up there.",
    stat: "1 M+",
    statLabel: "YEARS INTACT",
  },
  {
    kind: "fact",
    image: "scenes-space/sp-05.jpg",
    audio: "audio-space/fact5.mp3",
    duration: 354,
    index: 5,
    headline: "More stars than sand on Earth",
    detail: "The observable universe holds over 200 sextillion stars.",
    stat: "10^22",
    statLabel: "STARS OUT THERE",
  },
  {
    kind: "outro",
    image: "scenes-space/sp-outro.jpg",
    audio: "audio-space/outro.mp3",
    duration: 246,
    title: "Which fact broke your brain?",
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
) as Array<{scene: Extract<SpaceScene, {kind: "fact"}>; start: number}>;