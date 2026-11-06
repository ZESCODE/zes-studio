import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {Fact} from "../data";

export const FactCard: React.FC<{
  fact: Fact;
  index: number;
  accent: string;
  accent2: string;
  durationInFrames: number;
}> = ({fact, index, accent, accent2, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const fadeOut = interpolate(
    frame,
    [durationInFrames - 14, durationInFrames - 2],
    [1, 0],
    {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
  );

  const enter = (delay: number) =>
    spring({frame: frame - delay, fps, config: {damping: 22, mass: 0.7}});

  const numberIn = interpolate(frame, [0, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const chip = enter(4);
  const headline = enter(10);
  const detail = enter(18);
  const stat = enter(26);

  const pulse = 1 + Math.sin(frame / 16) * 0.015;

  return (
    <AbsoluteFill
      style={{
        padding: "250px 78px 240px",
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 150,
          right: 34,
          fontFamily: "Anton",
          fontSize: 340,
          lineHeight: 1,
          color: "transparent",
          WebkitTextStroke: `2px ${accent}55`,
          opacity: numberIn * 0.9,
          translate: `${interpolate(numberIn, [0, 1], [40, 0])}px 0px`,
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          flex: 1,
          gap: 34,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 22,
            opacity: chip,
            translate: `0px ${interpolate(chip, [0, 1], [28, 0])}px`,
          }}
        >
          <div
            style={{
              width: 118,
              height: 118,
              borderRadius: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 62,
              background: `linear-gradient(150deg, ${accent}30, ${accent2}18)`,
              border: `1.5px solid ${accent}66`,
              boxShadow: `0 18px 60px ${accent}33`,
              scale: pulse,
            }}
          >
            {fact.emoji}
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontWeight: 800,
              fontSize: 30,
              letterSpacing: 8,
              color: accent,
              textTransform: "uppercase",
            }}
          >
            Fact {String(index + 1).padStart(2, "0")}
          </div>
        </div>

        <div
          style={{
            fontFamily: "Anton",
            fontSize: 104,
            lineHeight: 1.02,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: "#f2fbff",
            maxWidth: 900,
            textShadow: "0 10px 60px rgba(0,0,0,0.55)",
            opacity: headline,
            translate: `0px ${interpolate(headline, [0, 1], [46, 0])}px`,
          }}
        >
          {fact.headline}
        </div>

        <div
          style={{
            fontFamily: "Inter",
            fontWeight: 500,
            fontSize: 44,
            lineHeight: 1.4,
            color: "rgba(214,236,248,0.78)",
            maxWidth: 850,
            opacity: detail,
            translate: `0px ${interpolate(detail, [0, 1], [30, 0])}px`,
          }}
        >
          {fact.detail}
        </div>

        <div
          style={{
            marginTop: 20,
            display: "flex",
            alignItems: "center",
            gap: 30,
            padding: "34px 40px",
            borderRadius: 30,
            background:
              "linear-gradient(100deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 30px 90px rgba(0,0,0,0.35)",
            opacity: stat,
            translate: `0px ${interpolate(stat, [0, 1], [40, 0])}px`,
            scale: interpolate(stat, [0, 1], [0.94, 1]),
          }}
        >
          <div
            style={{
              width: 8,
              alignSelf: "stretch",
              borderRadius: 99,
              background: `linear-gradient(180deg, ${accent}, ${accent2})`,
              boxShadow: `0 0 24px ${accent}aa`,
            }}
          />
          <div
            style={{
              fontFamily: "Anton",
              fontSize: 108,
              lineHeight: 1,
              color: "#ffffff",
              textShadow: `0 0 40px ${accent}66`,
            }}
          >
            {fact.stat}
          </div>
          <div
            style={{
              fontFamily: "Inter",
              fontWeight: 800,
              fontSize: 26,
              lineHeight: 1.3,
              letterSpacing: 4,
              color: "rgba(220,242,255,0.66)",
              textTransform: "uppercase",
              maxWidth: 320,
            }}
          >
            {fact.statLabel}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
