export const ACCENT = "#1E5AA8";
export const ACCENT2 = "#F3C969";
export const FPS = 30;

export type RussiaScene =
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
export const SCENES: RussiaScene[] = [
  {
    kind: "splash",
    image: "kinetic/ru-hook.jpg",
    duration: 66,
    tagline: "TOP 5 RUSSIAN FACTS",
  },
  {
    kind: "hook",
    image: "kinetic/ru-fact1.jpg",
    audio: "audio-ru/hook.mp3",
    duration: 285,
    kicker: "THINK YOU KNOW RUSSIA?",
    top: "TOP 5",
    title: "RUSSIA FACTS",
  },
  {
    kind: "fact",
    image: "kinetic/ru-fact1.jpg",
    audio: "audio-ru/fact1.mp3",
    duration: 254,
    index: 1,
    headline: "Eleven time zones wide",
    detail: "Dinner on Monday, breakfast on Tuesday — same country.",
    stat: "11",
    statLabel: "TIME ZONES",
  },
  {
    kind: "fact",
    image: "kinetic/ru-fact2.jpg",
    audio: "audio-ru/fact2.mp3",
    duration: 368,
    index: 2,
    headline: "Wider than Pluto",
    detail: "17.1M km² against Pluto's 16.6M km². A country beat a planet.",
    stat: "17.1M",
    statLabel: "KM², BIGGER THAN A PLANET",
  },
  {
    kind: "fact",
    image: "kinetic/ru-fact3.jpg",
    audio: "audio-ru/fact3.mp3",
    duration: 318,
    index: 3,
    headline: "The deepest lake on Earth",
    detail: "Lake Baikal is 1,642 m deep and holds a fifth of Earth's fresh water.",
    stat: "1,642 M",
    statLabel: "DEEPEST LAKE",
  },
  {
    kind: "fact",
    image: "kinetic/ru-fact4.jpg",
    audio: "audio-ru/fact4.mp3",
    duration: 311,
    index: 4,
    headline: "The longest railway",
    detail: "The Trans-Siberian runs 9,289 km — 8 time zones, 7 days, one train.",
    stat: "9,289",
    statLabel: "KM END TO END",
  },
  {
    kind: "fact",
    image: "kinetic/ru-fact5.jpg",
    audio: "audio-ru/fact5.mp3",
    duration: 368,
    index: 5,
    headline: "The coldest inhabited city",
    detail: "Oymyakon hit minus 67.8 °C. Ink freezes; glasses stick to your face.",
    stat: "-67.8",
    statLabel: "DEGREES CELSIUS",
  },
  {
    kind: "outro",
    image: "kinetic/ru-fact5.jpg",
    audio: "audio-ru/outro.mp3",
    duration: 304,
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
) as Array<{scene: Extract<RussiaScene, {kind: "fact"}>; start: number}>;
