export const ACCENT = "#A855F7";
export const ACCENT2 = "#FF8FA3";
export const FPS = 30;

export type OctopusScene =
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
export const SCENES: OctopusScene[] = [
  {
    kind: "splash",
    image: "kinetic/oc-hook.jpg",
    duration: 66,
    tagline: "TOP 5 OCTOPUS FACTS",
  },
  {
    kind: "hook",
    image: "kinetic/oc-hook.jpg",
    audio: "audio-oc/hook.mp3",
    duration: 361,
    kicker: "THINK YOU KNOW OCTOPUSES?",
    top: "TOP 5",
    title: "OCTOPUS FACTS",
  },
  {
    kind: "fact",
    image: "kinetic/oc-fact1.jpg",
    audio: "audio-oc/fact1.mp3",
    duration: 346,
    index: 1,
    headline: "Three hearts, one quitter",
    detail: "Two pump blood to the gills, one to the body. When it swims, the main heart stops.",
    stat: "3",
    statLabel: "HEARTS",
  },
  {
    kind: "fact",
    image: "kinetic/oc-fact2.jpg",
    audio: "audio-oc/fact2.mp3",
    duration: 356,
    index: 2,
    headline: "DNA matches nothing on Earth",
    detail: "Hundreds of their genes appear nowhere else in nature. The closest thing to aliens we know.",
    stat: "0",
    statLabel: "MATCHES IN NATURE",
  },
  {
    kind: "fact",
    image: "kinetic/oc-fact3.jpg",
    audio: "audio-oc/fact3.mp3",
    duration: 370,
    index: 3,
    headline: "Nine brains",
    detail: "One in the head, one per arm. A detached arm can still solve problems.",
    stat: "9",
    statLabel: "BRAINS",
  },
  {
    kind: "fact",
    image: "kinetic/oc-fact4.jpg",
    audio: "audio-oc/fact4.mp3",
    duration: 322,
    index: 4,
    headline: "Blue blood",
    detail: "Copper instead of iron carries their oxygen — better in freezing, low-oxygen water.",
    stat: "CU",
    statLabel: "COPPER, NOT IRON",
  },
  {
    kind: "fact",
    image: "kinetic/oc-fact5.jpg",
    audio: "audio-oc/fact5.mp3",
    duration: 290,
    index: 5,
    headline: "If the beak fits",
    detail: "No bones at all — an octopus fits through any hole bigger than its beak.",
    stat: "0",
    statLabel: "BONES",
  },
  {
    kind: "outro",
    image: "kinetic/oc-fact2.jpg",
    audio: "audio-oc/outro.mp3",
    duration: 290,
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
) as Array<{scene: Extract<OctopusScene, {kind: "fact"}>; start: number}>;
