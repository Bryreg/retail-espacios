import { memo, useMemo } from "react";
import * as THREE from "three";
import { CHECKOUT, cotasDeCheckout } from "./medidas";

/**
 * La caja registradora, contra la foto de catálogo de una de verdad.
 *
 * ## Qué la hacía no parecerse
 *
 * Era un cajón liso con una placa oscura encima haciendo de cinta y **una
 * pantalla flotando en el aire**: el poste medía `posH * 0.75` y la pantalla
 * se colocaba a `posH`, así que quedaban veinticinco centímetros de aire entre
 * los dos. Compilaba, y nadie lo vio hasta ponerlo en el taller.
 *
 * Lo que tiene una de verdad, y es todo de forma:
 *
 * 1. **La mesa es una CAMA HUNDIDA con bocel.** Por la cama corre la cinta y
 *    ahí descarga el cliente; alrededor da la vuelta un bocel de goma oscuro.
 *    Ese contraste entre bandeja clara y marco oscuro es lo que se ve desde el
 *    pasillo, antes que la registradora.
 * 2. **La registradora se apoya en una consola**, un pupitre de chapa doblada,
 *    y el poste de la pantalla NACE de esa consola.
 * 3. **El sector de empaque**, del lado del cajero y más alto que la cama, con
 *    una guarda parada atrás.
 * 4. **Los estantes de impulso del lado del cliente.** Chicles, pilas,
 *    revistas: es el espacio más caro de la línea de cajas y es espacio
 *    VENDIBLE. Un plano que se le muestra a un proveedor no puede no tenerlos.
 * 5. **El parachoques corrido** a media altura, que es lo que come los carros.
 */

export interface CheckoutRealProps {
  w: number;
  d: number;
  h: number;
  statusColor?: string;
  ghost?: boolean;
}

