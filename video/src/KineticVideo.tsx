import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {KineticProps, KineticScene, KineticTextLayer, parseEasing} from "./kinetic";

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** Deterministic pseudo-random in [0,1) — keeps renders frame-stable. */
function rnd(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/* ----------------------------- SVG texture filters ---------------------------- */

const TextureDefs: React.FC = () => (
  <svg width="0" height="0" style={{position: "absolute"}} aria-hidden>
    <defs>
      <filter id="kt-distress" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves={4} result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale={7} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="kt-ink" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves={3} result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale={4} xChannelSelector="R" yChannelSelector="G" />
        <feGaussianBlur stdDeviation="0.6" />
      </filter>
    </defs>
  </svg>
);

/* --------------------------------- camera ---------------------------------- */

const CameraBackground: React.FC<{scene: KineticScene; index: number}> = ({scene, index}) => {
  const frame = useCurrentFrame();
  const d = scene.durationInFrames;
  const cam = scene.camera;

  const easeIO = Easing.bezier(0.42, 0, 0.58, 1);
  let scale = cam.startScale;
  let x = 0;
  let y = 0;

  switch (cam.type) {
    case "static":
      scale = 1;
      break;
    case "punchIn":
      scale = interpolate(frame, [0, d * 0.35], [cam.startScale, cam.endScale], {
        easing: Easing.out(Easing.cubic),
        extrapolateRight: "clamp",
      });
      break;
    case "parallax":
      scale = interpolate(frame, [0, d], [cam.startScale, cam.endScale], {easing: easeIO});
      x = interpolate(frame, [0, d], [-cam.panDistance, cam.panDistance], {easing: easeIO});
      y = interpolate(frame, [0, d], [6, -6], {easing: easeIO});
      break;
    case "kenBurns":
    default:
      scale = interpolate(frame, [0, d], [cam.startScale, cam.endScale], {easing: easeIO});
      break;
  }

  const dir = index % 2 === 0 ? 1 : -1;
  if (cam.panDistance && cam.type !== "parallax") {
    x += interpolate(frame, [0, d], [-cam.panDistance, cam.panDistance], {easing: easeIO}) * dir;
  }

  if (cam.shake) {
    const decay = 1 - Math.min(1, frame / (d * 0.6));
    const amp = cam.type === "punchIn" ? 5 : 3;
    x += (Math.sin(frame * 0.9) * 0.65 + Math.sin(frame * 2.7 + 1.3) * 0.35) * amp * decay;
    y += (Math.sin(frame * 1.3 + 0.7) * 0.6 + Math.sin(frame * 3.1) * 0.4) * amp * 0.6 * decay;
  }

  // Frames are rendered independently, so true shutter accumulation is not
  // possible — approximate the motionBlur intent with a small speed blur.
  const moving = cam.type !== "static" && (cam.shake || cam.panDistance > 0);
  const blurPx = moving ? Math.max(0, Math.min(6, cam.motionBlur / 45 - 4)) : 0;

  return (
    <AbsoluteFill style={{overflow: "hidden"}}>
      <Img
        src={staticFile(scene.backgroundImage)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          scale,
          translate: `${x}px ${y}px`,
          filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(5,2,4,0.55) 0%, rgba(5,2,4,0.12) 34%, rgba(5,2,4,0.45) 68%, rgba(5,2,4,0.88) 100%)",
        }}
      />
      <AbsoluteFill style={{opacity: 0.06, mixBlendMode: "overlay", backgroundImage: GRAIN}} />
    </AbsoluteFill>
  );
};

/* ----------------------------------- text ----------------------------------- */

function textureStyle(layer: KineticTextLayer): React.CSSProperties {
  const s = layer.style;
  switch (s.textureEffect) {
    case "goldLeaf":
      return {
        backgroundImage:
          "linear-gradient(175deg, #fff6c9 0%, #ffd700 28%, #b8860b 52%, #ffd700 74%, #fff3b0 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        color: "transparent",
        filter: `drop-shadow(${s.textShadow})`,
      };
    case "distressed":
      return {filter: `url(#kt-distress) drop-shadow(${s.textShadow})`};
    case "inkSplatter":
      return {filter: `url(#kt-ink) drop-shadow(${s.textShadow})`};
    default:
      return {color: s.color, textShadow: s.textShadow};
  }
}

