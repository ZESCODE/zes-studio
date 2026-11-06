import {z} from "zod";

/**
 * KineticTypographySchema — maps the KineticTypograph JSON Schema 1:1.
 * Text is code-driven: cameras and text animations are described per scene,
 * validated here, and rendered by the KineticVideo composition.
 */

export const cameraSchema = z.object({
  type: z.enum(["static", "kenBurns", "parallax", "punchIn"]).default("kenBurns"),
  startScale: z.number().default(1),
  endScale: z.number().default(1.15),
  panDistance: z.number().default(0),
  shake: z.boolean().default(false),
  // shutterAngle hint (180 = default). Rendered frames are independent, so this
  // modulates a small speed-blur on moving cameras rather than true shutter blur.
  motionBlur: z.number().default(180),
});

export const textLayerSchema = z.object({
  text: z.string(),
  position: z
    .object({
      top: z.string().optional(),
      left: z.string().optional(),
      transform: z.string().optional(),
    })
    .optional(),
  style: z
    .object({
      fontFamily: z.string().default("Anton"),
      fontSize: z.number().default(90),
      color: z.string().default("#FFFFFF"),
      textShadow: z.string().default("0 8px 40px rgba(0,0,0,0.65)"),
      textureEffect: z.enum(["none", "goldLeaf", "distressed", "inkSplatter"]).default("none"),
    })
    .default({}),
  animation: z.object({
    type: z.enum([
      "springScale",
      "wordByWord",
      "typewriter",
      "maskReveal",
      "bounceIn",
      "springPop",
      "staggeredSlide",
    ]),
    startFrame: z.number().default(0),
    durationInFrames: z.number().default(30),
    springConfig: z
      .object({
        damping: z.number().default(12),
        stiffness: z.number().default(120),
        mass: z.number().default(1),
      })
      .optional(),
    easing: z.string().optional(),
  }),
});

export const sceneSchema = z.object({
  id: z.string(),
  startFrame: z.number(),
  durationInFrames: z.number(),
  // Remote http(s) URLs are pre-downloaded by the server; other values are
  // treated as staticFile() paths inside the video/public directory.
  backgroundImage: z.string(),
  camera: cameraSchema.default({}),
  textLayers: z.array(textLayerSchema),
  transitionOut: z
    .object({
      type: z.enum(["none", "fade", "inkWipe", "canvasTear"]).default("none"),
      durationInFrames: z.number().default(10),
    })
    .optional(),
});

export const kineticSchema = z.object({
  videoTitle: z.string(),
  fps: z.number().default(30),
  durationInFrames: z.number(),
  scenes: z.array(sceneSchema).min(1),
});

export type KineticProps = z.infer<typeof kineticSchema>;
export type KineticScene = z.infer<typeof sceneSchema>;
export type KineticTextLayer = z.infer<typeof textLayerSchema>;
export type KineticCamera = z.infer<typeof cameraSchema>;

/** Parse a bezier() easing string into [x1, y1, x2, y2]; falls back to [0.1,0.8,0.2,1]. */
export function parseEasing(easing?: string): [number, number, number, number] {
  const m = /bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(
    easing || "",
  );
  if (!m) return [0.1, 0.8, 0.2, 1];
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

/** Demo payload: renders standalone (no props) for local testing and Studio. */
export const kineticDefaultProps: KineticProps = {
  videoTitle: "Did Vikings Really Wear Horned Helmets?",
  fps: 30,
  durationInFrames: 1050,
  scenes: [
    {
      id: "hook",
      startFrame: 0,
      durationInFrames: 90,
      backgroundImage: "scenes/scene1.jpg",
      camera: {
        type: "punchIn",
        startScale: 1,
        endScale: 1.3,
        panDistance: 0,
        shake: true,
        motionBlur: 270,
      },
      textLayers: [
        {
          text: "BIGGEST HISTORY LIE?",
          position: {top: "50%", left: "5%"},
          style: {
            fontFamily: "Anton",
            fontSize: 110,
            color: "#FFD700",
            textShadow: "4px 4px 8px rgba(0,0,0,0.8)",
            textureEffect: "goldLeaf",
          },
          animation: {
            type: "staggeredSlide",
            startFrame: 0,
            durationInFrames: 45,
            springConfig: {damping: 12, stiffness: 120, mass: 0.8},
          },
        },
      ],
      transitionOut: {type: "inkWipe", durationInFrames: 15},
    },
    {
      id: "truth",
      startFrame: 90,
      durationInFrames: 150,
      backgroundImage: "scenes/scene2.jpg",
      camera: {
        type: "kenBurns",
        startScale: 1,
        endScale: 1.1,
        panDistance: 50,
        shake: false,
        motionBlur: 180,
      },
      textLayers: [
        {
          text: "THE REAL HELMET",
          position: {top: "15%", left: "50%", transform: "translateX(-50%)"},
          style: {
            fontFamily: "Inter",
            fontSize: 90,
            color: "#E0E0E0",
            textShadow: "0 8px 40px rgba(0,0,0,0.65)",
            textureEffect: "distressed",
          },
          animation: {
            type: "springScale",
            startFrame: 100,
            durationInFrames: 40,
            springConfig: {damping: 15, stiffness: 80, mass: 2},
          },
        },
      ],
      transitionOut: {type: "canvasTear", durationInFrames: 10},
    },
    {
      id: "proof",
      startFrame: 240,
      durationInFrames: 210,
      backgroundImage: "scenes/scene3.jpg",
      camera: {
        type: "parallax",
        startScale: 1.05,
        endScale: 1.18,
        panDistance: 30,
        shake: false,
        motionBlur: 180,
      },
      textLayers: [
        {
          text: "NO HORNS FOUND IN BURIALS",
          position: {top: "22%", left: "50%", transform: "translateX(-50%)"},
          style: {
            fontFamily: "Anton",
            fontSize: 80,
            color: "#FFFFFF",
            textureEffect: "inkSplatter",
          },
          animation: {
            type: "wordByWord",
            startFrame: 260,
            durationInFrames: 120,
          },
        },
        {
          text: "THE TRUTH: priests added horns in the 1870s",
          position: {top: "62%", left: "50%", transform: "translateX(-50%)"},
          style: {
            fontFamily: "Inter",
            fontSize: 44,
            color: "rgba(255,226,230,0.9)",
            textureEffect: "none",
          },
          animation: {
            type: "typewriter",
            startFrame: 340,
            durationInFrames: 90,
          },
        },
      ],
      transitionOut: {type: "fade", durationInFrames: 20},
    },
  ],
};
