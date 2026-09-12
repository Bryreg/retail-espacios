import { memo, useMemo } from "react";
import * as THREE from "three";
import { STAND_FRUTAS, bandejasDeStand } from "./medidas";

/**
 * El stand de frutas y verduras, contra la ficha del fabricante.
 *
 * ## Qué lo hacía no parecerse
 *
 * Era un **mesón macizo con un cajón poco profundo arriba**: la fruta se
 * volcaba sobre una tabla plana rodeada de costillas de madera. Eso no es un
 * exhibidor de frutas, es una mesa con cosas encima. La ficha del fabricante
 * da otra forma, y las tres piezas que la componen son de función, no de
 * adorno:
 *
 * 1. **Bandejas INCLINADAS.** La fruta suelta se mira desde arriba. Sobre un
 *    plano horizontal, la fila de adelante esconde todo lo que hay detrás.
 * 2. **ESCALONADAS.** Sin escalón, la bandeja de atrás queda tapada por la de
 *    adelante y el mueble pierde la mitad de su frente vendible — que es
 *    exactamente lo que se le está vendiendo al proveedor.
 * 3. **Con CAJONES.** La fruta no se vuelca sobre la madera: llega en cajón y
 *    se exhibe en el cajón. Es lo que hace que el mueble se lea como frutería.
 *
 * Y el riel porta-precios en el filo de cada escalón, que en una frutería es
 * donde va el precio por kilo.
 */

export interface StandFrutasRealProps {
  w: number;
  d: number;
  h: number;
  statusColor?: string;
  ghost?: boolean;
}

export const StandFrutasReal = memo(function StandFrutasReal({
  w, d, h, statusColor, ghost = false,
}: StandFrutasRealProps) {
  const m = useMemo(() => {
    const comun = { transparent: ghost, opacity: ghost ? 0.42 : 1 };
    return {
      /** La madera clara de las bandejas. */
      madera: new THREE.MeshStandardMaterial({
        color: "#c8a465", metalness: 0, roughness: 0.78, ...comun,
      }),
      /** La estructura: ángulo de hierro negro, como el de la ficha. */
      hierro: new THREE.MeshStandardMaterial({
        color: "#22262b", metalness: 0.45, roughness: 0.55, ...comun,
      }),
      /** El cajón plástico de cosecha. */
      cajon: new THREE.MeshStandardMaterial({
        color: "#2f4636", metalness: 0.05, roughness: 0.8, ...comun,
      }),
      estado: new THREE.MeshStandardMaterial({
        color: statusColor ?? "#64748b", metalness: 0.1, roughness: 0.6, ...comun,
      }),
    };
  }, [ghost, statusColor]);

  const bandejas = bandejasDeStand(w, d, h);

  return (
    <group>
      {/* ── El zócalo y los parantes ──────────────────────────────────────*/}
      <mesh position={[0, STAND_FRUTAS.zocalo / 2, 0]} castShadow material={m.hierro}>
        <boxGeometry args={[w - 0.06, STAND_FRUTAS.zocalo, d - 0.06]} />
      </mesh>
      {([-1, 1] as const).flatMap((sx) =>
        ([-1, 1] as const).map((sz) => (
          <mesh
            key={`${sx}${sz}`}
            position={[
              sx * (w / 2 - STAND_FRUTAS.marco / 2),
              STAND_FRUTAS.zocalo + (h - STAND_FRUTAS.zocalo) / 2,
              sz * (d / 2 - STAND_FRUTAS.marco / 2),
            ]}
            castShadow
            material={m.hierro}
          >
            <boxGeometry
              args={[STAND_FRUTAS.marco, h - STAND_FRUTAS.zocalo, STAND_FRUTAS.marco]}
            />
          </mesh>
        )),
      )}

      {/* ── Las bandejas escalonadas ──────────────────────────────────────
          El grupo se pone PRIMERO en su altura y recién ahí se gira. Girando
          desde el origen del mueble, una bandeja a 80 cm se corre veinte
          centímetros en Z y los cajones salen por el costado — es el mismo
          error que ya se pagó en el mural de vegetales. */}
      {bandejas.map((b, i) => (
        <group key={i} position={[0, b.y, b.z]} rotation={[b.caida, 0, 0]}>
          {/* El plano de apoyo. */}
          <mesh castShadow receiveShadow material={m.madera}>
            <boxGeometry args={[b.ancho, 0.024, b.fondo]} />
          </mesh>

          {/* Los cajones de cosecha, en fila. Van dibujados como cajas
              abiertas —cuatro paredes y un piso— porque un cajón cerrado
              esconde justo lo que se está exhibiendo. */}
          {Array.from({ length: b.cajones }, (_, k) => {
            const paso = b.ancho / b.cajones;
            const x = -b.ancho / 2 + paso * (k + 0.5);
            const largo = paso - STAND_FRUTAS.cajon.luz;
            const fondo = b.fondo - 0.04;
            const alto = STAND_FRUTAS.cajon.alto;
            const p = STAND_FRUTAS.cajon.pared;
            return (
              <group key={k} position={[x, 0.012 + alto / 2, 0]}>
                <mesh position={[0, -alto / 2 + p / 2, 0]} material={m.cajon} castShadow>
                  <boxGeometry args={[largo, p, fondo]} />
                </mesh>
                {([-1, 1] as const).map((sz) => (
                  <mesh key={`z${sz}`} position={[0, 0, sz * (fondo / 2 - p / 2)]} material={m.cajon} castShadow>
                    <boxGeometry args={[largo, alto, p]} />
                  </mesh>
                ))}
                {([-1, 1] as const).map((sx) => (
                  <mesh key={`x${sx}`} position={[sx * (largo / 2 - p / 2), 0, 0]} material={m.cajon} castShadow>
                    <boxGeometry args={[p, alto, fondo]} />
                  </mesh>
                ))}
              </group>
            );
          })}

          {/* El riel porta-precios del filo: en una frutería es donde va el
              precio por kilo, y es lo que remata visualmente el escalón. */}
          <mesh
            position={[0, 0.012 + STAND_FRUTAS.porta / 2, -b.fondo / 2 - 0.008]}
            material={m.hierro}
            castShadow
          >
            <boxGeometry args={[b.ancho, STAND_FRUTAS.porta, 0.016]} />
          </mesh>
        </group>
      ))}

      {/* Los costados de madera: cierran la silueta y atan las dos bandejas a
          la estructura. Sin ellos, los escalones se ven flotando entre los
          parantes y el mueble se lee como dos repisas sueltas. */}
      {([-1, 1] as const).map((sx) => (
        <mesh
          key={sx}
          position={[
            sx * (w / 2 - STAND_FRUTAS.marco / 2 - 0.004),
            STAND_FRUTAS.zocalo + (h * STAND_FRUTAS.bandejaAlta - STAND_FRUTAS.zocalo) / 2,
            0,
          ]}
          castShadow
          receiveShadow
          material={m.madera}
        >
          <boxGeometry
            args={[0.018, h * STAND_FRUTAS.bandejaAlta - STAND_FRUTAS.zocalo, d - STAND_FRUTAS.marco * 2]}
          />
        </mesh>
      ))}

      {/* La franja de estado, en el zócalo del frente. */}
      <mesh position={[0, STAND_FRUTAS.zocalo * 0.55, -(d / 2 - 0.02)]} material={m.estado}>
        <boxGeometry args={[w * 0.5, 0.03, 0.012]} />
      </mesh>
    </group>
  );
});
