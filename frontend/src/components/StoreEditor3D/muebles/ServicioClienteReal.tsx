import { memo, useMemo } from "react";
import * as THREE from "three";
import { SERVICIO, cotasDeServicio } from "./medidas";
import { geometriaBandejaRedondeada } from "./perfiles";

/**
 * El mostrador de servicio al cliente: devoluciones, reclamos, información.
 *
 * ## Qué lo hacía no parecerse
 *
 * Era una tapa lisa sobre un cajón, con un cartel colgado de dos postes. Ese
 * mueble no existe en ninguna tienda. Contra las fichas de dos fabricantes de
 * mobiliario comercial, lo que identifica un mostrador de atención es una sola
 * cosa, y no la teníamos:
 *
 * 1. **Tiene DOS NIVELES.** Abajo, el plano de trabajo del que atiende —donde
 *    está el monitor y donde se escribe—; encima y volando hacia el cliente,
 *    la **repisa de atención**, más alta, donde el cliente apoya, firma y deja
 *    lo que trae. Ese escalón es todo el mueble: sin él es un podio.
 * 2. **Tapas oscuras con el canto redondeado sobre cuerpo claro.** El
 *    contraste es lo que se ve desde el pasillo, antes que el cartel.
 * 3. **Zócalo oscuro retranqueado** y **cajonera con puerta del lado del que
 *    atiende**; del lado del cliente el frente es ciego.
 *
 * Lo único que el modelo viejo tenía bien es el **tramo bajo accesible**, y
 * ahora su altura sale de la norma —0,86 m, para atender a alguien sentado— y
 * no de una fracción inventada.
 */

export interface ServicioClienteRealProps {
  w: number;
  d: number;
  h: number;
  statusColor?: string;
  ghost?: boolean;
}

