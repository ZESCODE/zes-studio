export const ACCENT = "#0E7490";
export const ACCENT2 = "#22D3EE";
export const FPS = 30;

export type OceanScene =
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
// Music: geography.mp3 (audio-ocean/music.mp3).
export const SCENES: OceanScene[] = [
  {
    kind: "splash",
    image: "kinetic/o-hook.jpg",
    duration: 66,
    tagline: "TOP 5 DEEP OCEAN FACTS",
  },
  {
    kind: "hook",
    image: "kinetic/o-hook.jpg",
    audio: "audio-ocean/hook.mp3",
    duration: 403,
    kicker: "THINK YOU KNOW THE OCEAN?",
    top: "TOP 5",
    title: "DEEP OCEAN FACTS",
  },
  {
    kind: "fact",
    image: "kinetic/o-fact1.jpg",
    audio: "audio-ocean/fact1.mp3",
    duration: 305,
    index: 1,
    headline: "Mars is mapped better",
    detail: "Mars and the moon are mapped in detail. Only a quarter of the seafloor is.",
    stat: "25%",
    statLabel: "OF THE SEAFLOOR MAPPED",
  },
  {
    kind: "fact",
    image: "kinetic/o-fact2.jpg",
    audio: "audio-ocean/fact2.mp3",
    duration: 374,
    index: 2,
    headline: "The deepest place on Earth",
    detail: "The Mariana Trench. Everest inside it, 2 km of water still on top.",
    stat: "10,935",
    statLabel: "M DOWN, CHALLENGER DEEP",
  },
  {
    kind: "fact",
    image: "kinetic/o-fact3.jpg",
    audio: "audio-ocean/fact3.mp3",
    duration: 358,
    index: 3,
    headline: "Crushing pressure",
    detail: "Over 1,000 atmospheres. Eight tons per square inch. It crushes like a can.",
    stat: "1,100",
    statLabel: "ATMOSPHERES",
  },
  {
    kind: "fact",
    image: "kinetic/o-fact4.jpg",
    audio: "audio-ocean/fact4.mp3",
    duration: 354,
    index: 4,
    headline: "Life with no sunlight",
    detail: "Giant tube worms live off volcanic chemicals near vents the size of a person.",
    stat: "0",
    statLabel: "SUNLIGHT NEEDED",
  },
  {
    kind: "fact",
    image: "kinetic/o-fact5.jpg",
    audio: "audio-ocean/fact5.mp3",
    duration: 301,
    index: 5,
    headline: "Most of them glow",
    detail: "Three quarters of deep-sea animals make their own light to hunt and mate.",
    stat: "75%",
    statLabel: "GLOW IN THE DARK",
  },
  {
    kind: "outro",
    image: "kinetic/o-fact5.jpg",
    audio: "audio-ocean/outro.mp3",
    duration: 300,
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
) as Array<{scene: Extract<OceanScene, {kind: "fact"}>; start: number}>;
