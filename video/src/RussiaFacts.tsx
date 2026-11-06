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
import {
  ACCENT,
  ACCENT2,
  FACT_SCENES,
  SCENES,
  SCENE_STARTS,
  RussiaScene,
} from "./russiaScript";

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
  dark?: boolean;
}> = ({src, duration, pan, zoomOut, dark}) => {
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
          filter: dark
            ? "saturate(1.1) contrast(1.1) brightness(0.5)"
            : "saturate(1.1) contrast(1.06) brightness(0.92)",
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
          ? "linear-gradient(180deg, rgba(10,2,6,0.78) 0%, rgba(10,2,6,0.25) 26%, rgba(10,2,6,0.6) 62%, rgba(10,2,6,0.97) 100%)"
          : "linear-gradient(180deg, rgba(10,2,6,0.62) 0%, rgba(10,2,6,0.14) 28%, rgba(10,2,6,0.48) 60%, rgba(10,2,6,0.96) 100%)",
      }}
    />
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 80% at 50% 42%, transparent 30%, rgba(10,2,6,0.6) 100%)`,
      }}
    />
    <AbsoluteFill
      style={{
        background: `radial-gradient(60% 40% at 78% 18%, ${ACCENT}26 0%, transparent 70%)`,
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

const SplashScene: React.FC<{
  scene: Extract<RussiaScene, {kind: "splash"}>;
}> = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const logoIn = spring({frame: frame - 4, fps, config: {damping: 15, mass: 0.9}});
  const tagIn = spring({frame: frame - 20, fps, config: {damping: 22}});
  const float = Math.sin(frame / 24) * 6;
  const ring1 = interpolate(frame, [8, 46], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const ring2 = interpolate(frame, [16, 58], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const glow = 0.5 + Math.sin(frame / 12) * 0.12;

  return (
    <AbsoluteFill>
      <ImageLayer src={scene.image} duration={scene.duration} pan={1} zoomOut dark />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(70% 55% at 50% 46%, rgba(10,2,6,0.15) 0%, rgba(6,1,4,0.92) 100%)",
        }}
      />
      <AbsoluteFill style={{opacity: 0.06, mixBlendMode: "overlay", backgroundImage: GRAIN}} />

      <AbsoluteFill style={{alignItems: "center", justifyContent: "center"}}>
        <div
          style={{
            position: "absolute",
            width: 760,
            height: 760,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${ACCENT}55 0%, transparent 68%)`,
            opacity: glow * logoIn,
            scale: 1.35,
            filter: "blur(10px)",
          }}
        />
        {[ring1, ring2].map((r, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 520 + r * 420,
              height: 520 + r * 420,
              borderRadius: "50%",
              border: `2px solid ${i === 0 ? ACCENT : ACCENT2}`,
              opacity: (1 - r) * 0.4,
            }}
          />
        ))}

        <Img
          src={staticFile("brand/logo.png")}
          style={{
            width: 760,
            height: 760,
            opacity: logoIn,
            scale: interpolate(logoIn, [0, 1], [0.5, 1]),
            translate: `0 ${float}px`,
            filter: `drop-shadow(0 30px 90px rgba(0,0,0,0.7)) drop-shadow(0 0 60px ${ACCENT}55)`,
          }}
        />

        <div
          style={{
            position: "absolute",
            bottom: 470,
            fontFamily: "Inter",
            fontWeight: 800,
            fontSize: 30,
            letterSpacing: 12,
            color: ACCENT2,
            opacity: tagIn,
            translate: `0 ${interpolate(tagIn, [0, 1], [20, 0])}px`,
          }}
        >
          {scene.tagline}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const HookScene: React.FC<{
  scene: Extract<RussiaScene, {kind: "hook"}>;
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
  scene: Extract<RussiaScene, {kind: "fact"}>;
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

      <AbsoluteFill style={{justifyContent: "flex-end", padding: "0 74px 250px"}}>
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
              color: "#04101f",
              background: `linear-gradient(95deg, ${ACCENT2}, #ffe9a8)`,
              boxShadow: `0 14px 40px ${ACCENT}66, 0 0 ${(20 + Math.sin(frame / 11) * 8).toFixed(0)}px ${ACCENT}88`,
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
              color: "rgba(255,235,238,0.6)",
              textTransform: "uppercase",
            }}
          >
            RUSSIA · Top 5
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
            textWrap: "balance",
            color: "#fff6f7",
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
            textWrap: "balance",
            color: "rgba(255,226,230,0.82)",
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
              color: "rgba(255,226,230,0.66)",
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

