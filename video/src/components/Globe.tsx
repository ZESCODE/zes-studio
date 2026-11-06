import React from "react";
import {useCurrentFrame} from "remotion";

type GlobeProps = {
  size?: number;
  accent: string;
  style?: React.CSSProperties;
  speed?: number;
};

const R = 300;
const CX = 320;
const CY = 320;

const MERIDIANS = new Array(9).fill(0).map((_, i) => (i * Math.PI) / 9);
const LATITUDES = [-60, -40, -20, 0, 20, 40, 60];

const LAND: Array<[number, number, number, number]> = [
  [210, 200, 90, 55],
  [300, 255, 60, 38],
  [190, 315, 46, 70],
  [255, 360, 40, 55],
  [390, 205, 70, 42],
  [420, 300, 52, 66],
  [345, 405, 46, 40],
  [470, 400, 34, 30],
];

export const Globe: React.FC<GlobeProps> = ({
  size = 720,
  accent,
  style,
  speed = 0.22,
}) => {
  const frame = useCurrentFrame();
  const phase = (frame * speed * Math.PI) / 180;
  const float = Math.sin(frame / 55) * 10;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 640 640"
      style={{
        ...style,
        translate: `0px ${float}px`,
        filter: "drop-shadow(0 0 60px rgba(77,216,255,0.18))",
      }}
    >
      <defs>
        <radialGradient id="globeFill" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#0e4463" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#072438" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#03101d" stopOpacity="0.95" />
        </radialGradient>
        <radialGradient id="globeRim" cx="50%" cy="50%" r="50%">
          <stop offset="82%" stopColor={accent} stopOpacity="0" />
          <stop offset="96%" stopColor={accent} stopOpacity="0.55" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <clipPath id="globeClip">
          <circle cx={CX} cy={CY} r={R} />
        </clipPath>
      </defs>

      <circle cx={CX} cy={CY} r={R} fill="url(#globeFill)" />
      <circle cx={CX} cy={CY} r={R} fill="url(#globeRim)" />

      <g clipPath="url(#globeClip)">
        {LAND.map(([x, y, rx, ry], i) => (
          <ellipse
            key={i}
            cx={x}
            cy={y}
            rx={rx}
            ry={ry}
            fill={accent}
            opacity={0.13 + (i % 3) * 0.03}
          />
        ))}

        {LATITUDES.map((lat) => {
          const rad = (lat * Math.PI) / 180;
          return (
            <ellipse
              key={lat}
              cx={CX}
              cy={CY + Math.sin(rad) * R}
              rx={Math.cos(rad) * R}
              ry={Math.cos(rad) * R * 0.16}
              fill="none"
              stroke={accent}
              strokeWidth={1}
              opacity={0.28}
            />
          );
        })}
      </g>

      {MERIDIANS.map((offset, i) => {
        const angle = phase + offset;
        const rx = Math.abs(Math.cos(angle)) * R;
        const opacity = 0.1 + Math.abs(Math.sin(angle)) * 0.34;
        return (
          <ellipse
            key={i}
            cx={CX}
            cy={CY}
            rx={Math.max(rx, 0.5)}
            ry={R}
            fill="none"
            stroke={accent}
            strokeWidth={1.4}
            opacity={opacity}
            clipPath="url(#globeClip)"
          />
        );
      })}

      <circle
        cx={CX}
        cy={CY}
        r={R}
        fill="none"
        stroke={accent}
        strokeWidth={2.5}
        opacity={0.55}
      />
      <circle
        cx={CX}
        cy={CY}
        r={R + 14}
        fill="none"
        stroke={accent}
        strokeWidth={1}
        opacity={0.2}
        strokeDasharray="3 12"
        transform={`rotate(${frame * 0.1} ${CX} ${CY})`}
      />

      {[0, 1, 2].map((i) => {
        const a = phase * 0.7 + (i * Math.PI * 2) / 3;
        const px = CX + Math.cos(a) * R * 0.78;
        const py = CY + Math.sin(a) * R * 0.42;
        return (
          <g key={i}>
            <circle cx={px} cy={py} r={13} fill={accent} opacity={0.12} />
            <circle cx={px} cy={py} r={4} fill="#eafcff" opacity={0.9} />
          </g>
        );
      })}
    </svg>
  );
};