export const CheckoutReal = memo(function CheckoutReal({
  w, d, h, statusColor, ghost = false,
}: CheckoutRealProps) {
  const m = useMemo(() => {
    const comun = { transparent: ghost, opacity: ghost ? 0.42 : 1 };
    return {
      cuerpo: new THREE.MeshStandardMaterial({
        color: "#8b939b", metalness: 0.35, roughness: 0.5, ...comun,
      }),
      /** La cama y el plano de empaque: laminado claro. */
      cama: new THREE.MeshStandardMaterial({
        color: "#eceff1", metalness: 0.08, roughness: 0.45, ...comun,
      }),
      /** El bocel, el parachoques, el zócalo y la consola. */
      oscuro: new THREE.MeshStandardMaterial({
        color: "#23282d", metalness: 0.4, roughness: 0.55, ...comun,
      }),
      hueco: new THREE.MeshStandardMaterial({
        color: "#30363c", metalness: 0.2, roughness: 0.85, ...comun,
      }),
      pantalla: new THREE.MeshStandardMaterial({
        color: "#12161a", metalness: 0.5, roughness: 0.3, ...comun,
      }),
      luz: new THREE.MeshStandardMaterial({
        color: "#1e3a8a", emissive: "#1d4ed8", emissiveIntensity: 0.35,
        transparent: true, opacity: (ghost ? 0.42 : 1) * 0.9,
      }),
      acero: new THREE.MeshStandardMaterial({
        color: "#c8ced4", metalness: 0.8, roughness: 0.25, ...comun,
      }),
      estado: new THREE.MeshStandardMaterial({
        color: statusColor ?? "#64748b", metalness: 0.1, roughness: 0.6, ...comun,
      }),
    };
  }, [ghost, statusColor]);

  const c = cotasDeCheckout(w, d, h);
  const zCliente = -d / 2;
  const zCajero = d / 2;
  const altoDeCuerpo = c.mesa - CHECKOUT.bocel;

  return (
    <group>
      {/* ── Zócalo retranqueado ───────────────────────────────────────────*/}
      <mesh position={[0, CHECKOUT.zocalo / 2, 0]} material={m.oscuro}>
        <boxGeometry args={[w - 0.06, CHECKOUT.zocalo, d - 0.06]} />
      </mesh>

      {/* ── El cuerpo, RETRANQUEADO al frente ─────────────────────────────
          El nicho de impulso tiene que ser un hueco de verdad. Dibujado como
          una caja oscura METIDA dentro del cuerpo queda tapado, y lo único que
          se ve es el z-fighting de las dos caras en el mismo plano. Así que el
          cuerpo se corta: uno principal más corto de fondo, y dos tacos en los
          extremos que cierran los costados del nicho. */}
      <mesh
        position={[
          0,
          CHECKOUT.zocalo + (altoDeCuerpo - CHECKOUT.zocalo) / 2,
          zCliente + CHECKOUT.impulso.fondo + (d - CHECKOUT.impulso.fondo) / 2,
        ]}
        castShadow
        receiveShadow
        material={m.cuerpo}
      >
        <boxGeometry args={[w, altoDeCuerpo - CHECKOUT.zocalo, d - CHECKOUT.impulso.fondo]} />
      </mesh>
      {([-1, 1] as const).map((sx) => {
        const taco = Math.max(0.04, (w - c.largoDeCama) / 2);
        return (
          <mesh
            key={sx}
            position={[
              sx * (w / 2 - taco / 2),
              CHECKOUT.zocalo + (altoDeCuerpo - CHECKOUT.zocalo) / 2,
              zCliente + CHECKOUT.impulso.fondo / 2,
            ]}
            castShadow
            receiveShadow
            material={m.cuerpo}
          >
            <boxGeometry args={[taco, altoDeCuerpo - CHECKOUT.zocalo, CHECKOUT.impulso.fondo]} />
          </mesh>
        );
      })}

      {/* ── Los estantes de impulso, del lado del cliente ─────────────────
          El espacio más caro de la línea de cajas: chicles, pilas, revistas.
          Es espacio VENDIBLE, así que en un plano que se le muestra a un
          proveedor no puede faltar. El fondo oscuro del nicho es lo que le da
          profundidad al hueco. */}
      <mesh
        position={[
          0,
          CHECKOUT.zocalo + (altoDeCuerpo - CHECKOUT.zocalo) / 2,
          zCliente + CHECKOUT.impulso.fondo + 0.005,
        ]}
        material={m.hueco}
      >
        <boxGeometry args={[c.largoDeCama, altoDeCuerpo - CHECKOUT.zocalo, 0.01]} />
      </mesh>
      {c.yDeImpulso.map((y, i) => (
        <mesh
          key={i}
          position={[c.xDeCama, y, zCliente + CHECKOUT.impulso.fondo / 2]}
          castShadow
          material={m.cuerpo}
        >
          <boxGeometry args={[c.largoDeCama - 0.03, 0.016, CHECKOUT.impulso.fondo - 0.01]} />
        </mesh>
      ))}

      {/* El parachoques corrido: da la vuelta por el frente y los dos cantos. */}
      <mesh position={[0, altoDeCuerpo * 0.62, zCliente - 0.012]} material={m.oscuro}>
        <boxGeometry args={[w + 0.02, CHECKOUT.parachoques, 0.026]} />
      </mesh>
      {([-1, 1] as const).map((sx) => (
        <mesh key={sx} position={[sx * (w / 2 + 0.012), altoDeCuerpo * 0.62, 0]} material={m.oscuro}>
          <boxGeometry args={[0.026, CHECKOUT.parachoques, d + 0.02]} />
        </mesh>
      ))}

      {/* ── La mesa: bocel perimetral y cama hundida ──────────────────────*/}
      {/* El bocel, como marco: cuatro barras y no una tapa, porque lo que se
          ve es el hueco que dejan en el medio. */}
      {([[-1, 0], [1, 0]] as const).map(([sx], i) => (
        <mesh
          key={`x${i}`}
          position={[sx * (w / 2 - CHECKOUT.bocel / 2), c.mesa - CHECKOUT.bocel / 2, 0]}
          castShadow
          material={m.oscuro}
        >
          <boxGeometry args={[CHECKOUT.bocel, CHECKOUT.bocel, d]} />
        </mesh>
      ))}
      {([-1, 1] as const).map((sz) => (
        <mesh
          key={`z${sz}`}
          position={[0, c.mesa - CHECKOUT.bocel / 2, sz * (d / 2 - CHECKOUT.bocel / 2)]}
          castShadow
          material={m.oscuro}
        >
          <boxGeometry args={[w, CHECKOUT.bocel, CHECKOUT.bocel]} />
        </mesh>
      ))}

      {/* La cama de la cinta: hundida dentro del marco. */}
      <mesh position={[c.xDeCama, c.cama, 0]} receiveShadow material={m.cama}>
        <boxGeometry args={[c.largoDeCama, 0.02, d - CHECKOUT.bocel * 2]} />
      </mesh>
      {/* El separador de compras, que es lo que dice «esto es una cinta». */}
      <mesh position={[c.xDeCama - c.largoDeCama * 0.18, c.cama + 0.035, 0]} material={m.acero}>
        <boxGeometry args={[0.018, 0.05, d - CHECKOUT.bocel * 2 - 0.06]} />
      </mesh>

      {/* El sector de empaque: al ras del bocel, más alto que la cama. */}
      <mesh
        position={[c.xDeEmpaque, c.mesa - CHECKOUT.bocel / 2 - 0.004, 0]}
        receiveShadow
        castShadow
        material={m.cama}
      >
        <boxGeometry args={[c.largoDeEmpaque, CHECKOUT.bocel - 0.008, d - CHECKOUT.bocel * 2]} />
      </mesh>
      {/* Su guarda parada al fondo, para que no se caiga nada del otro lado. */}
      <mesh
        position={[c.xDeEmpaque, c.mesa + CHECKOUT.guarda / 2, zCajero - CHECKOUT.bocel / 2]}
        castShadow
        material={m.oscuro}
      >
        <boxGeometry args={[c.largoDeEmpaque, CHECKOUT.guarda, 0.024]} />
      </mesh>

      {/* ── La consola de la registradora ─────────────────────────────────*/}
      <group position={[c.xDeConsola, 0, c.zDeConsola]}>
        <mesh
          position={[0, c.mesa + CHECKOUT.consola.alto / 2, 0]}
          castShadow
          material={m.oscuro}
        >
          <boxGeometry
            args={[CHECKOUT.consola.ancho, CHECKOUT.consola.alto, CHECKOUT.consola.fondo]}
          />
        </mesh>
        {/* El cajón del dinero, al frente del pupitre. */}
        <mesh
          position={[0, c.mesa + CHECKOUT.consola.alto * 0.35, -CHECKOUT.consola.fondo / 2 - 0.006]}
          material={m.acero}
        >
          <boxGeometry args={[CHECKOUT.consola.ancho - 0.06, 0.05, 0.014]} />
        </mesh>

        {/* ── El poste y la pantalla ──────────────────────────────────────
            La pantalla se apoya EN la punta del poste. Calculadas por
            separado, quedaban veinticinco centímetros de aire entre las dos y
            el monitor flotaba sobre el mostrador. */}
        <mesh position={[0, c.yConsola + CHECKOUT.poste.alto / 2, 0]} castShadow material={m.acero}>
          <cylinderGeometry
            args={[CHECKOUT.poste.radio, CHECKOUT.poste.radio, CHECKOUT.poste.alto, 12]}
          />
        </mesh>
        <group
          position={[0, c.yPantalla, 0]}
          rotation={[CHECKOUT.pantalla.caida, 0, 0]}
        >
          <mesh castShadow material={m.pantalla}>
            <boxGeometry
              args={[CHECKOUT.pantalla.ancho, CHECKOUT.pantalla.alto, CHECKOUT.pantalla.espesor]}
            />
          </mesh>
          <mesh position={[0, 0, -CHECKOUT.pantalla.espesor / 2 - 0.002]} material={m.luz}>
            <boxGeometry
              args={[CHECKOUT.pantalla.ancho - 0.03, CHECKOUT.pantalla.alto - 0.03, 0.004]}
            />
          </mesh>
        </group>
      </group>

      {/* El datáfono, del lado del cliente. */}
      <mesh
        position={[c.xDeConsola + CHECKOUT.consola.ancho * 0.75, c.mesa + 0.055, c.zDeConsola - 0.16]}
        rotation={[-0.35, 0, 0]}
        castShadow
        material={m.pantalla}
      >
        <boxGeometry args={[0.075, 0.115, 0.026]} />
      </mesh>

      {/* La franja de estado, sobre el frente del cliente. */}
      <mesh position={[0, altoDeCuerpo * 0.28, zCliente - 0.014]} material={m.estado}>
        <boxGeometry args={[w * 0.45, 0.03, 0.012]} />
      </mesh>
    </group>
  );
});
