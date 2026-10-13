import { memo, useMemo } from "react";
import * as THREE from "three";
import { PUESTO_IMPULSO, cotasDePuestoDeImpulso } from "./medidas";
import { useSoltarMateriales } from "./luzDeVenta";

/**
 * El puesto de impulso: el mostrador chico donde una promotora da a probar o
 * presenta una marca, con la cenefa alta que se ve desde el otro lado del
 * pasillo.
 *
 * ## De dónde salen las medidas
 *
 * De la ficha de un counter de aluminio que se vende en Colombia (Grupo SRM,
 * ES-MC-8040-C): 0,80 de frente por 0,40 de fondo, la superficie a 1,00 y la
 * cenefa hasta 2,00. No se copió ninguna imagen: sólo las medidas
 * (`PUESTO_IMPULSO` en `medidas.ts`).
 *
 * ## Lo que lo hace reconocible
 *
 * 1. **Es angosto y alto.** Un mostrador de 40 cm de fondo con un cartel a
 *    2 m: lo contrario de la caja o del servicio al cliente, que son bajos y
 *    profundos.
 * 2. **La cenefa vuela sobre dos mástiles finos** en las esquinas de atrás, y
 *    entre el mostrador y la cenefa hay AIRE: ahí está la promotora. Pegada a
 *    la tapa se lee como una vitrina.
 * 3. **El frente del cuerpo es el cartel grande de la marca.** Es lo que se
 *    vende: con el arte del proveedor, va ahí (`frente`).
 *
 * No lleva producto inventado: lo que se ofrece en la tapa cambia cada día y
 * no es de la tienda.
 */

export interface PuestoImpulsoRealProps {
  w: number;
  d: number;
  h: number;
  statusColor?: string;
  ghost?: boolean;
  /** El arte del proveedor sobre el frente del cuerpo, ya resuelto. */
  frente?: THREE.Material | null;
}

export const PuestoImpulsoReal = memo(function PuestoImpulsoReal({
  w, d, h, statusColor, ghost = false, frente,
}: PuestoImpulsoRealProps) {
  const m = useMemo(() => {
    const comun = { transparent: ghost, opacity: ghost ? 0.42 : 1 };
    return {
      /** El cuerpo: panel claro, que es donde se imprime la marca. */
      cuerpo: new THREE.MeshStandardMaterial({ color: "#eef0f1", metalness: 0.02, roughness: 0.7, ...comun }),
      /** El perfil de aluminio de los cantos, la tapa y los mástiles. */
      aluminio: new THREE.MeshStandardMaterial({ color: "#b8bfc4", metalness: 0.6, roughness: 0.35, ...comun }),
      zocalo: new THREE.MeshStandardMaterial({ color: "#2a2e33", metalness: 0.1, roughness: 0.8, ...comun }),
      /** La cenefa sin marca: un panel claro con su canto. */
      cenefa: new THREE.MeshStandardMaterial({ color: "#f6f6f4", metalness: 0.02, roughness: 0.75, ...comun }),
      estado: new THREE.MeshStandardMaterial({ color: statusColor ?? "#64748b", metalness: 0.1, roughness: 0.6, ...comun }),
    };
  }, [ghost, statusColor]);
  useSoltarMateriales(m);

  const c = cotasDePuestoDeImpulso(w, d, h);
  const P = PUESTO_IMPULSO;
  const zFrente = -d / 2;

  return (
    <group>
      {/* ── Zócalo oscuro, retranqueado ───────────────────────────────────*/}
      <mesh position={[0, P.zocalo.alto / 2, 0]} material={m.zocalo}>
        <boxGeometry args={[w - P.zocalo.retranqueo * 2, P.zocalo.alto, d - P.zocalo.retranqueo * 2]} />
      </mesh>

      {/* ── El cuerpo del mostrador ───────────────────────────────────────*/}
      <mesh position={[0, P.zocalo.alto + c.cuerpo / 2, 0]} castShadow receiveShadow material={m.cuerpo}>
        <boxGeometry args={[w, c.cuerpo, d]} />
      </mesh>
      {/* Los cantos de aluminio del frente: el perfil que arma el counter. */}
      {([-1, 1] as const).map((sx) => (
        <mesh key={`canto${sx}`} position={[sx * (w / 2 - 0.008), P.zocalo.alto + c.cuerpo / 2, zFrente - 0.002]}
          material={m.aluminio}>
          <boxGeometry args={[0.016, c.cuerpo, 0.012]} />
        </mesh>
      ))}
      {/* El arte del proveedor, impreso en el frente. */}
      {frente && !ghost && (
        <mesh position={[0, P.zocalo.alto + c.cuerpo / 2, zFrente - 0.005]} rotation={[0, Math.PI, 0]}
          material={frente}>
          <planeGeometry args={[c.frente.ancho, c.frente.alto]} />
        </mesh>
      )}

      {/* ── La tapa, con un vuelo chico al frente ─────────────────────────*/}
      <mesh position={[0, c.superficie - P.tapa.espesor / 2, -P.tapa.vuelo / 2]} castShadow material={m.aluminio}>
        <boxGeometry args={[w + 0.01, P.tapa.espesor, d + P.tapa.vuelo]} />
      </mesh>

      {/* ── Los mástiles y la cenefa ──────────────────────────────────────
          Entre la tapa y la cenefa queda aire: ahí está la promotora. */}
      {([-1, 1] as const).map((sx) => (
        <mesh key={`mastil${sx}`}
          position={[sx * c.xMastil, c.superficie + (h - c.superficie) / 2, c.zMastil]}
          castShadow material={m.aluminio}>
          <boxGeometry args={[P.mastil, h - c.superficie, P.mastil]} />
        </mesh>
      ))}
      <mesh position={[0, c.cenefaDesde + P.cenefa.alto / 2, c.zMastil - P.mastil / 2 - P.cenefa.espesor / 2]}
        castShadow material={m.cenefa}>
        <boxGeometry args={[w, Math.min(P.cenefa.alto, h - c.cenefaDesde), P.cenefa.espesor]} />
      </mesh>

      {/* La franja de estado comercial, abajo y al frente. */}
      <mesh position={[0, P.zocalo.alto * 0.5, zFrente + P.zocalo.retranqueo - 0.004]} material={m.estado}>
        <boxGeometry args={[w * 0.6, 0.022, 0.006]} />
      </mesh>
    </group>
  );
});
