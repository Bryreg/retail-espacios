import { memo, useMemo } from "react";
import * as THREE from "three";
import { geometriaCanasto, geometriaMarcoDePuerta } from "./perfiles";
import { BATEA, cotasDeBatea, pisoDeBatea } from "./medidas";

/**
 * Una batea de promoción: el canasto donde se vuelca el producto de oferta.
 *
 * ## Qué estaba mal
 *
 * Estaba dibujada como un **carro de reposición**: una jaula de tubos con tres
 * repisas planas y ruedas. Eso existe en una tienda, pero es lo que usa quien
 * repone, no lo que ve el cliente. Una batea es otra cosa: un canasto en el
 * que se hurga.
 *
 * ## Las tres cosas que la hacen batea
 *
 * 1. **Paredes inclinadas**, más ancha arriba que abajo. No es un capricho de
 *    diseño: se fabrican en tronco de pirámide para poder apilarlas vacías, y
 *    esa inclinación es lo que el ojo usa para distinguirla de un cajón. Con
 *    paredes rectas se lee como una caja.
 * 2. **El fondo alto.** El piso del canasto no está a ras del suelo: está a
 *    media altura, porque nadie se agacha un metro para buscar una oferta. Por
 *    debajo queda el aire entre las ruedas.
 * 3. **El borde volcado.** El canto de arriba va plegado hacia afuera — es lo
 *    que evita que la chapa corte al meter la mano, y es lo que atrapa la luz
 *    y dibuja el contorno de la boca.
 *
 * Y las ruedas: una batea se mueve. Es el mueble que el supermercado arrastra
 * al pasillo central cuando arranca una promoción, y por eso se alquila por
 * semanas y no por meses.
 */

export interface BateaRealProps {
  w: number;
  d: number;
  h: number;
  /** Color de estado comercial, en la franja del frente. */
  statusColor?: string;
  ghost?: boolean;
}

/* Las cotas viven en `medidas.ts` (`BATEA`, `cotasDeBatea`): quien vuelca el
   producto adentro necesita las mismas, y con dos cuentas el montón flota o se
   hunde. Se re-exportan con los nombres de siempre para no tocar el cuerpo. */
const ESTRECHAMIENTO = BATEA.estrechamiento;
const RUEDA = BATEA.rueda;
const BORDE = BATEA.borde;

export const BateaReal = memo(function BateaReal({
  w, d, h, statusColor, ghost = false,
}: BateaRealProps) {
  const m = useMemo(() => {
    const comun = { transparent: ghost, opacity: ghost ? 0.42 : 1 };
    return {
      /** Chapa pintada: la batea es el mueble más golpeado de la tienda, así
       *  que va pintada y no cromada. */
      chapa: new THREE.MeshStandardMaterial({
        color: "#9aa3ab", metalness: 0.35, roughness: 0.52,
        envMapIntensity: 0.7, side: THREE.DoubleSide, ...comun,
      }),
      borde: new THREE.MeshStandardMaterial({
        color: "#cbd2d8", metalness: 0.5, roughness: 0.32,
        envMapIntensity: 1.0, ...comun,
      }),
      patas: new THREE.MeshStandardMaterial({
        color: "#3b444f", metalness: 0.4, roughness: 0.45, ...comun,
      }),
      estado: new THREE.MeshStandardMaterial({
        color: statusColor ?? "#8a929a", metalness: 0.1, roughness: 0.6, ...comun,
      }),
    };
  }, [ghost, statusColor]);

  // El piso del canasto, bien arriba: nadie se agacha un metro para buscar una
  // oferta, y una batea de verdad es un tacho poco hondo sobre patas largas.
  // A media altura el canasto queda tan hondo que el producto se hunde y el
  // mueble se ve vacío desde el pasillo — que es como se veía.
  const pisoDelCanasto = pisoDeBatea(h);
  const altoDelCanasto = Math.max(0.12, h - pisoDelCanasto);
  const anchoAbajo = Math.max(0.1, w - ESTRECHAMIENTO * 2);
  const fondoAbajo = Math.max(0.1, d - ESTRECHAMIENTO * 2);

  const ruedas = useMemo(
    () => ([-1, 1] as const).flatMap((sx) =>
      ([-1, 1] as const).map((sz) => [
        sx * (anchoAbajo / 2 - 0.05),
        sz * (fondoAbajo / 2 - 0.05),
      ] as const)),
    [anchoAbajo, fondoAbajo],
  );

  return (
    <group>
      {/* ── Las patas y las ruedas ────────────────────────────────────────*/}
      {ruedas.map(([x, z], i) => (
        <group key={i}>
          <mesh
            position={[x, RUEDA * 2 + (pisoDelCanasto - RUEDA * 2) / 2, z]}
            castShadow
            material={m.patas}
          >
            <boxGeometry args={[0.03, pisoDelCanasto - RUEDA * 2, 0.03]} />
          </mesh>
          <mesh
            position={[x, RUEDA, z]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
            material={m.patas}
          >
            <cylinderGeometry args={[RUEDA, RUEDA, 0.028, 12]} />
          </mesh>
        </group>
      ))}

      {/* ── El casco ──────────────────────────────────────────────────────*/}
      <group position={[0, pisoDelCanasto, 0]}>
        <mesh
          geometry={geometriaCanasto(w, d, anchoAbajo, fondoAbajo, altoDelCanasto)}
          material={m.chapa}
          castShadow
          receiveShadow
        />
        {/* El piso, al ras de la boca angosta. */}
        <mesh position={[0, 0.008, 0]} receiveShadow material={m.chapa}>
          <boxGeometry args={[anchoAbajo, 0.016, fondoAbajo]} />
        </mesh>
        {/* El borde volcado de la boca: lo que evita que la chapa corte al
            meter la mano, y lo que atrapa la luz y dibuja el contorno. */}
        <mesh
          geometry={geometriaMarcoDePuerta(w + BORDE, d + BORDE, BORDE, 0.014)}
          material={m.borde}
          position={[0, altoDelCanasto + 0.007, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          castShadow
        />
      </group>

      {/* ── La franja de estado ───────────────────────────────────────────*/}
      <mesh
        position={[0, pisoDelCanasto + altoDelCanasto * 0.4, -(d / 2 - ESTRECHAMIENTO * 0.55)]}
        material={m.estado}
      >
        <boxGeometry args={[w * 0.5, 0.03, 0.008]} />
      </mesh>
    </group>
  );
});

/** Dónde queda el piso del canasto y cuánto cabe encima. Lo necesita quien
 *  vuelca el producto adentro; la cuenta vive en `medidas.ts` para que no haya
 *  dos, y para que se pueda EJECUTAR en las pruebas: la guarda que sólo miraba
 *  el nombre de la constante dejó pasar una mutación que devolvía la batea a
 *  medirse enrasada. */
export function bocaDeBatea(w: number, d: number, h: number) {
  const c = cotasDeBatea(w, d, h);
  return { y: c.y, ancho: c.ancho, fondo: c.fondo, altoLibre: c.altoLibre };
}
