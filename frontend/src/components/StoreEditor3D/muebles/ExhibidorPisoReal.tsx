import { memo, useMemo } from "react";
import * as THREE from "three";
import { EXHIBIDOR, cotasDeExhibidor } from "./medidas";

/**
 * El exhibidor de piso: el mueble que una marca planta en un pasillo.
 *
 * ## Qué lo hacía no parecerse
 *
 * Era una PIRÁMIDE de tres cajones de cartón macizos, apilados y metidos hacia
 * atrás. Y traía un defecto de bulto: el producto se dibujaba sobre la tapa de
 * TODOS los niveles, incluidos los que tenían otro nivel apoyado encima — así
 * que quedaba adentro de la caja de más arriba y sólo se veía el del último.
 *
 * La ficha de un fabricante de material de punto de venta lo describe entero:
 * «estructura metálica con **cuatro bandejas** para autodispensado de producto,
 * con **zócalo, cenefas, base y header** impresos a color». La foto de catálogo
 * lo confirma:
 *
 * 1. **Dos costados impresos** que SON la estructura, y entre ellos las
 *    bandejas. No hay cajones macizos: hay un mueble abierto al frente.
 * 2. **Una cenefa impresa en el filo de cada bandeja** — la franja con el
 *    mensaje de la marca, que es lo que se lee desde el pasillo.
 * 3. **El header** coronando el mueble, con la marca.
 *
 * Y ahí está el punto comercial: **lo que compra la marca no es el hueco, son
 * el header y las cenefas.** Por eso el arte del proveedor se pinta sobre los
 * costados y las cenefas, y no como un montón de producto inventado.
 */

export interface ExhibidorPisoRealProps {
  w: number;
  d: number;
  h: number;
  statusColor?: string;
  ghost?: boolean;
}

export const ExhibidorPisoReal = memo(function ExhibidorPisoReal({
  w, d, h, statusColor, ghost = false,
}: ExhibidorPisoRealProps) {
  const m = useMemo(() => {
    const comun = { transparent: ghost, opacity: ghost ? 0.42 : 1 };
    return {
      /** Los costados y el fondo: cartón impreso claro, que es el soporte del
       *  arte de la marca. */
      impreso: new THREE.MeshStandardMaterial({
        color: "#eceff1", metalness: 0.02, roughness: 0.82, ...comun,
      }),
      /** Las bandejas, en gris de chapa. */
      bandeja: new THREE.MeshStandardMaterial({
        color: "#9aa1a7", metalness: 0.3, roughness: 0.6, ...comun,
      }),
      /** La cenefa del filo y el header: lo que la marca compra. */
      marca: new THREE.MeshStandardMaterial({
        color: "#1d4f91", metalness: 0.1, roughness: 0.6, ...comun,
      }),
      tinta: new THREE.MeshStandardMaterial({
        color: "#f4f7f9", metalness: 0.02, roughness: 0.8, ...comun,
      }),
      zocalo: new THREE.MeshStandardMaterial({
        color: "#2b3238", metalness: 0.2, roughness: 0.7, ...comun,
      }),
      estado: new THREE.MeshStandardMaterial({
        color: statusColor ?? "#64748b", metalness: 0.1, roughness: 0.6, ...comun,
      }),
    };
  }, [ghost, statusColor]);

  const c = cotasDeExhibidor(w, d, h);
  const zFrente = -d / 2;

  return (
    <group>
      {/* ── Zócalo impreso ────────────────────────────────────────────────*/}
      <mesh position={[0, EXHIBIDOR.zocalo / 2, 0]} castShadow receiveShadow material={m.zocalo}>
        <boxGeometry args={[w - 0.03, EXHIBIDOR.zocalo, d - 0.03]} />
      </mesh>

      {/* ── Los dos costados impresos: son la estructura ──────────────────*/}
      {([-1, 1] as const).map((sx) => (
        <mesh
          key={sx}
          position={[
            sx * (w / 2 - EXHIBIDOR.costado / 2),
            EXHIBIDOR.zocalo + (c.topeDeCuerpo - EXHIBIDOR.zocalo) / 2,
            0,
          ]}
          castShadow
          receiveShadow
          material={m.impreso}
        >
          <boxGeometry args={[EXHIBIDOR.costado, c.topeDeCuerpo - EXHIBIDOR.zocalo, d]} />
        </mesh>
      ))}
      {/* El fondo, que cierra el mueble por detrás. */}
      <mesh
        position={[
          0,
          EXHIBIDOR.zocalo + (c.topeDeCuerpo - EXHIBIDOR.zocalo) / 2,
          d / 2 - EXHIBIDOR.costado / 2,
        ]}
        castShadow
        receiveShadow
        material={m.impreso}
      >
        <boxGeometry args={[w - EXHIBIDOR.costado * 2, c.topeDeCuerpo - EXHIBIDOR.zocalo, EXHIBIDOR.costado]} />
      </mesh>

      {/* ── Las bandejas, inclinadas hacia el cliente ─────────────────────
          El grupo se pone PRIMERO en su altura y recién ahí se gira: girando
          desde el origen, una bandeja a un metro se corre veinte centímetros
          en Z y se sale del mueble. */}
      {c.alturas.map((y, i) => (
        <group key={i} position={[0, y, c.z]} rotation={[EXHIBIDOR.caida, 0, 0]}>
          <mesh castShadow receiveShadow material={m.bandeja}>
            <boxGeometry args={[c.ancho, EXHIBIDOR.bandeja, c.fondo]} />
          </mesh>
          {/* El tope del filo, para que el producto no ruede al pasillo. */}
          <mesh
            position={[0, EXHIBIDOR.tope / 2, -(c.fondo / 2 - EXHIBIDOR.bandeja / 2)]}
            castShadow
            material={m.bandeja}
          >
            <boxGeometry args={[c.ancho, EXHIBIDOR.tope, EXHIBIDOR.bandeja]} />
          </mesh>
          {/* La CENEFA impresa del filo: junto con el header, es lo que la
              marca compra. Va por fuera del tope, mirando al pasillo. */}
          <mesh
            position={[0, EXHIBIDOR.cenefa / 2 - 0.01, -(c.fondo / 2 + 0.006)]}
            castShadow
            material={m.marca}
          >
            <boxGeometry args={[c.ancho + EXHIBIDOR.costado * 2, EXHIBIDOR.cenefa, 0.01]} />
          </mesh>
        </group>
      ))}

      {/* ── El header de marca ────────────────────────────────────────────*/}
      <mesh
        position={[0, c.topeDeCuerpo + c.header / 2, zFrente + EXHIBIDOR.costado]}
        castShadow
        material={m.marca}
      >
        <boxGeometry args={[w, c.header, EXHIBIDOR.costado]} />
      </mesh>
      <mesh
        position={[0, c.topeDeCuerpo + c.header * 0.55, zFrente + EXHIBIDOR.costado - 0.008]}
        material={m.tinta}
      >
        <boxGeometry args={[w * 0.6, c.header * 0.32, 0.008]} />
      </mesh>

      {/* La franja de estado, en el zócalo. */}
      <mesh position={[0, EXHIBIDOR.zocalo * 0.5, zFrente - 0.006]} material={m.estado}>
        <boxGeometry args={[w * 0.45, 0.026, 0.012]} />
      </mesh>
    </group>
  );
});
