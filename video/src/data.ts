import {z} from "zod";

export const factSchema = z.object({
  emoji: z.string(),
  headline: z.string(),
  detail: z.string(),
  stat: z.string(),
  statLabel: z.string(),
});

export const factsSchema = z.object({
  kicker: z.string(),
  topic: z.string(),
  facts: z.array(factSchema).length(5),
  accent: z.string(),
  accent2: z.string(),
  handle: z.string(),
  audioSrc: z.string(),
  imageSrc: z.string().optional(),
});

export type Fact = z.infer<typeof factSchema>;
export type FactsProps = z.infer<typeof factsSchema>;

export const defaultProps: FactsProps = {
  kicker: "AMAZING FACTS",
  topic: "THE OCEAN",
  accent: "#4DD8FF",
  accent2: "#FFC94D",
  handle: "@yourchannel",
  audioSrc: "",
  imageSrc: "",
  facts: [
    {
      emoji: "\u{1F30A}",
      headline: "The ocean covers 71% of Earth",
      detail: "But we have mapped only a fraction of the seafloor in high detail.",
      stat: "71%",
      statLabel: "OF THE PLANET",
    },
    {
      emoji: "\u{1F4A7}",
      headline: "97% of Earth's water is in the sea",
      detail: "Only about 3% is fresh water, and most of that is locked in ice.",
      stat: "97%",
      statLabel: "OF ALL WATER",
    },
    {
      emoji: "\u{1F30B}",
      headline: "The deepest point is 11 km down",
      detail: "Mount Everest would fit inside the Mariana Trench with room to spare.",
      stat: "11 KM",
      statLabel: "DEEPEST POINT",
    },
    {
      emoji: "\u{1FAC1}",
      headline: "The ocean makes half our oxygen",
      detail: "Tiny drifting plankton produce oxygen with every breath you take.",
      stat: "50%",
      statLabel: "OF OUR OXYGEN",
    },
    {
      emoji: "\u{1F52D}",
      headline: "Most of the ocean is unexplored",
      detail: "More than 80% has never been seen by human eyes. The map is still blank.",
      stat: "80%",
      statLabel: "UNEXPLORED",
    },
  ],
};
