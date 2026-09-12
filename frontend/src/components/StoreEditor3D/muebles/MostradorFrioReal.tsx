import { memo, useMemo } from "react";
import * as THREE from "three";
import { geometriaTapaDeVidrio, geometriaVidrioCurvo } from "./perfiles";
import { MOSTRADOR, cotasDeMostrador } from "./medidas";

/**
 * Un mostrador de servicio refrigerado: carnes, fiambres, quesos, pescadería.
 *
 * ## Qué lo hacía no parecerse
 *
 * La primera versión era un cajón oscuro con una placa de vidrio plana parada
 * encima. La segunda le puso el vidrio curvo, pero seguía sin parecerse, y
 * puesta al lado de la foto de uno real se ve por qué: los tres rasgos que lo
 * identifican son de FORMA, y le faltaban los tres.
 *
 * 1. **No apoya en el piso: va sobre patas acampanadas.** La carrocería fría
 *    está colgada a media altura sobre troncos de cono que se abren hacia el
 *    suelo. Ese hueco por debajo es lo primero que se ve de lejos, y es lo que
 *    lo separa de una isla o de una batea, que sí apoyan. Modelado como un
 *    cajón hasta el piso, el mueble se lee como un contenedor.
 * 2. **Es acero inoxidable CLARO, no negro.** Lo único oscuro es el marco del
 *    vidrio, la reja del compresor y el trasero de servicio. El contraste
 *    entre la carrocería clara y esos pocos negros es la mitad de lo que el
 *    ojo reconoce; con todo pintado de casi-negro no queda contraste ninguno.
 * 3. **El vidrio es una bóveda, no una visera.** Nace EN el filo del frente
 *    —no por delante, colgando en el aire, que es donde estaba montado— y se
 *    tumba hacia atrás por encima de todo el producto hasta el mueble de
 *    servicio. Se lleva más de la mitad del alto del mueble.
 *
 * A eso se suman los detalles que hacen que se lea como una máquina y no como
 * una maqueta: el bocel gordo de acero corrido en el filo del frente, las
 * puntas redondeadas, los montantes negros que dividen la bóveda en paños, y
 * el cajón del compresor con su reja de malla colgado bajo un extremo.
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

/** Inclinación de la cubeta hacia el cliente, en radianes. Sin ella lo de
 *  atrás queda tapado por lo de adelante. */
const CAIDA = (9 * Math.PI) / 180;
/** Espesor del montante negro que separa paño de paño en la bóveda. */
const MONTANTE = 0.022;

