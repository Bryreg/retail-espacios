import { memo, useMemo } from "react";
import * as THREE from "three";
import { STAND_FRUTAS, alturaDeEspina, bandejasDeStand } from "./medidas";

/**
 * El stand de frutas y verduras, contra la ficha del fabricante.
 *
 * ## Qué lo hacía no parecerse
 *
 * Primero fue un mesón macizo con un cajón plano arriba: una mesa con cosas
 * encima. Después se le pusieron los escalones inclinados, y seguía sin
 * parecerse, porque le faltaba lo que decide el mueble entero:
 *
 * 1. **Es una ISLA DE DOS CARAS.** Una espina central y, a cada lado, sus dos
 *    escalones. Con una sola cara —y paneles ciegos de madera mirando al
 *    pasillo, que es lo que teníamos— se desperdicia la mitad del frente
 *    vendible, que es justamente lo que se le está vendiendo al proveedor.
 * 2. **La cubierta de MADERA es la superficie dominante**, un plano ancho
 *    inclinado que corre todo el largo, con los cajones apoyados encima en
 *    fila apretada. Nosotros teníamos una bandeja angosta y verde.
 * 3. **Los cajones van llenos y rebosados.** Con una capa de fruta en el
 *    fondo, la pared del cajón la tapa y desde el pasillo el mueble se ve
 *    vacío. Es el mismo defecto que tenía la batea.
 * 4. **Riel de precios en el filo de cada escalón y peine de pinzas arriba**,
 *    sobre el respaldo del escalón alto.
 * 5. **La estructura es negra y BAJA**: zócalo y perfiles, nada por encima de
 *    las cubiertas. Cuatro postes asomando lo hacían leer como andamio.
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
      /** La cubierta: madera clara de tablero, que es la cara del mueble. */
      madera: new THREE.MeshStandardMaterial({
        color: "#c49a5f", metalness: 0, roughness: 0.72, ...comun,
      }),
      /** La estructura: perfil de hierro negro, como el de la ficha. */
      hierro: new THREE.MeshStandardMaterial({
        color: "#1c2024", metalness: 0.4, roughness: 0.55, ...comun,
      }),
      /** El cajón de cosecha. */
      cajon: new THREE.MeshStandardMaterial({
        color: "#24382b", metalness: 0.05, roughness: 0.82, ...comun,
      }),
      estado: new THREE.MeshStandardMaterial({
        color: statusColor ?? "#64748b", metalness: 0.1, roughness: 0.6, ...comun,
      }),
    };
  }, [ghost, statusColor]);

  const bandejas = bandejasDeStand(w, d, h);
  const espina = alturaDeEspina(h);

  return (
    <group>
      {/* ── El zócalo negro ───────────────────────────────────────────────*/}
      <mesh position={[0, STAND_FRUTAS.zocalo / 2, 0]} castShadow receiveShadow material={m.hierro}>
        <boxGeometry args={[w - 0.05, STAND_FRUTAS.zocalo, d - 0.05]} />
      </mesh>

      {/* ── La espina central ─────────────────────────────────────────────
          El alma del mueble: lo que sostiene los dos pares de escalones y los
          separa. Termina en el respaldo del escalón alto, donde va el peine de
          pinzas de precio. */}
      <mesh
        position={[0, STAND_FRUTAS.zocalo + (espina - STAND_FRUTAS.zocalo) / 2, 0]}
        castShadow
        receiveShadow
        material={m.hierro}
      >
        <boxGeometry args={[w - 0.05, espina - STAND_FRUTAS.zocalo, 0.07]} />
      </mesh>
      {/* El peine de pinzas de precio, corrido por el remate de la espina. */}
      {(() => {
        const cuantas = Math.max(2, Math.round(w / 0.13));
        return Array.from({ length: cuantas }, (_, i) => (
          <mesh
            key={i}
            position={[-w / 2 + 0.05 + ((w - 0.1) * i) / (cuantas - 1), espina + 0.012, 0]}
            material={m.hierro}
          >
            <boxGeometry args={[0.035, 0.03, 0.09]} />
          </mesh>
        ));
      })()}

      {/* ── Los cuatro escalones ──────────────────────────────────────────
          El grupo se pone PRIMERO en su altura y recién ahí se gira. Girando
          desde el origen del mueble, un escalón a 80 cm se corre veinte
          centímetros en Z y los cajones salen por el costado — el mismo error
          que ya se pagó en el mural de vegetales. */}
      {bandejas.map((b, i) => (
        <group key={i} position={[0, b.y, b.z]} rotation={[b.caida, 0, 0]}>
          {/* La cubierta de madera. */}
          <mesh castShadow receiveShadow material={m.madera}>
            <boxGeometry args={[b.ancho, STAND_FRUTAS.cubierta, b.fondo]} />
          </mesh>

          {/* Los cajones de cosecha, en fila apretada. Van dibujados como
              cajas abiertas —cuatro paredes y un piso— porque un cajón cerrado
              esconde justo lo que se está exhibiendo. */}
          {Array.from({ length: b.cajones }, (_, k) => {
            const paso = b.ancho / b.cajones;
            const x = -b.ancho / 2 + paso * (k + 0.5);
            const largo = paso - STAND_FRUTAS.cajon.luz;
            // El cajón no cubre la cubierta entera: en la ficha queda una banda
            // de madera a la vista delante de la fila, y es la que hace que el
            // mueble se lea como frutería de tablero y no como una hilera de
            // cajones flotando.
            const fondo = b.fondo * 0.68;
            const alto = STAND_FRUTAS.cajon.alto;
            const p = STAND_FRUTAS.cajon.pared;
            return (
              <group
                key={k}
                position={[x, STAND_FRUTAS.cubierta / 2 + alto / 2, -b.lado * (b.fondo * 0.13)]}
              >
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

          {/* El riel de precios del filo: en una frutería es donde va el precio
              por kilo, y es lo que remata visualmente el escalón. */}
          <mesh
            position={[
              0,
              STAND_FRUTAS.cubierta / 2 + STAND_FRUTAS.porta / 2,
              b.lado * (b.fondo / 2 + 0.009),
            ]}
            material={m.hierro}
            castShadow
          >
            <boxGeometry args={[b.ancho, STAND_FRUTAS.porta, 0.018]} />
          </mesh>
        </group>
      ))}

      {/* La franja de estado, en el zócalo del frente. */}
      <mesh position={[0, STAND_FRUTAS.zocalo * 0.55, -(d / 2 - 0.02)]} material={m.estado}>
        <boxGeometry args={[w * 0.4, 0.028, 0.014]} />
      </mesh>
    </group>
  );
});
