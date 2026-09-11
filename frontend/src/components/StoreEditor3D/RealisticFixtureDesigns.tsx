import React, { memo } from "react";
import * as THREE from "three";

/**
 * Reusable physically-plausible fixture primitives.
 *
 * Important: w/d/h are the OUTER dimensions supplied by the floor plan.
 * These components never mutate them; every structural element is derived
 * inside that envelope.
 */

type Props = { w: number; d: number; h: number; color?: string; ghost?: boolean };

const metal = (color = "#69717a", roughness = 0.34) => (
  <meshStandardMaterial color={color} metalness={0.72} roughness={roughness} />
);
const darkMetal = () => <meshStandardMaterial color="#30363b" metalness={0.82} roughness={0.28} />;
const glass = () => <meshPhysicalMaterial color="#dbe7ef" metalness={0.05} roughness={0.08} transmission={0.18} transparent opacity={0.28} />;
const neutral = () => <meshStandardMaterial color="#ece8df" metalness={0.04} roughness={0.58} />;

function Part({ position, size, material = metal() }: { position: [number, number, number]; size: [number, number, number]; material?: React.ReactNode }) {
  return <mesh position={position} material={material as THREE.Material}><boxGeometry args={size} /></mesh>;
}

/** Real supermarket gondola: uprights, perforated back, adjustable shelves, feet and price rails. */
export const RealisticGondola = memo(function RealisticGondola({ w, d, h, ghost }: Props) {
  const post = Math.max(0.026, Math.min(0.042, w * 0.035));
  const shelf = Math.max(0.018, Math.min(0.028, h * 0.014));
  const usableW = Math.max(0.1, w - post * 2);
  const rows = Math.max(3, Math.min(6, Math.floor((h - 0.34) / 0.28)));
  const levels = Array.from({ length: rows }, (_, i) => 0.16 + i * ((h - 0.42) / Math.max(rows - 1, 1)));
  const double = d >= 0.72;
  const op = ghost ? 0.42 : 1;
  return <group>
    <group scale={[1, 1, 1]}>
      <Part position={[-w / 2 + post / 2, h / 2, 0]} size={[post, h, post]} material={metal()} />
      <Part position={[ w / 2 - post / 2, h / 2, 0]} size={[post, h, post]} material={metal()} />
      <Part position={[0, 0.035, 0]} size={[w * 0.92, 0.07, d * 0.82]} material={darkMetal()} />
      <Part position={[0, h - 0.025, 0]} size={[w * 0.96, 0.05, d * 0.9]} material={metal()} />
      <Part position={[0, h * 0.52, 0]} size={[w * 0.92, h * 0.72, 0.018]} material={metal("#58616a", 0.42)} />
      {levels.map((y, i) => <React.Fragment key={i}>
        <Part position={[0, y, 0]} size={[usableW, shelf, Math.max(0.25, d * (double ? 0.86 : 0.82))]} material={neutral()} />
        <Part position={[0, y + 0.018, -Math.max(0.1, d / 2 - 0.035)]} size={[usableW, 0.035, 0.025]} material={darkMetal()} />
      </React.Fragment>)}
      {double && levels.map((y, i) => <Part key={`b${i}`} position={[0, y + 0.018, Math.max(0.1, d / 2 - 0.035)]} size={[usableW, 0.035, 0.025]} material={darkMetal()} />)}
      <Part position={[-w / 2 + 0.045, 0.085, -d / 2 + 0.03]} size={[0.09, 0.045, 0.12]} material={darkMetal()} />
      <Part position={[ w / 2 - 0.045, 0.085, -d / 2 + 0.03]} size={[0.09, 0.045, 0.12]} material={darkMetal()} />
    </group>
  </group>;
});

/** End-cap: a structurally independent promotional face attached to a gondola end. */
export const RealisticPunta = memo(function RealisticPunta({ w, d, h, ghost }: Props) {
  const baseH = Math.min(0.16, h * 0.09);
  const headerH = Math.min(0.30, h * 0.18);
  const bodyH = Math.max(0.25, h - baseH - headerH);
  const rows = Math.max(3, Math.min(5, Math.floor(bodyH / 0.34)));
  const op = ghost ? 0.42 : 1;
  return <group>
    <Part position={[0, baseH / 2, 0]} size={[w * 0.94, baseH, d * 0.96]} material={darkMetal()} />
    <Part position={[-w * 0.42, baseH + bodyH / 2, 0]} size={[0.035, bodyH, d * 0.82]} material={metal()} />
    <Part position={[ w * 0.42, baseH + bodyH / 2, 0]} size={[0.035, bodyH, d * 0.82]} material={metal()} />
    {Array.from({ length: rows }, (_, i) => {
      const y = baseH + 0.07 + i * ((bodyH - 0.12) / Math.max(rows - 1, 1));
      return <React.Fragment key={i}>
        <Part position={[0, y, 0]} size={[w * 0.84, 0.022, d * 0.78]} material={neutral()} />
        <Part position={[0, y + 0.018, -d * 0.39]} size={[w * 0.84, 0.035, 0.025]} material={darkMetal()} />
      </React.Fragment>;
    })}
    <Part position={[0, h - headerH / 2, 0]} size={[w * 0.94, headerH, d * 0.72]} material={metal("#4b5560", 0.4)} />
    <Part position={[0, h - 0.035, 0]} size={[w * 0.97, 0.05, d * 0.78]} material={darkMetal()} />
  </group>;
});

