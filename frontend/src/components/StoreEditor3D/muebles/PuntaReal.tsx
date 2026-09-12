import { memo, useMemo } from "react";
import {
  COPETE, PANEL_FONDO, PARANTE, ZOCALO, nivelesDePunta, vanosDeCorrido,
} from "./medidas";
import { geometriaMarcoDeCopete } from "./perfiles";
import { CaraDeEstanteria, useMateriales } from "./piezas";

/**
 * Una punta de góndola: el mueble que cierra el extremo de un corrido.
 *
 * ## Por qué importa que ésta se vea bien
 *
 * Es **el espacio más caro de un supermercado**. Se ve de frente desde todo el
 * pasillo transversal, y por eso se negocia aparte y a otro precio que el
 * lineal. Cuando el dueño le muestra el plano 3D a un proveedor, la punta es
 * lo que le está vendiendo.
 *
 * ## Qué la distingue de un corrido
 *
 * 1. **El copete.** El cartel de arriba es lo que el proveedor compra: su
 *    marca a la altura de los ojos y visible desde lejos. Modelado como una
 *    caja plana se lee como una etiqueta pegada; lo que lo hace leer como
 *    cartelería es el marco en U que sobresale de la cara impresa y le tira
 *    sombra alrededor, y el vuelo a los costados, que lo despega del cuerpo.
 * 2. **Una sola cara vendible.** La de atrás da contra el corrido.
 * 3. **Poco fondo.** Una punta ronda 40 cm: es un mueble que se mira, no uno
 *    en el que se hurga.
 * 4. **La barra de luz** debajo del copete, apuntando al producto. Es el
 *    detalle que separa una punta de una estantería cualquiera.
 *
 * Todo lo demás —parantes, panel de fondo ranurado, entrepaños de lámina
 * plegada, porta-precios, base retranqueada— es el MISMO herraje del corrido y
 * viene de `piezas.tsx`. En tienda también: una punta se arma del mismo
 * catálogo que la góndola.
 *
 * ## Sistema de coordenadas
 *
 * El cuerpo se monta ATRÁS —contra el corrido— y crece hacia el frente. Como
 * las piezas de `piezas.tsx` nacen en z = 0 y crecen hacia -Z, la cara se
 * cuelga en `z = d/2` y el mueble entero queda dentro de su caja.
 */

export interface PuntaRealProps {
  /** Ancho, en metros. */
  w: number;
  /** Fondo. */
  d: number;
  /** Alto TOTAL, copete incluido. */
  h: number;
  /** Color de estado comercial. Tiñe la base — NO el copete, que es del
   *  proveedor, ni la estructura, que tiene que seguir pareciendo metal. */
  statusColor?: string;
  /** Previsualización al colocar: todo translúcido. */
  ghost?: boolean;
}

export const PuntaReal = memo(function PuntaReal({
  w, d, h, statusColor, ghost = false,
}: PuntaRealProps) {
  const materiales = useMateriales(ghost, statusColor);

  const altoDeCuerpo = Math.max(0.4, h - COPETE.alto);
  const vanos = useMemo(() => vanosDeCorrido(w), [w]);
  const niveles = useMemo(() => nivelesDePunta(altoDeCuerpo), [altoDeCuerpo]);

  // El fondo útil de los entrepaños, descontando el respaldo.
  const fondoDeCara = Math.max(0.12, d - PANEL_FONDO.espesor);
  // La base va retranqueada: la muesca donde entran los pies de quien mira.
  const fondoBase = Math.max(0.05, d - ZOCALO.retranqueo);

  const anchoCopete = w + COPETE.vuelo * 2;
  // El copete va CENTRADO en el fondo y apoyado sobre la tapa del cuerpo, no
  // colgado del filo de adelante. Montado al frente se lee como un cartel
  // suelto flotando por delante del mueble — se probó y se ve exactamente así.
  // El cartel de una punta real se atornilla encima de los parantes.
  const zCopete = COPETE.fondo / 2;

  return (
    <group>
      {/* ── Base ──────────────────────────────────────────────────────────*/}
      <mesh
        position={[0, ZOCALO.alto / 2, ZOCALO.retranqueo / 2]}
        castShadow
        receiveShadow
        material={materiales.zocalo}
      >
        <boxGeometry args={[w, ZOCALO.alto, fondoBase]} />
      </mesh>

      {/* ── El cuerpo ─────────────────────────────────────────────────────
          Se cuelga atrás y crece hacia el frente. Sin remate propio: arriba
          lo cierra el copete. */}
      <group position={[0, 0, d / 2]}>
        <CaraDeEstanteria
          anchoTotal={w}
          vanos={vanos}
          fondoMaximo={fondoDeCara}
          alto={altoDeCuerpo}
          niveles={niveles}
          materiales={materiales}
          conRemate={false}
        />
      </group>

      {/* ── La tapa del cuerpo ────────────────────────────────────────────
          Cierra los parantes arriba y es sobre lo que se apoya el copete. Sin
          ella el cartel queda flotando y el mueble termina en un canto de
          chapa cruda.

          Va en chapa PINTADA y no en el gris de la estructura: desde arriba
          —que es como se mira el plano la mayor parte del tiempo— la tapa es
          casi todo lo que se ve de una punta, y en gris oscuro el mueble se
          lee como una mancha negra al lado de las góndolas. */}
      <mesh
        position={[0, altoDeCuerpo - 0.015, 0]}
        castShadow
        receiveShadow
        material={materiales.pintado}
      >
        <boxGeometry args={[w, 0.03, d]} />
      </mesh>

      {/* ── El copete ─────────────────────────────────────────────────────*/}
      <group position={[0, altoDeCuerpo + COPETE.alto / 2, zCopete]}>
        {/* El marco en U, que es lo que le da sombra propia al cartel. */}
        <mesh
          geometry={geometriaMarcoDeCopete(anchoCopete, COPETE.alto, COPETE.fondo)}
          material={materiales.estructura}
          castShadow
          receiveShadow
        />
        {/* La chapa impresa, hundida dentro del marco. Va clara y neutra: es
            del proveedor, y teñirla con el estado comercial la convertiría en
            un semáforo en el lugar donde va una marca. */}
        <mesh position={[0, 0, -COPETE.fondo + 0.004]} castShadow material={materiales.precios}>
          <boxGeometry args={[anchoCopete - 0.016, COPETE.alto - 0.016, 0.004]} />
        </mesh>
      </group>

      {/* ── La barra de luz ───────────────────────────────────────────────
          Debajo del copete y apuntando al producto. En tienda es lo que hace
          que la punta se vea encendida desde el otro lado del pasillo. */}
      <mesh
        position={[0, altoDeCuerpo - 0.06, -d / 2 + 0.05]}
        material={materiales.precios}
      >
        <boxGeometry args={[w - PARANTE.ancho * 2, 0.04, 0.07]} />
      </mesh>
    </group>
  );
});
