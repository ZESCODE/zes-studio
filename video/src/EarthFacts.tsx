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
import {Audio} from "@remotion/media";
import {Globe} from "./components/Globe";
import {
  ACCENT,
  ACCENT2,
  EarthScene,
  FACT_SCENES,
  SCENES,
  SCENE_STARTS,
} from "./earthScript";

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)'/%3E%3C/svg%3E\")";

const SceneFade: React.FC<{
  duration: number;
  children: React.ReactNode;
}> = ({duration, children}) => {
  const frame = useCurrentFrame();
  const opacity = Math.min(
    interpolate(frame, [0, 7], [0, 1], {extrapolateRight: "clamp"}),
    interpolate(frame, [duration - 8, duration - 1], [1, 0], {
      extrapolateLeft: "clamp",
    }),
  );
  return <AbsoluteFill style={{opacity}}>{children}</AbsoluteFill>;
};

const ImageLayer: React.FC<{
  src: string;
  duration: number;
  pan: number;
  zoomOut?: boolean;
}> = ({src, duration, pan, zoomOut}) => {
  const frame = useCurrentFrame();
  const scale = zoomOut
    ? interpolate(frame, [0, duration], [1.24, 1.02], {easing: Easing.out(Easing.cubic)})
    : interpolate(frame, [0, duration], [1.08, 1.2]);
  const x = interpolate(frame, [0, duration], [-14 * pan, 14 * pan]);
  const y = interpolate(frame, [0, duration], [8, -8]);

  return (
    <AbsoluteFill style={{overflow: "hidden"}}>
      <Img
        src={staticFile(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          scale,
          translate: `${x}px ${y}px`,
          filter: "saturate(1.08) contrast(1.06) brightness(0.92)",
        }}
      />
    </AbsoluteFill>
  );
};