export const MostradorFrioReal = memo(function MostradorFrioReal({
  w, d, h, statusColor, ghost = false,
}: MostradorFrioRealProps) {
  const m = useMemo(() => {
    const comun = { transparent: ghost, opacity: ghost ? 0.42 : 1 };
    return {
      /** La carrocería: acero inoxidable claro, que es de lo que está hecha. */
      acero: new THREE.MeshStandardMaterial({
        color: "#c2c9cf", metalness: 0.85, roughness: 0.26,
        envMapIntensity: 1.3, ...comun,
      }),
      /** El bocel del filo y las patas, un punto más brillantes: son las
       *  piezas pulidas y son las que atrapan la luz en la foto. */
      pulido: new THREE.MeshStandardMaterial({
        color: "#dee4e9", metalness: 0.92, roughness: 0.16,
        envMapIntensity: 1.6, ...comun,
      }),
      /** Lo único negro del mueble: marco del vidrio, reja y trasero. */
      oscuro: new THREE.MeshStandardMaterial({
        color: "#15181c", metalness: 0.45, roughness: 0.5,
        envMapIntensity: 0.7, ...comun,
      }),
      /** La cubeta donde va el producto, blanca y mate. */
      cubeta: new THREE.MeshStandardMaterial({
        color: "#eef2f5", metalness: 0.1, roughness: 0.7,
        emissive: "#dbe8f0", emissiveIntensity: 0.14, ...comun,
      }),
      vidrio: new THREE.MeshStandardMaterial({
        color: "#e2f1f8", metalness: 0.1, roughness: 0.03,
        envMapIntensity: 1.8,
        transparent: true, opacity: ghost ? 0.1 : 0.22, depthWrite: false,
        side: THREE.DoubleSide,
      }),
      estado: new THREE.MeshStandardMaterial({
        color: statusColor ?? "#64748b", metalness: 0.1, roughness: 0.6, ...comun,
      }),
    };
  }, [ghost, statusColor]);

  const c = cotasDeMostrador(w, d, h);
  const altoDeCuerpo = c.filo - c.altoDePata;
  // El bocel no puede ser más gordo que la carrocería que remata.
  const bocel = Math.min(MOSTRADOR.bocel, altoDeCuerpo * 0.42);
  const bandeja = bandejaDeMostrador(w, d, h);
  const compresor = Math.min(MOSTRADOR.compresor.ancho, w * 0.45);

  return (
    <group>
      {/* ── Las patas acampanadas ─────────────────────────────────────────
          Troncos de cono que se ABREN hacia el piso, ovalados en planta. El
          hueco que dejan por debajo es lo que dice «mostrador de servicio» a
          diez metros: una isla o una batea apoyan, este no. */}
      {c.xDePatas.map((x, i) => (
        <mesh
          key={i}
          position={[x, c.altoDePata / 2, 0]}
          scale={[1, 1, MOSTRADOR.pata.ovalo]}
          castShadow
          receiveShadow
          material={m.pulido}
        >
          <cylinderGeometry
            args={[MOSTRADOR.pata.arriba, MOSTRADOR.pata.abajo, c.altoDePata, 20]}
          />
        </mesh>
      ))}

      {/* El cajón del compresor, colgado bajo un extremo, con su reja de
          malla al frente. Es el bulto oscuro que se ve entre las dos últimas
          patas de la foto. */}
      <group position={[w / 2 - compresor / 2 - 0.03, 0, 0]}>
        <mesh
          position={[
            0,
            c.altoDePata * (1 - MOSTRADOR.compresor.fraccionDeCaida / 2),
            0,
          ]}
          castShadow
          material={m.oscuro}
        >
          <boxGeometry
            args={[
              compresor,
              c.altoDePata * MOSTRADOR.compresor.fraccionDeCaida,
              Math.min(MOSTRADOR.compresor.fondo, d * 0.8),
            ]}
          />
        </mesh>
        {Array.from({ length: 5 }, (_, i) => (
          <mesh
            key={i}
            position={[
              0,
              c.altoDePata * (1 - MOSTRADOR.compresor.fraccionDeCaida) + 0.035 + i * 0.03,
              -Math.min(MOSTRADOR.compresor.fondo, d * 0.8) / 2 - 0.004,
            ]}
            material={m.pulido}
          >
            <boxGeometry args={[compresor * 0.78, 0.008, 0.008]} />
          </mesh>
        ))}
      </group>

      {/* ── La carrocería fría ────────────────────────────────────────────*/}
      <mesh
        position={[0, c.altoDePata + altoDeCuerpo / 2, 0]}
        castShadow
        receiveShadow
        material={m.acero}
      >
        <boxGeometry args={[w - bocel, altoDeCuerpo, d - bocel * 0.6]} />
      </mesh>

      {/* El bocel: un tubo de acero corrido por el filo del frente, rematado
          en las puntas con dos casquetes. Es lo que redondea el mueble; sin
          él el frente es una arista viva y se ve de chapa doblada. */}
      <group position={[0, c.filo - bocel, c.zFrente + bocel * 0.4]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow material={m.pulido}>
          <cylinderGeometry args={[bocel, bocel, w - bocel * 2, 18]} />
        </mesh>
        {([-1, 1] as const).map((sx) => (
          <mesh key={sx} position={[sx * (w / 2 - bocel), 0, 0]} castShadow material={m.pulido}>
            <sphereGeometry args={[bocel, 16, 12]} />
          </mesh>
        ))}
      </group>
      {/* Las puntas redondeadas: el mismo bocel girado, que baja por el canto
          de cada extremo y cierra el mueble. */}
      {([-1, 1] as const).map((sx) => (
        <mesh
          key={sx}
          position={[sx * (w / 2 - bocel), c.altoDePata + altoDeCuerpo / 2, c.zFrente + bocel * 0.4]}
          castShadow
          material={m.pulido}
        >
          <cylinderGeometry args={[bocel, bocel, altoDeCuerpo, 16]} />
        </mesh>
      ))}

      {/* La franja de estado, sobre el frente claro donde se ve. */}
      <mesh
        position={[0, c.altoDePata + altoDeCuerpo * 0.3, c.zFrente + bocel * 0.4 - 0.004]}
        material={m.estado}
      >
        <boxGeometry args={[w * 0.5, 0.028, 0.01]} />
      </mesh>

      {/* ── La cubeta INCLINADA ───────────────────────────────────────────
          El producto no va sobre una tapa plana: va sobre un plano que baja
          hacia el cliente, para que lo de atrás se vea por encima de lo de
          adelante. Es el mismo truco que el escalonado de una góndola. */}
      <group position={[0, bandeja.y - 0.012, bandeja.z]} rotation={[CAIDA, 0, 0]}>
        <mesh castShadow receiveShadow material={m.cubeta}>
          <boxGeometry args={[bandeja.ancho + 0.04, 0.02, bandeja.fondo + 0.04]} />
        </mesh>
      </group>

      {/* ── El mueble de servicio, atrás ──────────────────────────────────
          Donde la bóveda remata: el cuerpo cerrado por el que el carnicero
          saca y repone. Es lo que hace que el mueble NO sea simétrico y se
          entienda de qué lado se atiende. */}
      <mesh
        position={[0, c.filo + (h - c.filo) / 2, c.zRemate + c.fondoDeServicio / 2]}
        castShadow
        receiveShadow
        material={m.acero}
      >
        <boxGeometry args={[w, h - c.filo, c.fondoDeServicio]} />
      </mesh>
      <mesh
        position={[0, c.filo + (h - c.filo) * 0.4, c.zRemate + 0.002]}
        material={m.oscuro}
      >
        <boxGeometry args={[w - 0.04, (h - c.filo) * 0.45, 0.01]} />
      </mesh>

      {/* ── La bóveda de vidrio ───────────────────────────────────────────
          Nace EN el filo del frente y se tumba hacia atrás sobre todo el
          producto. Montada por DELANTE del filo —como estaba— el vidrio
          colgaba en el aire y el mueble parecía tener una visera. */}
      <group position={[0, c.filo, c.zFrente]}>
        <mesh
          geometry={geometriaVidrioCurvo(w - MONTANTE * 2, c.altoDeVidrio, c.vuelo)}
          material={m.vidrio}
        />
        {/* Los montantes negros: uno en cada punta y uno en cada junta entre
            paños. Son el mismo arco, angosto y grueso — el vidrio de la foto
            es modular y esas costillas oscuras son su dibujo más reconocible. */}
        {/* Las tapas de las puntas: sin ellas la bóveda queda abierta de
            costado —se ve el hueco frío desde el extremo— y el vidrio se lee
            como dos costillas negras paradas en el aire. */}
        {([-1, 1] as const).map((sx) => (
          <mesh
            key={sx}
            position={[sx * (w / 2 - MONTANTE), 0, 0]}
            geometry={geometriaTapaDeVidrio(c.altoDeVidrio, c.vuelo)}
            material={m.vidrio}
          />
        ))}
        {c.xDeMontantes.map((xm, i) => {
          // Los de las puntas se meten medio montante para adentro; si no,
          // medio canto negro cuelga fuera del vidrio.
          const x = Math.sign(xm) * Math.min(Math.abs(xm), w / 2 - MONTANTE / 2);
          return (
            <mesh
              key={i}
              position={[x, 0, 0]}
              geometry={geometriaVidrioCurvo(MONTANTE, c.altoDeVidrio + 0.006, c.vuelo + 0.006, 0.026)}
              material={m.oscuro}
              castShadow
            />
          );
        })}
      </group>
    </group>
  );
});

/** Dónde queda la cubeta y cuánto entra encima. Lo necesita quien vuelca el
 *  producto adentro, y sale de `cotasDeMostrador` para que no haya dos
 *  cuentas: con dos, la carne flota o se hunde dentro de la carrocería. */
export function bandejaDeMostrador(w: number, d: number, h: number) {
  const c = cotasDeMostrador(w, d, h);
  const fondo = Math.max(0.12, c.vuelo - 0.1);
  return {
    // Hundida respecto del filo: el cliente mira POR ENCIMA del bocel.
    y: Math.max(c.altoDePata + 0.04, c.filo - MOSTRADOR.hundido),
    ancho: Math.max(0.1, w - MOSTRADOR.bocel * 2 - 0.06),
    fondo,
    z: c.zFrente + 0.05 + fondo / 2,
    // No hasta el techo de la bóveda: el arco baja hacia el frente y un
    // montón alto atraviesa el vidrio.
    altoLibre: Math.max(0.08, c.altoDeVidrio * 0.26),
  };
}
