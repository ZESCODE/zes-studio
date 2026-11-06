import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {Globe} from "./Globe";

export const Outro: React.FC<{
  accent: string;
  accent2: string;
  handle: string;
}> = ({accent, accent2, handle}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const title = spring({frame: frame - 6, fps, config: {damping: 20}});
  const pill = spring({frame: frame - 22, fps, config: {damping: 16}});
  const arrow = Math.sin(frame / 12) * 8;

  return (
    <AbsoluteFill style={{alignItems: "center", justifyContent: "center"}}>
      <Globe
        size={1080}
        accent={accent}
        speed={0.3}
        style={{position: "absolute", bottom: -420, opacity: 0.28}}
      />

      <div
        style={{
          position: "absolute",
          top: 300,
          left: 90,
          right: 90,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "Inter",
            fontWeight: 800,
            fontSize: 30,
            letterSpacing: 9,
            color: accent,
            opacity: interpolate(frame, [4, 20], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          SO, WHAT DO YOU THINK?
        </div>

        <div
          style={{
            marginTop: 24,
            fontFamily: "Anton",
            fontSize: 126,
            lineHeight: 1.02,
            textTransform: "uppercase",
            backgroundImage: `linear-gradient(180deg, #ffffff 15%, ${accent} 100%)`,
            WebkitBackgroundClip: "text",
            color: "transparent",
            opacity: title,
            scale: interpolate(title, [0, 1], [0.85, 1]),
            textShadow: `0 0 80px ${accent}33`,
          }}
        >
          Which fact blew your mind?
        </div>

        <div
          style={{
            marginTop: 30,
            fontFamily: "Inter",
            fontWeight: 500,
            fontSize: 42,
            color: "rgba(214,236,248,0.72)",
            opacity: title,
          }}
        >
          Drop your favourite in the comments.
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 330,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 34,
          opacity: interpolate(pill, [0, 1], [0, 1]),
          translate: `0px ${interpolate(pill, [0, 1], [50, 0])}px`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: "26px 46px",
            borderRadius: 999,
            background: `linear-gradient(95deg, ${accent}, ${accent2})`,
            boxShadow: `0 22px 70px ${accent}55`,
          }}
        >
          <div
            style={{
              fontFamily: "Inter",
              fontWeight: 900,
              fontSize: 38,
              letterSpacing: 2,
              color: "#04121d",
            }}
          >
            FOLLOW FOR MORE
          </div>
          <div style={{fontSize: 40, translate: `${arrow}px 0px`}}>
            {"\u2192"}
          </div>
        </div>

        <div
          style={{
            fontFamily: "Inter",
            fontWeight: 700,
            fontSize: 34,
            letterSpacing: 3,
            color: "rgba(232,248,255,0.8)",
          }}
        >
          {handle}
        </div>
      </div>
    </AbsoluteFill>
  );
};
