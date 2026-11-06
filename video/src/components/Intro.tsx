import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const Intro: React.FC<{
  kicker: string;
  topic: string;
  accent: string;
  accent2: string;
}> = ({kicker, topic, accent, accent2}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const fadeOut = interpolate(frame, [105, 120], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const labelIn = interpolate(frame, [4, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const topIn = spring({frame: frame - 8, fps, config: {damping: 18}});
  const topicIn = spring({frame: frame - 22, fps, config: {damping: 20}});
  const barIn = interpolate(frame, [34, 52], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill
      style={{alignItems: "center", justifyContent: "center", opacity: fadeOut}}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          opacity: labelIn,
          translate: `0px ${interpolate(labelIn, [0, 1], [16, 0])}px`,
        }}
      >
        <div
          style={{
            width: 54,
            height: 2,
            backgroundColor: accent,
            boxShadow: `0 0 12px ${accent}`,
          }}
        />
        <div
          style={{
            fontFamily: "Inter",
            fontWeight: 800,
            fontSize: 30,
            letterSpacing: 9,
            color: accent,
            textTransform: "uppercase",
          }}
        >
          {kicker}
        </div>
        <div
          style={{
            width: 54,
            height: 2,
            backgroundColor: accent,
            boxShadow: `0 0 12px ${accent}`,
          }}
        />
      </div>

      <div
        style={{
          marginTop: 18,
          fontFamily: "Anton",
          fontSize: 292,
          lineHeight: 0.9,
          letterSpacing: 2,
          color: "transparent",
          WebkitTextStroke: `3px ${accent}`,
          opacity: 0.35,
          scale: interpolate(topIn, [0, 1], [0.9, 1]),
        }}
      >
        TOP 5
      </div>

      <div
        style={{
          marginTop: -8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          scale: interpolate(topicIn, [0, 1], [0.86, 1]),
          opacity: topicIn,
        }}
      >
        <div
          style={{
            fontFamily: "Inter",
            fontWeight: 800,
            fontSize: 40,
            letterSpacing: 10,
            color: "rgba(226,246,255,0.72)",
            textTransform: "uppercase",
          }}
        >
          Amazing Facts About
        </div>
        <div
          style={{
            marginTop: 12,
            fontFamily: "Anton",
            fontSize: 148,
            lineHeight: 1,
            letterSpacing: 2,
            textTransform: "uppercase",
            backgroundImage: `linear-gradient(180deg, #ffffff 10%, ${accent} 95%)`,
            WebkitBackgroundClip: "text",
            color: "transparent",
            textShadow: `0 0 70px ${accent}55`,
            textAlign: "center",
            maxWidth: 980,
          }}
        >
          {topic}
        </div>
      </div>

      <div
        style={{
          marginTop: 46,
          width: 260 * barIn,
          height: 6,
          borderRadius: 99,
          background: `linear-gradient(90deg, ${accent}, ${accent2})`,
          boxShadow: `0 0 26px ${accent}aa`,
        }}
      />
    </AbsoluteFill>
  );
};