const SceneGrading: React.FC<{strong?: boolean}> = ({strong}) => (
  <>
    <AbsoluteFill
      style={{
        background: strong
          ? "linear-gradient(180deg, rgba(2,6,14,0.72) 0%, rgba(2,6,14,0.22) 26%, rgba(2,6,14,0.55) 62%, rgba(2,6,14,0.97) 100%)"
          : "linear-gradient(180deg, rgba(2,6,14,0.6) 0%, rgba(2,6,14,0.12) 28%, rgba(2,6,14,0.45) 60%, rgba(2,6,14,0.96) 100%)",
      }}
    />
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 80% at 50% 42%, transparent 30%, rgba(2,6,14,0.55) 100%)`,
      }}
    />
    <AbsoluteFill
      style={{
        background: `radial-gradient(60% 40% at 78% 18%, ${ACCENT}22 0%, transparent 70%)`,
        mixBlendMode: "screen",
      }}
    />
    <AbsoluteFill style={{opacity: 0.07, mixBlendMode: "overlay", backgroundImage: GRAIN}} />
  </>
);

const Kicker: React.FC<{text: string; color?: string; size?: number}> = ({
  text,
  color = ACCENT,
  size = 30,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 16,
      fontFamily: "Inter",
      fontWeight: 800,
      fontSize: size,
      letterSpacing: 8,
      color,
      textTransform: "uppercase",
    }}
  >
    <div style={{width: 46, height: 2, backgroundColor: color, boxShadow: `0 0 12px ${color}`}} />
    {text}
    <div style={{width: 46, height: 2, backgroundColor: color, boxShadow: `0 0 12px ${color}`}} />
  </div>
);

const HookScene: React.FC<{
  scene: Extract<EarthScene, {kind: "hook"}>;
  pan: number;
}> = ({scene, pan}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const logoIn = spring({frame: frame - 2, fps, config: {damping: 16, mass: 0.8}});
  const logoFloat = Math.sin(frame / 30) * 5;
  const kickerIn = spring({frame: frame - 4, fps, config: {damping: 20}});
  const topIn = spring({frame: frame - 10, fps, config: {damping: 18}});
  const titleIn = spring({frame: frame - 20, fps, config: {damping: 20}});
  const lineIn = interpolate(frame, [30, 48], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill>
      <ImageLayer src={scene.image} duration={scene.duration} pan={pan} zoomOut />
      <SceneGrading strong />

      <Globe
        size={760}
        accent={ACCENT}
        speed={0.16}
        style={{position: "absolute", right: -230, top: 120, opacity: 0.28}}
      />

      <div
        style={{
          position: "absolute",
          top: 150,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Img
          src={staticFile("brand/logo.png")}
          style={{
            width: 250,
            height: 250,
            opacity: logoIn,
            scale: interpolate(logoIn, [0, 1], [0.55, 1]),
            translate: `0 ${logoFloat}px`,
            filter: "drop-shadow(0 18px 50px rgba(0,0,0,0.55))",
          }}
        />
      </div>

      <AbsoluteFill style={{alignItems: "center", justifyContent: "center", padding: "0 70px"}}>
        <div style={{opacity: kickerIn, translate: `0 ${interpolate(kickerIn, [0, 1], [18, 0])}px`}}>
          <Kicker text={scene.kicker} size={26} />
        </div>

        <div
          style={{
            marginTop: 26,
            fontFamily: "Anton",
            fontSize: 250,
            lineHeight: 0.86,
            letterSpacing: 4,
            color: "transparent",
            WebkitTextStroke: `3px ${ACCENT}`,
            opacity: 0.5,
            scale: interpolate(topIn, [0, 1], [0.88, 1]),
          }}
        >
          {scene.top}
        </div>

        <div
          style={{
            marginTop: 6,
            fontFamily: "Anton",
            fontSize: 150,
            lineHeight: 0.98,
            letterSpacing: 3,
            textAlign: "center",
            backgroundImage: `linear-gradient(180deg, #ffffff 10%, ${ACCENT} 92%)`,
            WebkitBackgroundClip: "text",
            color: "transparent",
            textShadow: `0 0 90px ${ACCENT}44`,
            opacity: titleIn,
            scale: interpolate(titleIn, [0, 1], [0.84, 1]),
          }}
        >
          {scene.title}
        </div>

        <div
          style={{
            marginTop: 40,
            width: 300 * lineIn,
            height: 7,
            borderRadius: 99,
            background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT2})`,
            boxShadow: `0 0 30px ${ACCENT}aa`,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const FactScene: React.FC<{
  scene: Extract<EarthScene, {kind: "fact"}>;
  pan: number;
}> = ({scene, pan}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const enter = (delay: number) =>
    spring({frame: frame - delay, fps, config: {damping: 22, mass: 0.7}});

  const chip = enter(2);
  const headline = enter(8);
  const detail = enter(16);
  const stat = enter(24);

  return (
    <AbsoluteFill>
      <ImageLayer src={scene.image} duration={scene.duration} pan={pan} />
      <SceneGrading />

      <div
        style={{
          position: "absolute",
          top: 170,
          right: 30,
          fontFamily: "Anton",
          fontSize: 330,
          lineHeight: 1,
          color: "transparent",
          WebkitTextStroke: `2px ${ACCENT}44`,
          opacity: 0.9,
        }}
      >
        {String(scene.index).padStart(2, "0")}
      </div>

      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          padding: "0 74px 250px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            opacity: chip,
            translate: `0 ${interpolate(chip, [0, 1], [26, 0])}px`,
          }}
        >
          <div
            style={{
              padding: "12px 26px",
              borderRadius: 999,
              fontFamily: "Inter",
              fontWeight: 900,
              fontSize: 26,
              letterSpacing: 5,
              color: "#04121d",
              background: `linear-gradient(95deg, ${ACCENT}, #7dd3fc)`,
              boxShadow: `0 14px 40px ${ACCENT}55`,
            }}
          >
            FACT {String(scene.index).padStart(2, "0")}
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontWeight: 700,
              fontSize: 24,
              letterSpacing: 4,
              color: "rgba(224,244,255,0.6)",
              textTransform: "uppercase",
            }}
          >
            Earth · Top 5
          </div>
        </div>

        <div
          style={{
            marginTop: 26,
            fontFamily: "Anton",
            fontSize: 102,
            lineHeight: 1.02,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: "#f4fbff",
            textShadow: "0 12px 70px rgba(0,0,0,0.65)",
            opacity: headline,
            translate: `0 ${interpolate(headline, [0, 1], [46, 0])}px`,
          }}
        >
          {scene.headline}
        </div>

        <div
          style={{
            marginTop: 20,
            fontFamily: "Inter",
            fontWeight: 500,
            fontSize: 42,
            lineHeight: 1.38,
            color: "rgba(214,236,248,0.82)",
            opacity: detail,
            translate: `0 ${interpolate(detail, [0, 1], [30, 0])}px`,
          }}
        >
          {scene.detail}
        </div>

        <div
          style={{
            marginTop: 30,
            alignSelf: "flex-start",
            display: "flex",
            alignItems: "center",
            gap: 26,
            padding: "28px 36px",
            borderRadius: 26,
            background: "linear-gradient(100deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02))",
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 26px 80px rgba(0,0,0,0.4)",
            opacity: stat,
            translate: `0 ${interpolate(stat, [0, 1], [36, 0])}px`,
            scale: interpolate(stat, [0, 1], [0.95, 1]),
          }}
        >
          <div
            style={{
              width: 8,
              alignSelf: "stretch",
              borderRadius: 99,
              background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT2})`,
              boxShadow: `0 0 24px ${ACCENT}aa`,
            }}
          />
          <div
            style={{
              fontFamily: "Anton",
              fontSize: 90,
              lineHeight: 1,
              color: "#ffffff",
              textShadow: `0 0 44px ${ACCENT}66`,
            }}
          >
            {scene.stat}
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontWeight: 800,
              fontSize: 24,
              lineHeight: 1.3,
              letterSpacing: 4,
              color: "rgba(220,242,255,0.66)",
              textTransform: "uppercase",
              maxWidth: 300,
            }}
          >
            {scene.statLabel}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const BellIcon: React.FC<{size: number; color: string}> = ({size, color}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M6 9a6 6 0 1 1 12 0c0 4.2 1.4 6 2 6.7.3.4 0 .8-.5.8H4.5c-.5 0-.8-.4-.5-.8C4.6 15 6 13.2 6 9Z"
      stroke={color}
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M10 19.5a2 2 0 0 0 4 0" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const DownArrow: React.FC<{size: number; color: string; offset: number}> = ({
  size,
  color,
  offset,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    style={{translate: `0 ${offset}px`}}
  >
    <path d="M12 4v14M6 12l6 6 6-6" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const OutroScene: React.FC<{
  scene: Extract<EarthScene, {kind: "outro"}>;
  pan: number;
}> = ({scene, pan}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const titleIn = spring({frame: frame - 4, fps, config: {damping: 20}});
  const subIn = spring({frame: frame - 16, fps, config: {damping: 18}});
  const pillIn = spring({frame: frame - 28, fps, config: {damping: 15}});
  const pulse = 1 + Math.sin(frame / 11) * 0.02;
  const bob = Math.sin(frame / 12) * 9;

  return (
    <AbsoluteFill>
      <ImageLayer src={scene.image} duration={scene.duration} pan={pan} />
      <SceneGrading strong />

      <AbsoluteFill style={{alignItems: "center", justifyContent: "center", padding: "0 70px"}}>
        <div
          style={{
            fontFamily: "Inter",
            fontWeight: 800,
            fontSize: 28,
            letterSpacing: 9,
            color: ACCENT,
            opacity: interpolate(frame, [2, 16], [0, 1], {extrapolateRight: "clamp"}),
          }}
        >
          YOUR TURN
        </div>

        <div
          style={{
            marginTop: 22,
            fontFamily: "Anton",
            fontSize: 120,
            lineHeight: 1.04,
            textAlign: "center",
            textTransform: "uppercase",
            backgroundImage: `linear-gradient(180deg, #ffffff 12%, ${ACCENT} 100%)`,
            WebkitBackgroundClip: "text",
            color: "transparent",
            opacity: titleIn,
            scale: interpolate(titleIn, [0, 1], [0.85, 1]),
            textShadow: `0 0 80px ${ACCENT}33`,
          }}
        >
          {scene.title}
        </div>

        <div
          style={{
            marginTop: 26,
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontFamily: "Inter",
            fontWeight: 600,
            fontSize: 42,
            color: "rgba(214,236,248,0.82)",
            opacity: subIn,
          }}
        >
          {scene.sub}
          <DownArrow size={44} color={ACCENT2} offset={bob} />
        </div>

        <div
          style={{
            marginTop: 54,
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "24px 44px",
            borderRadius: 999,
            background: "#FF0033",
            boxShadow: "0 22px 70px rgba(255,0,51,0.45)",
            opacity: pillIn,
            translate: `0 ${interpolate(pillIn, [0, 1], [46, 0])}px`,
            scale: pillIn * pulse,
          }}
        >
          <BellIcon size={38} color="#ffffff" />
          <div
            style={{
              fontFamily: "Inter",
              fontWeight: 900,
              fontSize: 38,
              letterSpacing: 2,
              color: "#ffffff",
            }}
          >
            SUBSCRIBE
          </div>
        </div>

        <div
          style={{
            marginTop: 30,
            fontFamily: "Inter",
            fontWeight: 700,
            fontSize: 30,
            letterSpacing: 4,
            color: "rgba(232,248,255,0.72)",
            opacity: pillIn,
          }}
        >
          {scene.handle}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const HeaderProgress: React.FC = () => {
  const frame = useCurrentFrame();

  const current = FACT_SCENES.findIndex(
    ({scene, start}) => frame >= start && frame < start + scene.duration,
  );

  return (
    <div
      style={{
        position: "absolute",
        top: 78,
        left: 80,
        right: 80,
        display: "flex",
        alignItems: "center",
        gap: 14,
        zIndex: 50,
      }}
    >
      <div style={{display: "flex", gap: 9, flex: 1}}>
        {FACT_SCENES.map(({scene, start}, i) => {
          const fill = Math.min(1, Math.max(0, (frame - start) / scene.duration));
          return (
            <div
              key={i}
              style={{
                height: 7,
                flex: 1,
                borderRadius: 99,
                backgroundColor: "rgba(255,255,255,0.16)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${fill * 100}%`,
                  backgroundColor: ACCENT,
                  boxShadow: `0 0 14px ${ACCENT}`,
                  borderRadius: 99,
                }}
              />
            </div>
          );
        })}
      </div>
      <div
        style={{
          fontFamily: "Inter",
          fontWeight: 800,
          fontSize: 24,
          letterSpacing: 3,
          color: "rgba(233,248,255,0.8)",
          minWidth: 92,
          textAlign: "right",
        }}
      >
        {current >= 0 ? `${String(current + 1).padStart(2, "0")} / 05` : "TOP 5"}
      </div>
    </div>
  );
};

export const EarthFacts: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: "#02060e"}}>
      <Audio src={staticFile("audio/music.mp3")} volume={0.2} />

      {SCENES.map((scene, i) => (
        <Sequence
          key={i}
          from={SCENE_STARTS[i]}
          durationInFrames={scene.duration}
          name={`scene-${i + 1}-${scene.kind}`}
        >
          <SceneFade duration={scene.duration}>
            {scene.kind === "hook" ? (
              <HookScene scene={scene} pan={i % 2 === 0 ? 1 : -1} />
            ) : scene.kind === "fact" ? (
              <FactScene scene={scene} pan={i % 2 === 0 ? 1 : -1} />
            ) : (
              <OutroScene scene={scene} pan={i % 2 === 0 ? 1 : -1} />
            )}
          </SceneFade>
          <Audio src={staticFile(scene.audio)} volume={1} />
        </Sequence>
      ))}

      <HeaderProgress />

      <div
        style={{
          position: "absolute",
          bottom: 92,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: "Inter",
          fontWeight: 700,
          fontSize: 24,
          letterSpacing: 6,
          color: "rgba(220,242,255,0.34)",
          zIndex: 40,
        }}
      >
        5 FACTS DAILY
      </div>
    </AbsoluteFill>
  );
};
