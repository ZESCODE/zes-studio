export const ACCENT = "#0F9D58";
export const ACCENT2 = "#FDD835";
export const FPS = 30;

export type BrazilScene =
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
export const SCENES: BrazilScene[] = [
  {
    kind: "splash",
    image: "kinetic/br-hook.jpg",
    duration: 66,
    tagline: "TOP 5 BRAZIL FACTS",
  },
  {
    kind: "hook",
    image: "kinetic/br-hook.jpg",
    audio: "audio-br/hook.mp3",
    duration: 404,
    kicker: "THINK YOU KNOW BRAZIL?",
    top: "TOP 5",
    title: "BRAZIL FACTS",
  },
  {
    kind: "fact",
    image: "kinetic/br-fact1.jpg",
    audio: "audio-br/fact1.mp3",
    duration: 304,
    index: 1,
    headline: "Bigger than the US",
    detail: "Brazil beats the entire contiguous United States by 400,000 km².",
    stat: "8.5M",
    statLabel: "KM² VS AMERICA'S 8.1M",
  },
  {
    kind: "fact",
    image: "kinetic/br-fact2.jpg",
    audio: "audio-br/fact2.mp3",
    duration: 364,
    index: 2,
    headline: "The town of twins",
    detail: "Cândido Godói's twinning rate is so high that scientists moved in to study it.",
    stat: "100s",
    statLabel: "EXTRA TWINS PER YEAR",
  },
  {
    kind: "fact",
    image: "kinetic/br-fact3.jpg",
    audio: "audio-br/fact3.mp3",
    duration: 290,
    index: 3,
    headline: "Ten of twelve neighbours",
    detail: "Brazil borders every South American country except two.",
    stat: "10/12",
    statLabel: "SOUTH AMERICAN BORDERS",
  },
  {
    kind: "fact",
    image: "kinetic/br-fact4.jpg",
    audio: "audio-br/fact4.mp3",
    duration: 323,
    index: 4,
    headline: "One in five species",
    detail: "More kinds of plants and animals live in Brazil than anywhere else.",
    stat: "20%",
    statLabel: "OF KNOWN SPECIES",
  },
  {
    kind: "fact",
    image: "kinetic/br-fact5.jpg",
    audio: "audio-br/fact5.mp3",
    duration: 294,
    index: 5,
    headline: "Named after a tree",
    detail: "The brazilwood's red dye made it so valuable the tree nearly died out.",
    stat: "1",
    statLabel: "TREE, NAMED A COUNTRY",
  },
  {
    kind: "outro",
    image: "kinetic/br-fact4.jpg",
    audio: "audio-br/outro.mp3",
    duration: 338,
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
) as Array<{scene: Extract<BrazilScene, {kind: "fact"}>; start: number}>;