export const ServicioClienteReal = memo(function ServicioClienteReal({
  w, d, h, statusColor, ghost = false,
}: ServicioClienteRealProps) {
  const m = useMemo(() => {
    const comun = { transparent: ghost, opacity: ghost ? 0.42 : 1 };
    return {
      /** El cuerpo: laminado claro de madera, como el de las fichas. */
      cuerpo: new THREE.MeshStandardMaterial({
        color: "#c9a476", metalness: 0.04, roughness: 0.72, ...comun,
      }),
      /** Las tapas y el zócalo: laminado oscuro MATE. El contraste con el
       *  cuerpo claro es lo que se ve desde el pasillo, y con brillo las caras
       *  de arriba devolvían tanta luz que la tapa salía blanca — justo la
       *  cara que más se mira. */
      tapa: new THREE.MeshStandardMaterial({
        color: "#23272b", metalness: 0.02, roughness: 0.85, ...comun,
      }),
      tirador: new THREE.MeshStandardMaterial({
        color: "#15181b", metalness: 0.55, roughness: 0.4, ...comun,
      }),
      /** El cartel, que es como se reconoce el mueble desde el pasillo. */
      senal: new THREE.MeshStandardMaterial({
        color: "#0e7490", metalness: 0.15, roughness: 0.55,
        emissive: "#0e7490", emissiveIntensity: 0.12, ...comun,
      }),
      tinta: new THREE.MeshStandardMaterial({
        color: "#e7eef2", metalness: 0.05, roughness: 0.7, ...comun,
      }),
      acero: new THREE.MeshStandardMaterial({
        color: "#9aa6ad", metalness: 0.6, roughness: 0.35, ...comun,
      }),
      pantalla: new THREE.MeshStandardMaterial({
        color: "#14181c", metalness: 0.45, roughness: 0.32, ...comun,
      }),
      estado: new THREE.MeshStandardMaterial({
        color: statusColor ?? "#64748b", metalness: 0.1, roughness: 0.6, ...comun,
      }),
    };
  }, [ghost, statusColor]);

  const c = cotasDeServicio(w, d, h);
  const zCliente = -d / 2;
  const zPersonal = d / 2;
  const tapaAlta = c.trabajo - SERVICIO.tapa.espesor;
  const tapaBaja = c.altoAccesible - SERVICIO.tapa.espesor;

  return (
    <group>
      {/* ── Zócalo oscuro, retranqueado ───────────────────────────────────*/}
      <mesh position={[0, SERVICIO.zocalo / 2, 0]} material={m.tapa}>
        <boxGeometry args={[w - 0.06, SERVICIO.zocalo, d - 0.06]} />
      </mesh>

      {/* ── El tramo alto: cuerpo + plano de trabajo ──────────────────────*/}
      <mesh
        position={[c.xAlto, SERVICIO.zocalo + (tapaAlta - SERVICIO.zocalo) / 2, 0]}
        castShadow
        receiveShadow
        material={m.cuerpo}
      >
        <boxGeometry args={[c.anchoAlto, tapaAlta - SERVICIO.zocalo, d]} />
      </mesh>
      <mesh
        position={[c.xAlto, tapaAlta, 0]}
        castShadow
        material={m.tapa}
        geometry={geometriaBandejaRedondeada(
          c.anchoAlto + 0.02, d + 0.02, SERVICIO.tapa.radio, SERVICIO.tapa.espesor,
        )}
      />

      {/* ── El tramo BAJO accesible ───────────────────────────────────────
          0,86 m: la altura de norma para atender a alguien sentado. No es
          adorno — es lo que distingue este mueble de una caja. */}
      <mesh
        position={[c.xAccesible, SERVICIO.zocalo + (tapaBaja - SERVICIO.zocalo) / 2, 0]}
        castShadow
        receiveShadow
        material={m.cuerpo}
      >
        <boxGeometry args={[c.anchoAccesible, tapaBaja - SERVICIO.zocalo, d]} />
      </mesh>
      <mesh
        position={[c.xAccesible, tapaBaja, 0]}
        castShadow
        material={m.tapa}
        geometry={geometriaBandejaRedondeada(
          c.anchoAccesible + 0.02, d + 0.02, SERVICIO.tapa.radio, SERVICIO.tapa.espesor,
        )}
      />

      {/* ── La REPISA DE ATENCIÓN ─────────────────────────────────────────
          El segundo nivel, volando hacia el cliente sobre un alma: donde el
          cliente apoya, firma y deja lo que trae. Es el rasgo que define el
          mueble; sin él, esto es un podio con un cartel. */}
      <mesh
        position={[
          c.xAlto,
          c.trabajo + (c.repisa - SERVICIO.repisa.espesor - c.trabajo) / 2,
          zCliente + c.fondoDeRepisa - 0.02,
        ]}
        castShadow
        material={m.cuerpo}
      >
        <boxGeometry
          args={[c.anchoAlto, Math.max(0.04, c.repisa - SERVICIO.repisa.espesor - c.trabajo), 0.04]}
        />
      </mesh>
      <mesh
        position={[c.xAlto, c.repisa - SERVICIO.repisa.espesor, c.zDeRepisa]}
        castShadow
        material={m.tapa}
        geometry={geometriaBandejaRedondeada(
          c.anchoAlto + 0.02, c.fondoDeRepisa, SERVICIO.repisa.radio, SERVICIO.repisa.espesor,
        )}
      />

      {/* ── La cajonera, del lado del que atiende ─────────────────────────*/}
      {Array.from({ length: SERVICIO.cajones }, (_, i) => {
        const paso = c.anchoAlto / SERVICIO.cajones;
        const x = c.xAlto - c.anchoAlto / 2 + paso * (i + 0.5);
        const alto = (tapaAlta - SERVICIO.zocalo) * 0.22;
        const y = tapaAlta - alto / 2 - 0.03;
        return (
          <group key={i}>
            <mesh position={[x, y, zPersonal + 0.008]} material={m.cuerpo} castShadow>
              <boxGeometry args={[paso - 0.03, alto, 0.018]} />
            </mesh>
            <mesh position={[x, y, zPersonal + 0.02]} material={m.tirador}>
              <boxGeometry args={[paso * 0.3, 0.018, 0.014]} />
            </mesh>
            {/* Y la puerta del gabinete, debajo del cajón. */}
            <mesh
              position={[x, (SERVICIO.zocalo + y - alto / 2) / 2 + SERVICIO.zocalo / 2, zPersonal + 0.008]}
              material={m.cuerpo}
            >
              <boxGeometry args={[paso - 0.03, Math.max(0.05, y - alto / 2 - SERVICIO.zocalo - 0.02), 0.018]} />
            </mesh>
          </group>
        );
      })}

      {/* ── El monitor, apoyado en el plano de trabajo ────────────────────
          Base, cuello y pantalla ENCADENADOS: calculados sueltos, el conjunto
          flotaba sobre la tapa sin tocarla. */}
      {(() => {
        const BASE = 0.014, CUELLO = 0.09, ALTO = 0.17;
        const x = c.xAlto + c.anchoAlto * 0.28;
        const z = d * 0.16;
        const yBase = c.trabajo;
        return (
          <group>
            <mesh position={[x, yBase + BASE / 2, z]} castShadow material={m.acero}>
              <boxGeometry args={[0.11, BASE, 0.1]} />
            </mesh>
            <mesh position={[x, yBase + BASE + CUELLO / 2, z]} castShadow material={m.acero}>
              <boxGeometry args={[0.028, CUELLO, 0.024]} />
            </mesh>
            <mesh
              position={[x, yBase + BASE + CUELLO + ALTO / 2 - 0.015, z]}
              rotation={[0.2, 0, 0]}
              castShadow
              material={m.pantalla}
            >
              <boxGeometry args={[0.26, ALTO, 0.028]} />
            </mesh>
          </group>
        );
      })()}

      {/* ── El cartel colgante ────────────────────────────────────────────
          Montado sobre parantes que salen del propio mostrador: acá no se
          dibuja techo, así que un cartel suspendido se ve suelto en el aire. */}
      {([-1, 1] as const).map((sx) => (
        <mesh
          key={sx}
          position={[
            c.xAlto + sx * (c.anchoAlto / 2 - 0.06),
            c.repisa + (c.yCartel - c.repisa) / 2,
            0,
          ]}
          castShadow
          material={m.acero}
        >
          <boxGeometry args={[SERVICIO.cartel.poste, c.yCartel - c.repisa, SERVICIO.cartel.poste]} />
        </mesh>
      ))}
      <mesh
        position={[c.xAlto, c.yCartel + SERVICIO.cartel.alto / 2, 0]}
        castShadow
        material={m.senal}
      >
        <boxGeometry args={[c.anchoAlto, SERVICIO.cartel.alto, SERVICIO.cartel.fondo]} />
      </mesh>
      {/* El renglón del cartel: de lejos se lee como un letrero escrito. */}
      <mesh
        position={[c.xAlto, c.yCartel + SERVICIO.cartel.alto / 2, -(SERVICIO.cartel.fondo / 2 + 0.004)]}
        material={m.tinta}
      >
        <boxGeometry args={[c.anchoAlto * 0.62, SERVICIO.cartel.alto * 0.34, 0.008]} />
      </mesh>

      {/* La franja de estado, en el zócalo del frente. */}
      <mesh position={[0, SERVICIO.zocalo * 0.5, zCliente - 0.012]} material={m.estado}>
        <boxGeometry args={[w * 0.4, 0.028, 0.012]} />
      </mesh>
    </group>
  );
});