/** Robatope: robust promotional tower with a stable plinth and repeated display bands. */
export const RealisticRobatope = memo(function RealisticRobatope({ w, d, h, ghost }: Props) {
  const base = Math.min(0.14, h * 0.1);
  const rows = Math.max(3, Math.min(5, Math.floor((h - base - 0.08) / 0.32)));
  return <group>
    <Part position={[0, base / 2, 0]} size={[w * 0.98, base, d * 0.98]} material={darkMetal()} />
    <Part position={[-w * 0.40, h / 2, 0]} size={[0.028, h - base, d * 0.92]} material={metal()} />
    <Part position={[ w * 0.40, h / 2, 0]} size={[0.028, h - base, d * 0.92]} material={metal()} />
    {Array.from({ length: rows }, (_, i) => {
      const y = base + 0.08 + i * ((h - base - 0.14) / Math.max(rows - 1, 1));
      return <Part key={i} position={[0, y, 0]} size={[w * 0.90, 0.025, d * 0.86]} material={neutral()} />;
    })}
    <Part position={[0, h - 0.03, 0]} size={[w * 0.96, 0.06, d * 0.9]} material={darkMetal()} />
  </group>;
});

/** Ristra: slim perforated panel with genuinely vertical hanging rails/hooks. */
export const RealisticRistra = memo(function RealisticRistra({ w, d, h }: Props) {
  const post = Math.max(0.024, w * 0.07);
  const hooks = Math.max(3, Math.floor(h / 0.24));
  return <group>
    <Part position={[0, h / 2, 0]} size={[w * 0.78, h * 0.94, 0.028]} material={metal("#555e66", 0.38)} />
    <Part position={[-w * 0.40, h / 2, 0]} size={[post, h * 0.96, post]} material={darkMetal()} />
    <Part position={[ w * 0.40, h / 2, 0]} size={[post, h * 0.96, post]} material={darkMetal()} />
    {Array.from({ length: hooks }, (_, i) => {
      const y = 0.10 + i * ((h - 0.22) / Math.max(hooks - 1, 1));
      return <Part key={i} position={[0, y, -d * 0.22]} size={[w * 0.62, 0.018, d * 0.38]} material={darkMetal()} />;
    })}
    <Part position={[0, 0.035, 0]} size={[w * 0.95, 0.07, d * 0.82]} material={darkMetal()} />
  </group>;
});

/** Cross display: low multi-directional impulse rack, not a tall gondola. */
export const RealisticCross = memo(function RealisticCross({ w, d, h }: Props) {
  const levels = Math.max(3, Math.min(6, Math.floor(h / 0.30)));
  return <group>
    <Part position={[0, 0.06, 0]} size={[w * 0.82, 0.12, d * 0.82]} material={darkMetal()} />
    <Part position={[0, h / 2, 0]} size={[0.06, h - 0.10, 0.06]} material={metal()} />
    {Array.from({ length: levels }, (_, i) => {
      const y = 0.16 + i * ((h - 0.30) / Math.max(levels - 1, 1));
      return <React.Fragment key={i}>
        <Part position={[0, y, 0]} size={[w * 0.82, 0.028, d * 0.82]} material={neutral()} />
        <Part position={[0, y + 0.018, -d * 0.40]} size={[w * 0.84, 0.04, 0.025]} material={darkMetal()} />
      </React.Fragment>;
    })}
  </group>;
});

/** Metro: deliberately low, linear modular merchandising platform. */
export const RealisticMetro = memo(function RealisticMetro({ w, d, h }: Props) {
  const z = Math.max(0.05, h);
  return <group>
    <Part position={[0, z / 2, 0]} size={[w * 0.96, z, d * 0.94]} material={metal("#66707a", 0.44)} />
    <Part position={[0, z + 0.018, 0]} size={[w * 0.98, 0.035, d * 0.96]} material={darkMetal()} />
    <Part position={[-w * 0.46, z / 2, 0]} size={[0.028, z, d * 0.96]} material={darkMetal()} />
    <Part position={[ w * 0.46, z / 2, 0]} size={[0.028, z, d * 0.96]} material={darkMetal()} />
  </group>;
});

/** Mueble/vitrina: cabinet envelope, glass doors, profiles, shelves and handles. */
export const RealisticMueble = memo(function RealisticMueble({ w, d, h }: Props) {
  const base = Math.min(0.12, h * 0.07);
  const profile = Math.max(0.022, Math.min(0.035, w * 0.025));
  const shelves = Math.max(2, Math.min(5, Math.floor((h - base - 0.18) / 0.34)));
  return <group>
    <Part position={[0, base / 2, 0]} size={[w * 0.98, base, d * 0.98]} material={darkMetal()} />
    <Part position={[-w / 2 + profile / 2, h / 2, 0]} size={[profile, h - base, profile]} material={metal("#56616a", 0.28)} />
    <Part position={[ w / 2 - profile / 2, h / 2, 0]} size={[profile, h - base, profile]} material={metal("#56616a", 0.28)} />
    <Part position={[0, h - profile / 2, 0]} size={[w, profile, profile]} material={metal("#56616a", 0.28)} />
    <Part position={[0, (h - base) / 2 + base, -d / 2 + profile / 2]} size={[w - profile * 2, h - base - profile, profile]} material={glass()} />
    {Array.from({ length: shelves }, (_, i) => {
      const y = base + 0.16 + i * ((h - base - 0.26) / Math.max(shelves - 1, 1));
      return <Part key={i} position={[0, y, 0]} size={[w - profile * 2, 0.022, d - profile * 2]} material={neutral()} />;
    })}
    <Part position={[-w * 0.018, h * 0.53, -d / 2 - 0.018]} size={[0.018, h * 0.26, 0.018]} material={darkMetal()} />
    <Part position={[ w * 0.018, h * 0.53, -d / 2 - 0.018]} size={[0.018, h * 0.26, 0.018]} material={darkMetal()} />
  </group>;
});