const AnimatedText: React.FC<{layer: KineticTextLayer}> = ({layer}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const a = layer.animation;
  const t = Math.max(0, frame - a.startFrame);
  const dur = Math.max(1, a.durationInFrames);
  const ease = Easing.bezier(...parseEasing(a.easing));
  const springCfg = a.springConfig ?? {damping: 12, stiffness: 120, mass: 1};

  const pos = layer.position ?? {};
  const base: React.CSSProperties = {
    position: "absolute",
    top: pos.top ?? "50%",
    left: pos.left ?? "5%",
    transform: pos.transform,
    maxWidth: "92%",
    fontFamily: layer.style.fontFamily,
    fontSize: layer.style.fontSize,
    lineHeight: 1.08,
    textAlign: "center",
    textTransform: "uppercase",
    ...textureStyle(layer),
  };

  const words = layer.text.split(" ");
  const done = (n: number) => Math.max(0, Math.min(1, t / n)); // 0→1 after n frames

  switch (a.type) {
    case "springScale": {
      const s = spring({frame: t, fps, config: springCfg});
      return (
        <div style={{...base, opacity: done(8), scale: interpolate(s, [0, 1], [0.55, 1])}}>
          {layer.text}
        </div>
      );
    }
    case "springPop": {
      const s = spring({
        frame: t,
        fps,
        config: {damping: 8, stiffness: 220, mass: springCfg.mass},
      });
      return (
        <div
          style={{
            ...base,
            opacity: done(6),
            scale: interpolate(s, [0, 1], [0.35, 1]),
            rotate: `${interpolate(s, [0, 1], [-6, 0])}deg`,
          }}
        >
          {layer.text}
        </div>
      );
    }
    case "bounceIn": {
      const p = interpolate(t, [0, dur], [0, 1], {easing: ease, extrapolateRight: "clamp"});
      return (
        <div
          style={{
            ...base,
            opacity: p,
            translate: `0 ${interpolate(p, [0, 1], [90, 0])}px`,
          }}
        >
          {layer.text}
        </div>
      );
    }
    case "staggeredSlide": {
      const stagger = Math.max(1, Math.round(dur / (words.length + 1)));
      return (
        <div style={base}>
          {words.map((w, i) => {
            const s = spring({frame: t - i * stagger, fps, config: springCfg});
            return (
              <span
                key={i}
                style={{
                  opacity: Math.min(1, s * 1.2),
                  display: "inline-block",
                  marginRight: "0.22em",
                  translate: `${interpolate(s, [0, 1], [-90, 0])}px ${interpolate(s, [0, 1], [30, 0])}px`,
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
      );
    }
    case "wordByWord": {
      const shown = Math.floor((t / dur) * words.length);
      return (
        <div style={base}>
          {words.map((w, i) => {
            const enter = Math.min(1, Math.max(0, (t - i * (dur / words.length)) / 10));
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  marginRight: "0.22em",
                  opacity: i <= shown ? enter : 0,
                  filter: i === shown ? `drop-shadow(0 0 26px ${layer.style.color})` : undefined,
                  translate: `0 ${interpolate(enter, [0, 1], [26, 0])}px`,
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
      );
    }
    case "typewriter": {
      const chars = Math.floor((t / dur) * layer.text.length);
      const typed = layer.text.slice(0, chars);
      const caret = t < dur ? (Math.floor(frame / 8) % 2 === 0 ? "▍" : " ") : "";
      return <div style={{...base, textAlign: "left", whiteSpace: "pre-wrap"}}>{typed}{caret}</div>;
    }
    case "maskReveal": {
      const p = interpolate(t, [0, dur], [0, 1], {easing: ease, extrapolateRight: "clamp"});
      return (
        <div
          style={{
            ...base,
            clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
            translate: `0 ${interpolate(p, [0, 1], [24, 0])}px`,
          }}
        >
          {layer.text}
        </div>
      );
    }
    default:
      return <div style={base}>{layer.text}</div>;
  }
};

/* -------------------------------- transitions -------------------------------- */

const SceneEntry: React.FC<{children: React.ReactNode}> = ({children}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 6], [0, 1], {extrapolateRight: "clamp"});
  return <AbsoluteFill style={{opacity}}>{children}</AbsoluteFill>;
};

const TransitionOut: React.FC<{scene: KineticScene}> = ({scene}) => {
  const frame = useCurrentFrame();
  const tr = scene.transitionOut;
  if (!tr || tr.type === "none" || tr.durationInFrames <= 0) return null;
  const from = scene.durationInFrames - tr.durationInFrames;
  if (frame < from) return null;
  const p = interpolate(frame, [from, scene.durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (tr.type === "fade") {
    return <AbsoluteFill style={{backgroundColor: "#000", opacity: p}} />;
  }

  if (tr.type === "inkWipe") {
    const r = p * 130;
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#07030a",
          maskImage: `radial-gradient(circle at 50% 105%, transparent ${r - 38}%, #000 ${r}%)`,
          WebkitMaskImage: `radial-gradient(circle at 50% 105%, transparent ${r - 38}%, #000 ${r}%)`,
        }}
      />
    );
  }

  // canvasTear — jagged diagonal sheet wipes across the frame
  const jag = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const y = (i / steps) * 100;
    const x = p * 118 - 10 + (rnd(i * 7 + scene.startFrame) - 0.5) * 5;
    jag.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }
  jag.push(`${(p * 118 + 12).toFixed(2)}% 100%`, `${(p * 118 - 22).toFixed(2)}% 0%`);
  return (
    <AbsoluteFill
      style={{backgroundColor: "#0b0410", clipPath: `polygon(${jag.join(", ")})`}}
    />
  );
};

/* -------------------------------- composition -------------------------------- */

export const KineticVideo: React.FC<KineticProps> = (props) => {
  return (
    <AbsoluteFill style={{backgroundColor: "#07030a"}}>
      <TextureDefs />
      {props.scenes.map((scene, i) => (
        <Sequence
          key={scene.id}
          from={scene.startFrame}
          durationInFrames={scene.durationInFrames}
          name={`kinetic-${scene.id}`}
        >
          <SceneEntry>
            <CameraBackground scene={scene} index={i} />
            {scene.textLayers.map((layer, li) => (
              <AnimatedText key={li} layer={layer} />
            ))}
          </SceneEntry>
          <TransitionOut scene={scene} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
