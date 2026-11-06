import React from "react";
import {AbsoluteFill, Img, interpolate, useCurrentFrame} from "remotion";

const mulberry32 = (seed: number) => {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const random = mulberry32(7);
const STARS = new Array(130).fill(0).map(() => ({
  x: random() * 100,
  y: random() * 100,
  size: 1 + random() * 3,
  opacity: 0.15 + random() * 0.7,
  phase: random() * Math.PI * 2,
}));

export const Background: React.FC<{
  accent: string;
  accent2: string;
  imageSrc?: string;
}> = ({accent, accent2, imageSrc}) => {
  const frame = useCurrentFrame();

  const drift = Math.sin(frame / 90) * 60;
  const drift2 = Math.cos(frame / 110) * 80;
  const hasImage = Boolean(imageSrc && imageSrc.trim());

  return (
    <AbsoluteFill style={{backgroundColor: "#03060f", overflow: "hidden"}}>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(120% 80% at 50% 0%, #0a2440 0%, #061527 45%, #03060f 100%)",
        }}
      />

      {hasImage ? (
        <>
          <AbsoluteFill>
            <Img
              src={imageSrc as string}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                scale: interpolate(frame, [0, 1350], [1.06, 1.14]),
                filter: "saturate(1.05) contrast(1.05)",
              }}
            />
          </AbsoluteFill>
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, rgba(3,6,15,0.72) 0%, rgba(3,6,15,0.35) 34%, rgba(3,6,15,0.42) 66%, rgba(3,6,15,0.88) 100%)",
            }}
          />
          <AbsoluteFill
            style={{
              background: `radial-gradient(70% 50% at 50% 40%, ${accent}22 0%, transparent 70%)`,
              mixBlendMode: "screen",
            }}
          />
        </>
      ) : null}

      <AbsoluteFill
        style={{
          background: `radial-gradient(45% 35% at ${28 + drift / 20}% ${
            34 + drift2 / 30
          }%, ${accent}38 0%, transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(40% 30% at ${74 - drift / 25}% ${
            62 - drift2 / 40
          }%, ${accent2}22 0%, transparent 70%)`,
        }}
      />

      <svg
        width="1080"
        height="1920"
        viewBox="0 0 1080 1920"
        style={{position: "absolute", inset: 0}}
      >
        <defs>
          <pattern
            id="grid"
            width="90"
            height="90"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 90 0 L 0 0 0 90"
              fill="none"
              stroke="#7fdcff"
              strokeWidth="1"
              opacity="0.05"
            />
          </pattern>
          <radialGradient id="fade" cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="gridMask">
            <rect width="1080" height="1920" fill="url(#fade)" />
          </mask>
        </defs>
        <rect
          width="1080"
          height="1920"
          fill="url(#grid)"
          mask="url(#gridMask)"
        />
      </svg>

      {STARS.map((star, i) => {
        const twinkle = interpolate(
          Math.sin(frame / 26 + star.phase),
          [-1, 1],
          [0.35, 1],
        );
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              borderRadius: "50%",
              backgroundColor: "#dff6ff",
              opacity: star.opacity * twinkle,
              boxShadow: `0 0 ${star.size * 3}px #bfeaff`,
            }}
          />
        );
      })}

      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(3,6,15,0.65) 0%, transparent 22%, transparent 74%, rgba(3,6,15,0.9) 100%)",
        }}
      />

      <AbsoluteFill
        style={{
          opacity: 0.05,
          mixBlendMode: "overlay",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </AbsoluteFill>
  );
};