const OutroScene: React.FC<{
  scene: Extract<RussiaScene, {kind: "outro"}>;
  pan: number;
}> = ({scene, pan}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const logoIn = spring({frame: frame - 2, fps, config: {damping: 16, mass: 0.9}});
  const kickerIn = interpolate(frame, [18, 32], [0, 1], {extrapolateRight: "clamp"});
  const titleIn = spring({frame: frame - 22, fps, config: {damping: 20}});
  const subIn = spring({frame: frame - 32, fps, config: {damping: 18}});
  const pillIn = spring({frame: frame - 42, fps, config: {damping: 15}});
  const pulse = 1 + Math.sin(frame / 11) * 0.02;
  const bob = Math.sin(frame / 12) * 9;
  const float = Math.sin(frame / 26) * 5;

  return (
    <AbsoluteFill>
      <ImageLayer src={scene.image} duration={scene.duration} pan={pan} zoomOut dark />
      <SceneGrading strong />

      <AbsoluteFill style={{alignItems: "center", justifyContent: "center", padding: "0 70px"}}>
        <div
          style={{
            position: "absolute",
            top: 250,
            width: 700,
            height: 700,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${ACCENT}44 0%, transparent 68%)`,
            opacity: logoIn,
            filter: "blur(8px)",
          }}
        />
        <Img
          src={staticFile("brand/logo.png")}
          style={{
            position: "absolute",
            top: 300,
            width: 600,
            height: 600,
            opacity: logoIn,
            scale: interpolate(logoIn, [0, 1], [0.6, 1]),
            translate: `0 ${float}px`,
            filter: `drop-shadow(0 24px 70px rgba(0,0,0,0.65)) drop-shadow(0 0 50px ${ACCENT}44)`,
          }}
        />

        <div
          style={{
            position: "absolute",
            top: 900,
            fontFamily: "Inter",
            fontWeight: 800,
            fontSize: 28,
            letterSpacing: 9,
            color: ACCENT2,
            opacity: kickerIn,
          }}
        >
          5 FACTS DAILY
        </div>

        <div
          style={{
            position: "absolute",
            top: 960,
            width: "100%",
            textAlign: "center",
            fontFamily: "Anton",
            fontSize: 110,
            lineHeight: 1.04,
            textTransform: "uppercase",
            textWrap: "balance",
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
            position: "absolute",
            top: 1260,
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontFamily: "Inter",
            fontWeight: 600,
            fontSize: 42,
            color: "rgba(255,232,235,0.82)",
            opacity: subIn,
          }}
        >
          {scene.sub}
          <svg
            width={44}
            height={44}
            viewBox="0 0 24 24"
            fill="none"
            style={{translate: `0 ${bob}px`}}
          >
            <path
              d="M12 4v14M6 12l6 6 6-6"
              stroke={ACCENT2}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div
          style={{
            position: "absolute",
            top: 1380,
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
            position: "absolute",
            top: 1540,
            fontFamily: "Inter",
            fontWeight: 700,
            fontSize: 30,
            letterSpacing: 4,
            color: "rgba(255,236,238,0.72)",
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
  const hookStart = SCENE_STARTS[1];

  const current = FACT_SCENES.findIndex(
    ({scene, start}) => frame >= start && frame < start + scene.duration,
  );

  if (frame < hookStart) return null;

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
          color: "rgba(255,236,238,0.8)",
          minWidth: 92,
          textAlign: "right",
        }}
      >
        {current >= 0 ? `${String(current + 1).padStart(2, "0")} / 05` : "TOP 5"}
      </div>
    </div>
  );
};

const Footer: React.FC = () => {
  const frame = useCurrentFrame();
  const hookStart = SCENE_STARTS[1];
  const outroStart = SCENE_STARTS[SCENE_STARTS.length - 1];
  if (frame < hookStart || frame >= outroStart) return null;
  const sheen = 0.55 + Math.sin(frame / 18) * 0.15;
  return (
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
        color: "rgba(255,236,238,0.34)",
        zIndex: 40,
      }}
    >
      <div
        style={{
          width: 190,
          height: 5,
          margin: "0 auto 18px",
          borderRadius: 99,
          background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT2})`,
          opacity: sheen,
          boxShadow: `0 0 22px ${ACCENT}aa`,
        }}
      />
      5 FACTS DAILY
    </div>
  );
};

export const RussiaFacts: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: "#0a0206"}}>
      <Audio src={staticFile("audio-us/music.mp3")} volume={0.2} />

      {SCENES.map((scene, i) => (
        <Sequence
          key={i}
          from={SCENE_STARTS[i]}
          durationInFrames={scene.duration}
          name={`us-scene-${i}-${scene.kind}`}
        >
          <SceneFade duration={scene.duration}>
            {scene.kind === "splash" ? (
              <SplashScene scene={scene} />
            ) : scene.kind === "hook" ? (
              <HookScene scene={scene} pan={i % 2 === 0 ? 1 : -1} />
            ) : scene.kind === "fact" ? (
              <FactScene scene={scene} pan={i % 2 === 0 ? 1 : -1} />
            ) : (
              <OutroScene scene={scene} pan={i % 2 === 0 ? 1 : -1} />
            )}
          </SceneFade>
          {scene.kind !== "splash" ? <Audio src={staticFile(scene.audio)} volume={1} /> : null}
        </Sequence>
      ))}

      <HeaderProgress />
      <Footer />
    </AbsoluteFill>
  );
};
