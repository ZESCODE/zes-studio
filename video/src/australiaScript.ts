export const ACCENT = "#0E8A48";
export const ACCENT2 = "#FFC72C";
export const FPS = 30;

export type AustraliaScene =
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
export const SCENES: AustraliaScene[] = [
  {
    kind: "splash",
    image: "kinetic/au-hook.jpg",
    duration: 66,
    tagline: "TOP 5 AUSTRALIAN FACTS",
  },
  {
    kind: "hook",
    image: "kinetic/au-hook.jpg",
    audio: "audio-au/hook.mp3",
    duration: 321,
    kicker: "THINK YOU KNOW AUSTRALIA?",
    top: "TOP 5",
    title: "AUSTRALIA FACTS",
  },
  {
    kind: "fact",
    image: "kinetic/au-fact1.jpg",
    audio: "audio-au/fact1.mp3",
    duration: 350,
    index: 1,
    headline: "Wider than the moon",
    detail: "4,000 km across against the moon's 3,475 km. A continent beat the moon.",
    stat: "4,000",
    statLabel: "KM WIDE",
  },
  {
    kind: "fact",
    image: "kinetic/au-fact2.jpg",
    audio: "audio-au/fact2.mp3",
    duration: 356,
    index: 2,
    headline: "More kangaroos than people",
    detail: "Around 50 million kangaroos against 26 million humans. Two to one.",
    stat: "50M",
    statLabel: "KANGAROOS",
  },
  {
    kind: "fact",
    image: "kinetic/au-fact3.jpg",
    audio: "audio-au/fact3.mp3",
    duration: 333,
    index: 3,
    headline: "Australia lost a war",
    detail: "To emus. In 1932 the army deployed with machine guns — and lost.",
    stat: "0-1",
    statLabel: "WAR RECORD VS BIRDS",
  },
  {
    kind: "fact",
    image: "kinetic/au-fact4.jpg",
    audio: "audio-au/fact4.mp3",
    duration: 321,
    index: 4,
    headline: "The reef you can see from space",
    detail: "The Great Barrier Reef: 2,300 km of living coral, visible from orbit.",
    stat: "2,300",
    statLabel: "KM OF LIVING CORAL",
  },
  {
    kind: "fact",
    image: "kinetic/au-fact5.jpg",
    audio: "audio-au/fact5.mp3",
    duration: 307,
    index: 5,
    headline: "Everyone hugs the coast",
    detail: "Nine in ten Australians live within 100 km of the beach.",
    stat: "9/10",
    statLabel: "LIVE NEAR THE COAST",
  },
  {
    kind: "outro",
    image: "kinetic/au-fact5.jpg",
    audio: "audio-au/outro.mp3",
    duration: 305,
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
) as Array<{scene: Extract<AustraliaScene, {kind: "fact"}>; start: number}>;
