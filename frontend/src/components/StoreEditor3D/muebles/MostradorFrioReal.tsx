import { memo, useMemo } from "react";
import * as THREE from "three";
import { geometriaVidrioCurvo } from "./perfiles";

/**
 * Un mostrador de servicio refrigerado: carnes, fiambres, quesos, pescadería.
 *
 * ## Qué lo hacía no parecerse
 *
 * Era un cajón oscuro con una **placa de vidrio plana y vertical** parada
 * encima. Eso no es un mostrador de carnes: es una vitrina cualquiera. Faltaban
 * las tres cosas que lo identifican, y son de forma, no de material:
 *
 * 1. **El vidrio CURVO.** Arranca casi horizontal sobre la bandeja y se
 *    levanta hacia el cliente. Esa curva es lo que deja ver el producto desde
 *    arriba mientras lo protege, y es lo que el ojo reconoce a diez metros.
 * 2. **La bandeja INCLINADA.** El producto no está sobre una tapa plana: está
 *    sobre un plano que baja hacia el cliente, para que las bandejas de atrás
 *    se vean por encima de las de adelante. Es el mismo truco que el
 *    escalonado de una góndola.
 * 3. **El lado de servicio.** Un mostrador tiene dos lados: el del cliente,
 *    cerrado con vidrio, y el del carnicero, abierto, con la tabla de trabajo
 *    y el mostrador alto donde se apoya la balanza. Modelado como una caja
 *    simétrica no se entiende de qué lado se atiende.
 *
 * ## Por qué eso importa acá
 *
 * El mostrador de carnes y el de fiambres se le alquilan a marcas —la vitrina
 * de una marca de embutidos es un espacio que se vende—, y quien lo está
 * comprando tiene que reconocer qué está comprando cuando ve el plano.
 */

export interface MostradorFrioRealProps {
  w: number;
  d: number;
  h: number;
  statusColor?: string;
  ghost?: boolean;
}

/** Cuánto sobresale el vidrio hacia el cliente desde el filo del mueble.
 *
 *  Es una cota de forma, no de adorno: con poco vuelo la curva no se lee y el
 *  vidrio se ve como una placa apenas inclinada, que es como se veía. Un
 *  mostrador de verdad saca el vidrio bien por delante del cuerpo — ahí es
 *  donde el cliente apoya la vista, y por debajo pasa la bandeja. */
const VUELO_VIDRIO = 0.24;
/** Inclinación de la bandeja hacia el cliente, en radianes. */
const CAIDA = (9 * Math.PI) / 180;
/** Alto de la barra de servicio del lado del que atiende. */
const BARRA = 0.055;

