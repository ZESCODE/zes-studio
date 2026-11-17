import React from "react";
import {interpolate, useCurrentFrame, useVideoConfig} from "remotion";

const INTRO_END = 132;
const OUTRO = 192;

export const ProgressBar: React.FC<{accent: string; total?: number}> = ({
  accent,
  total = 5,
}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();

  const count = Math.max(1, Math.round(total));
  const factsEnd = Math.max(INTRO_END + 1, durationInFrames - OUTRO);
  const span = (factsEnd - INTRO_END) / count;
  const active = Math.min(
    count - 1,
    Math.max(0, Math.floor((frame - INTRO_END) / span)),
  );
  const inFacts = frame > INTRO_END && frame < factsEnd;
  const progress = Math.min(1, frame / durationInFrames);

  return (
    <div
      style={{
        position: "absolute",
        top: 96,
        left: 84,
        right: 84,
        display: "flex",
        alignItems: "center",
        gap: 16,
        zIndex: 40,
        opacity: interpolate(frame, [0, 18], [0, 1], {
          extrapolateRight: "clamp",
        }),
      }}
    >
      <div style={{display: "flex", gap: 10, flex: 1}}>
        {Array.from({length: count}, (_, i) => {
          const start = INTRO_END + i * span;
          const fill = Math.min(1, Math.max(0, (frame - start) / span));
          return (
            <div
              key={i}
              style={{
                height: 8,
                flex: 1,
                borderRadius: 99,
                backgroundColor: "rgba(255,255,255,0.14)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${fill * 100}%`,
                  backgroundColor: accent,
                  boxShadow: `0 0 14px ${accent}`,
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
          fontSize: 26,
          letterSpacing: 3,
          color: "rgba(233,248,255,0.75) ",
          minWidth: 82,
          textAlign: "right",
        }}
      >
        {inFacts ? `${String(active + 1).padStart(2, "0")} / ${count}` : `TOP ${count}`}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: -26,
          height: 1,
          backgroundColor: "rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            height: 1,
            width: `${progress * 100}%`,
            backgroundColor: accent,
            opacity: 0.5,
          }}
        />
      </div>
    </div>
  );
};
