export const ACCENT = "#C19A3D";
export const ACCENT2 = "#33518F";
export const FPS = 30;

export type EgyptScene =
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
export const SCENES: EgyptScene[] = [
  {
    kind: "splash",
    image: "kinetic/eg-hook.jpg",
    duration: 66,
    tagline: "TOP 5 EGYPT FACTS",
  },
  {
    kind: "hook",
    image: "kinetic/eg-hook.jpg",
    audio: "audio-eg/hook.mp3",
    duration: 469,
    kicker: "THINK YOU KNOW EGYPT?",
    top: "TOP 5",
    title: "EGYPT FACTS",
  },
  {
    kind: "fact",
    image: "kinetic/eg-fact1.jpg",
    audio: "audio-eg/fact1.mp3",
    duration: 399,
    index: 1,
    headline: "Cleopatra beats the moon",
    detail: "The pyramids were older to her than the Moon landing is to us.",
    stat: "2,500",
    statLabel: "YEARS BETWEEN CLEO + PYRAMIDS",
  },
  {
    kind: "fact",
    image: "kinetic/eg-fact2.jpg",
    audio: "audio-eg/fact2.mp3",
    duration: 404,
    index: 2,
    headline: "Tallest for 4,000 years",
    detail: "147 metres of stone held the record until medieval cathedrals.",
    stat: "3,871",
    statLabel: "YEARS #1",
  },
  {
    kind: "fact",
    image: "kinetic/eg-fact3.jpg",
    audio: "audio-eg/fact3.mp3",
    duration: 431,
    index: 3,
    headline: "Paid, not enslaved",
    detail: "Workers got bread, beer, and tombs beside their king. Slaves were a Greek myth.",
    stat: "0",
    statLabel: "SLAVES, SAY THE GRAVES",
  },
  {
    kind: "fact",
    image: "kinetic/eg-fact4.jpg",
    audio: "audio-eg/fact4.mp3",
    duration: 442,
    index: 4,
    headline: "One stone, three scripts",
    detail: "The Rosetta Stone repeated a decree in Greek, Demotic, and hieroglyphs.",
    stat: "3",
    statLabel: "SCRIPTS, ONE STONE",
  },
  {
    kind: "fact",
    image: "kinetic/eg-fact5.jpg",
    audio: "audio-eg/fact5.mp3",
    duration: 290,
    index: 5,
    headline: "Napoleon was innocent",
    detail: "The Sphinx lost its nose in 1378 — four centuries before he arrived.",
    stat: "1378",
    statLabel: "NOSE LOST",
  },
  {
    kind: "outro",
    image: "kinetic/eg-fact5.jpg",
    audio: "audio-eg/outro.mp3",
    duration: 368,
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
) as Array<{scene: Extract<EgyptScene, {kind: "fact"}>; start: number}>;