export const MostradorFrioReal = memo(function MostradorFrioReal({
  w, d, h, statusColor, ghost = false,
}: MostradorFrioRealProps) {
  const m = useMemo(() => {
    const comun = { transparent: ghost, opacity: ghost ? 0.42 : 1 };
    return {
      cuerpo: new THREE.MeshStandardMaterial({
        color: "#1d232e", metalness: 0.3, roughness: 0.55,
        envMapIntensity: 0.6, ...comun,
      }),
      /** Acero inoxidable: la bandeja, la barra y los cantos. */
      acero: new THREE.MeshStandardMaterial({
        color: "#c9cfd4", metalness: 0.65, roughness: 0.3,
        envMapIntensity: 1.1, ...comun,
      }),
      /** La cubeta donde va el producto, blanca y mate. */
      cubeta: new THREE.MeshStandardMaterial({
        color: "#eef2f5", metalness: 0.1, roughness: 0.7,
        emissive: "#dbe8f0", emissiveIntensity: 0.14, ...comun,
      }),
      vidrio: new THREE.MeshStandardMaterial({
        color: "#e2f1f8", metalness: 0.1, roughness: 0.03,
        envMapIntensity: 1.8,
        transparent: true, opacity: ghost ? 0.1 : 0.16, depthWrite: false,
        side: THREE.DoubleSide,
      }),
      hueco: new THREE.MeshStandardMaterial({
        color: "#0d1117", metalness: 0.1, roughness: 0.9, ...comun,
      }),
      estado: new THREE.MeshStandardMaterial({
        color: statusColor ?? "#64748b", metalness: 0.1, roughness: 0.6, ...comun,
      }),
    };
  }, [ghost, statusColor]);

  // El cuerpo llega hasta el plano de la bandeja; encima va el vidrio. A 0,62
  // el vidrio queda tan bajo que no alcanza a curvarse: el mostrador se lee
  // como un cajón con una tapa apoyada.
  const altoDeCuerpo = Math.max(0.3, h * 0.54);
  const zFrente = -d / 2;
  // La bandeja ocupa el lado del CLIENTE; atrás queda la franja de servicio.
  const fondoDeBandeja = d * 0.62;
  const zBandeja = zFrente + fondoDeBandeja / 2 + 0.02;

  return (
    <group>
      {/* ── El cuerpo ─────────────────────────────────────────────────────*/}
      <mesh position={[0, altoDeCuerpo / 2, 0]} castShadow receiveShadow material={m.cuerpo}>
        <boxGeometry args={[w, altoDeCuerpo, d]} />
      </mesh>
      {/* Zócalo retranqueado y rejilla del compresor, al frente. */}
      <mesh position={[0, 0.055, zFrente + 0.03]} material={m.hueco}>
        <boxGeometry args={[w - 0.04, 0.11, 0.02]} />
      </mesh>
      {Array.from({ length: 4 }, (_, i) => (
        <mesh key={i} position={[0, 0.17 + i * 0.032, zFrente - 0.004]} material={m.hueco}>
          <boxGeometry args={[w * 0.6, 0.009, 0.008]} />
        </mesh>
      ))}
      <mesh position={[0, altoDeCuerpo - 0.09, zFrente - 0.008]} material={m.estado}>
        <boxGeometry args={[w * 0.5, 0.028, 0.01]} />
      </mesh>

      {/* ── La cubeta INCLINADA ───────────────────────────────────────────
          El producto no va sobre una tapa plana: va sobre un plano que baja
          hacia el cliente, para que lo de atrás se vea por encima de lo de
          adelante. Es el mismo truco que el escalonado de una góndola. */}
      <group position={[0, altoDeCuerpo, zBandeja]} rotation={[CAIDA, 0, 0]}>
        <mesh castShadow receiveShadow material={m.cubeta}>
          <boxGeometry args={[w - 0.06, 0.02, fondoDeBandeja]} />
        </mesh>
        {/* El canto de acero de la cubeta, que la separa del cuerpo oscuro. */}
        <mesh position={[0, 0.012, -fondoDeBandeja / 2]} material={m.acero}>
          <boxGeometry args={[w - 0.06, 0.028, 0.014]} />
        </mesh>
      </group>

      {/* ── La franja de servicio ─────────────────────────────────────────
          El lado del que atiende: la tabla de trabajo y la barra alta donde se
          apoya la balanza. Sin esto el mueble es simétrico y no se entiende de
          qué lado se atiende. */}
      <mesh
        position={[0, altoDeCuerpo + 0.012, d / 2 - (d - fondoDeBandeja) / 2 + 0.01]}
        castShadow
        receiveShadow
        material={m.acero}
      >
        <boxGeometry args={[w, 0.024, Math.max(0.06, d - fondoDeBandeja - 0.04)]} />
      </mesh>
      <mesh
        position={[0, altoDeCuerpo + BARRA / 2, d / 2 - 0.02]}
        castShadow
        material={m.acero}
      >
        <boxGeometry args={[w, BARRA, 0.03]} />
      </mesh>

      {/* ── El vidrio curvo ───────────────────────────────────────────────*/}
      <group position={[0, altoDeCuerpo + 0.02, zFrente - VUELO_VIDRIO]}>
        <mesh
          geometry={geometriaVidrioCurvo(w - 0.05, h - altoDeCuerpo - 0.04, VUELO_VIDRIO)}
          material={m.vidrio}
        />
        {/* Los montantes de las puntas: el vidrio no flota, va sujeto. */}
        {([-1, 1] as const).map((sx) => (
          <mesh
            key={sx}
            position={[sx * (w / 2 - 0.02), (h - altoDeCuerpo - 0.04) / 2, VUELO_VIDRIO * 0.45]}
            material={m.acero}
            castShadow
          >
            <boxGeometry args={[0.018, h - altoDeCuerpo - 0.04, 0.02]} />
          </mesh>
        ))}
      </group>
    </group>
  );
});

/** Dónde queda la bandeja y cuánto entra encima. Lo necesita quien vuelca el
 *  producto adentro, y vive acá para que no haya dos cuentas. */
export function bandejaDeMostrador(w: number, d: number, h: number) {
  const altoDeCuerpo = Math.max(0.3, h * 0.54);
  const fondoDeBandeja = d * 0.62;
  return {
    y: altoDeCuerpo + 0.015,
    ancho: w - 0.10,
    fondo: fondoDeBandeja - 0.04,
    z: -d / 2 + fondoDeBandeja / 2 + 0.02,
    altoLibre: Math.max(0.08, (h - altoDeCuerpo) * 0.55),
  };
}
