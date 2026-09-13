import { memo, useMemo } from "react";
import * as THREE from "three";
import { ESTIBA, cotasDeEstiba } from "./medidas";

/**
 * El exhibidor de piso: una ESTIBA con la mercancía apilada encima.
 *
 * ## Qué es, y por qué costó dar con ello
 *
 * No es un mueble. Es una **tarima de madera** plantada en el pasillo con el
 * producto apilado arriba — el exhibidor más común de una promoción: llega el
 * camión, se baja la estiba entera y se planta. Por eso lo que se le alquila a
 * la marca es la POSICIÓN en el pasillo, no un herraje.
 *
 * Lo confirma el propio catálogo del sistema: la huella del tipo es
 * **1,20 × 0,80 m**, que es exactamente la medida de una estiba estándar, y el
 * alto de 1,40 es la tarima más la torre de mercancía. El dato estaba escrito
 * desde el principio y no se había leído.
 *
 * Antes fue una pirámide de cajones de cartón macizos —que además escondía el
 * producto adentro— y después un mueble impreso con bandejas y header. Ninguno
 * de los dos es esto.
 *
 * ## Las cotas son las de la tarima de verdad
 *
 * 144 mm de alto, tablas de 22 mm, travesaños de 100 mm entre la cubierta y el
 * piso. Ese hueco entre tabla y tabla, y el de los travesaños, es por donde
 * entra la uña del montacargas: es lo que hace que se lea «estiba» y no
 * «cajón de madera».
 */

export interface EstibaRealProps {
  w: number;
  d: number;
  h: number;
  statusColor?: string;
  ghost?: boolean;
}

export const EstibaReal = memo(function EstibaReal({
  w, d, h, statusColor, ghost = false,
}: EstibaRealProps) {
  const m = useMemo(() => {
    const comun = { transparent: ghost, opacity: ghost ? 0.42 : 1 };
    return {
      /** Madera de pino en bruto, que es de lo que está hecha una estiba. */
      madera: new THREE.MeshStandardMaterial({
        color: "#c9a468", metalness: 0, roughness: 0.88, ...comun,
      }),
      /** Los travesaños, un tono más oscuro: son el canto que se ve de perfil. */
      travesano: new THREE.MeshStandardMaterial({
        color: "#a8834a", metalness: 0, roughness: 0.9, ...comun,
      }),
      estado: new THREE.MeshStandardMaterial({
        color: statusColor ?? "#64748b", metalness: 0.1, roughness: 0.6, ...comun,
      }),
    };
  }, [ghost, statusColor]);

  const c = cotasDeEstiba(w, d, h);
  const yTravesano = ESTIBA.tabla;
  const altoDeTravesano = Math.max(0.04, c.cubierta - ESTIBA.tabla * 2);

  return (
    <group>
      {/* ── El piso: pocas tablas, a lo largo ─────────────────────────────*/}
      {c.zDePiso.map((z, i) => (
        <mesh key={i} position={[0, ESTIBA.tabla / 2, z]} castShadow receiveShadow material={m.madera}>
          <boxGeometry args={[w, ESTIBA.tabla, ESTIBA.anchoDeTabla]} />
        </mesh>
      ))}

      {/* ── Los travesaños ────────────────────────────────────────────────
          El hueco que dejan entre el piso y la cubierta es por donde entra la
          uña del montacargas. Sin ese hueco esto es un cajón de madera. */}
      {c.xDeTravesanos.map((x, i) => (
        <mesh
          key={i}
          position={[x, yTravesano + altoDeTravesano / 2, 0]}
          castShadow
          receiveShadow
          material={m.travesano}
        >
          <boxGeometry args={[ESTIBA.travesano.ancho, altoDeTravesano, d]} />
        </mesh>
      ))}

      {/* ── La cubierta: las tablas donde apoya la mercancía ──────────────*/}
      {c.zDeTablas.map((z, i) => (
        <mesh
          key={i}
          position={[0, c.cubierta - ESTIBA.tabla / 2, z]}
          castShadow
          receiveShadow
          material={m.madera}
        >
          <boxGeometry args={[w, ESTIBA.tabla, ESTIBA.anchoDeTabla]} />
        </mesh>
      ))}

      {/* La franja de estado, en el canto del travesaño del frente: es la
          única cara continua que tiene una estiba. */}
      <mesh
        position={[0, yTravesano + altoDeTravesano / 2, -(d / 2 + 0.006)]}
        material={m.estado}
      >
        <boxGeometry args={[w * 0.45, Math.min(0.03, altoDeTravesano * 0.5), 0.01]} />
      </mesh>
    </group>
  );
});
