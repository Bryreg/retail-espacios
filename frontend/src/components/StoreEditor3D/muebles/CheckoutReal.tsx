import { memo, useMemo } from "react";
import * as THREE from "three";
import { CHECKOUT, cotasDeCheckout } from "./medidas";
import { geometriaBandejaRedondeada, geometriaMarcoRedondeado } from "./perfiles";

/**
 * La caja registradora, contra la ficha de catálogo de una de verdad.
 *
 * ## Qué la hacía no parecerse
 *
 * La primera versión era un cajón liso con una placa oscura de cinta y **la
 * pantalla flotando en el aire**: el poste medía `posH * 0.75` y la pantalla se
 * colocaba a `posH`, así que quedaban veinticinco centímetros entre las dos.
 *
 * La segunda arregló eso y seguía sin parecerse, y puesta al lado de la ficha
 * se ve por qué. Son cinco rasgos y los cinco se leen de lejos:
 *
 * 1. **Es una L en planta.** La mesa larga con la cinta, y en el extremo de
 *    salida una estación de empaque PERPENDICULAR que se adelanta hacia el
 *    cliente, más alta que la cama y con una guarda parada atrás. Como barra
 *    recta, la caja se lee como un mostrador cualquiera.
 * 2. **El cuerpo es oscuro y las puntas claras** — carcasa de chapa grafito
 *    con dos paneles laterales claros y un parachoques corrido a media altura.
 *    Lo teníamos exactamente al revés.
 * 3. **La mesa es una bandeja hundida dentro de un bocel gordo** que da la
 *    vuelta completa y dobla EN CURVA en las puntas. Ese radio en planta es lo
 *    que hace que se lea como moldura y no como chapa cortada.
 * 4. **Del lado del cliente el zócalo está ABIERTO**, en dos bahías grandes.
 *    Ése es el espacio de impulso: chicles, pilas, revistas. Es lo más caro de
 *    la línea de cajas, y aunque la caja no se alquila, el plano tiene que
 *    mostrarlo para que se entienda el mueble.
 * 5. **La registradora se apoya en una consola** de chapa doblada con la cara
 *    inclinada, y el poste de la pantalla nace de ahí.
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
      /** La carcasa: chapa grafito. Es el color dominante del mueble. */
      carcasa: new THREE.MeshStandardMaterial({
        color: "#2b3339", metalness: 0.5, roughness: 0.52, ...comun,
      }),
      /** Los paneles de las puntas, claros: el contraste que define la ficha. */
      panel: new THREE.MeshStandardMaterial({
        color: "#8d969c", metalness: 0.45, roughness: 0.45, ...comun,
      }),
      /** El bocel, el parachoques y el zócalo: casi negro y mate. */
      bocel: new THREE.MeshStandardMaterial({
        color: "#191f23", metalness: 0.35, roughness: 0.6, ...comun,
      }),
      /** La bandeja de la cinta y el plano de empaque: laminado claro. */
      tapa: new THREE.MeshStandardMaterial({
        color: "#eceff1", metalness: 0.06, roughness: 0.42, ...comun,
      }),
      /** El fondo de las bahías abiertas. */
      hueco: new THREE.MeshStandardMaterial({
        color: "#39434a", metalness: 0.15, roughness: 0.9, ...comun,
      }),
      acero: new THREE.MeshStandardMaterial({
        color: "#aeb6bc", metalness: 0.8, roughness: 0.3, ...comun,
      }),
      pantalla: new THREE.MeshStandardMaterial({
        color: "#10151a", metalness: 0.45, roughness: 0.3, ...comun,
      }),
      estado: new THREE.MeshStandardMaterial({
        color: statusColor ?? "#64748b", metalness: 0.1, roughness: 0.6, ...comun,
      }),
    };
  }, [ghost, statusColor]);

  const c = cotasDeCheckout(w, d, h);
  const zCliente = -d / 2;
  const zCajero = d / 2;
  const topeDeCuerpo = c.mesa - CHECKOUT.bocel.alto;
  const altoDeCuerpo = topeDeCuerpo - CHECKOUT.zocalo;
  const zFrenteDeMesa = c.zDeMesa - c.fondoDeMesa / 2;
  /** Ancho del panel claro de cada punta. */
  const punta = Math.min(0.26, w * 0.16);
  // Los volúmenes se reparten el ancho SIN pisarse. Superpuestos, la carcasa
  // oscura y el panel claro ocupan el mismo espacio y la cara que gana la
  // decide el z-buffer: sale una malla rayada que titila al girar.
  const anchoDeMesa = Math.max(0.06, c.largoDeMesa - punta);
  const xMesa = -w / 2 + punta + anchoDeMesa / 2;
  const anchoDeAla = Math.max(0.06, c.largoDeAla - punta);
  const xAla = w / 2 - punta - anchoDeAla / 2;

  return (
    <group>
      {/* ── Zócalo retranqueado, bajo las dos alas de la L ────────────────*/}
      <mesh position={[c.xDeMesa, CHECKOUT.zocalo / 2, c.zDeMesa]} material={m.bocel}>
        <boxGeometry args={[c.largoDeMesa - 0.05, CHECKOUT.zocalo, c.fondoDeMesa - 0.05]} />
      </mesh>
      <mesh position={[c.xDeAla, CHECKOUT.zocalo / 2, 0]} material={m.bocel}>
        <boxGeometry args={[c.largoDeAla - 0.05, CHECKOUT.zocalo, d - 0.05]} />
      </mesh>

      {/* ── El cuerpo de la mesa larga ────────────────────────────────────
          Retranqueado al frente para dejar las bahías de impulso: el nicho
          tiene que ser un HUECO de verdad, no una caja oscura metida adentro
          del cuerpo —así sólo se ve el z-fighting de las dos caras—. */}
      <mesh
        position={[
          xMesa,
          CHECKOUT.zocalo + altoDeCuerpo / 2,
          c.zDeMesa + CHECKOUT.impulso.fondo / 2,
        ]}
        castShadow
        receiveShadow
        material={m.carcasa}
      >
        <boxGeometry
          args={[anchoDeMesa, altoDeCuerpo, Math.max(0.08, c.fondoDeMesa - CHECKOUT.impulso.fondo)]}
        />
      </mesh>
      {/* El costado exterior, claro: es la punta de la línea de cajas. */}
      <mesh
        position={[-w / 2 + punta / 2, CHECKOUT.zocalo + altoDeCuerpo / 2, c.zDeMesa]}
        castShadow
        receiveShadow
        material={m.panel}
      >
        <boxGeometry args={[punta, altoDeCuerpo, c.fondoDeMesa]} />
      </mesh>
      {/* El montante que separa las bahías de impulso. */}
      <mesh
        position={[
          xMesa + anchoDeMesa * 0.1,
          CHECKOUT.zocalo + altoDeCuerpo / 2,
          zFrenteDeMesa + CHECKOUT.impulso.fondo / 2,
        ]}
        castShadow
        material={m.carcasa}
      >
        <boxGeometry args={[0.03, altoDeCuerpo, CHECKOUT.impulso.fondo]} />
      </mesh>

      {/* ── Las bahías de impulso, del lado del cliente ───────────────────*/}
      <mesh
        position={[
          xMesa,
          CHECKOUT.zocalo + altoDeCuerpo / 2,
          zFrenteDeMesa + CHECKOUT.impulso.fondo + 0.006,
        ]}
        material={m.hueco}
      >
        <boxGeometry args={[anchoDeMesa, altoDeCuerpo, 0.012]} />
      </mesh>
      {c.yDeImpulso.map((y, i) => (
        <mesh
          key={i}
          position={[
            xMesa,
            y,
            zFrenteDeMesa + CHECKOUT.impulso.fondo / 2,
          ]}
          castShadow
          material={m.carcasa}
        >
          <boxGeometry args={[anchoDeMesa - 0.04, 0.016, CHECKOUT.impulso.fondo - 0.012]} />
        </mesh>
      ))}

      {/* El parachoques: SÓLO en los paneles de las puntas y en el frente del
          ala, que es donde está en la ficha. Corrido por delante de la mesa
          larga cruzaba las bahías de impulso por la mitad y las tapaba — y son
          justamente lo que hay que dejar ver. */}
      <mesh
        position={[xAla, CHECKOUT.zocalo + altoDeCuerpo * 0.62, zCliente - 0.014]}
        material={m.bocel}
      >
        <boxGeometry args={[anchoDeAla + punta, CHECKOUT.parachoques, 0.028]} />
      </mesh>
      <mesh
        position={[-w / 2 - 0.014, CHECKOUT.zocalo + altoDeCuerpo * 0.62, c.zDeMesa]}
        material={m.bocel}
      >
        <boxGeometry args={[0.028, CHECKOUT.parachoques, c.fondoDeMesa + 0.02]} />
      </mesh>
      <mesh
        position={[w / 2 + 0.014, CHECKOUT.zocalo + altoDeCuerpo * 0.62, 0]}
        material={m.bocel}
      >
        <boxGeometry args={[0.028, CHECKOUT.parachoques, d + 0.02]} />
      </mesh>

      {/* ── La mesa: bocel redondeado y bandeja hundida ───────────────────*/}
      <mesh
        position={[c.xDeMesa, topeDeCuerpo, c.zDeMesa]}
        castShadow
        material={m.bocel}
        geometry={geometriaMarcoRedondeado(
          c.largoDeMesa, c.fondoDeMesa,
          CHECKOUT.bocel.grosor, CHECKOUT.bocel.radio, CHECKOUT.bocel.alto,
        )}
      />
      <mesh
        position={[c.xDeMesa, c.cama - 0.014, c.zDeMesa]}
        receiveShadow
        material={m.tapa}
        geometry={geometriaBandejaRedondeada(
          c.largoDeMesa - CHECKOUT.bocel.grosor * 2 + 0.006,
          c.fondoDeMesa - CHECKOUT.bocel.grosor * 2 + 0.006,
          Math.max(0.01, CHECKOUT.bocel.radio - CHECKOUT.bocel.grosor),
          0.014,
        )}
      />
      {/* El separador de compras, que es lo que dice «esto es una cinta». */}
      <mesh
        position={[c.xDeMesa - c.largoDeMesa * 0.2, c.cama + 0.028, c.zDeMesa]}
        material={m.acero}
      >
        <boxGeometry args={[0.018, 0.05, c.fondoDeMesa - CHECKOUT.bocel.grosor * 2 - 0.08]} />
      </mesh>

      {/* ── La estación de empaque: la otra ala de la L ───────────────────*/}
      <mesh
        position={[xAla, CHECKOUT.zocalo + (c.mesaDeAla - CHECKOUT.zocalo) / 2, 0]}
        castShadow
        receiveShadow
        material={m.carcasa}
      >
        <boxGeometry args={[anchoDeAla, c.mesaDeAla - CHECKOUT.zocalo, d]} />
      </mesh>
      <mesh
        position={[w / 2 - punta / 2, CHECKOUT.zocalo + (c.mesaDeAla - CHECKOUT.zocalo) / 2, 0]}
        castShadow
        receiveShadow
        material={m.panel}
      >
        <boxGeometry args={[punta, c.mesaDeAla - CHECKOUT.zocalo, d]} />
      </mesh>
      {/* Su bocel y su plano, más altos que la cama. */}
      <mesh
        position={[c.xDeAla, c.mesaDeAla - CHECKOUT.bocel.alto, 0]}
        castShadow
        material={m.bocel}
        geometry={geometriaMarcoRedondeado(
          c.largoDeAla, d, CHECKOUT.bocel.grosor, CHECKOUT.bocel.radio, CHECKOUT.bocel.alto,
        )}
      />
      <mesh
        position={[c.xDeAla, c.mesaDeAla - 0.016, 0]}
        receiveShadow
        material={m.tapa}
        geometry={geometriaBandejaRedondeada(
          c.largoDeAla - CHECKOUT.bocel.grosor * 2 + 0.006,
          d - CHECKOUT.bocel.grosor * 2 + 0.006,
          Math.max(0.01, CHECKOUT.bocel.radio - CHECKOUT.bocel.grosor),
          0.016,
        )}
      />
      {/* La guarda parada al fondo, para que no se caiga nada del otro lado. */}
      <mesh
        position={[c.xDeAla, c.mesaDeAla + CHECKOUT.ala.guarda / 2, zCajero - 0.02]}
        castShadow
        material={m.carcasa}
      >
        <boxGeometry args={[c.largoDeAla, CHECKOUT.ala.guarda, 0.026]} />
      </mesh>
      {/* Los cajoncitos de la estación de empaque. */}
      {Array.from({ length: CHECKOUT.ala.cajones }, (_, i) => {
        const paso = (c.largoDeAla - 0.1) / CHECKOUT.ala.cajones;
        const x = c.xDeAla - (c.largoDeAla - 0.1) / 2 + paso * (i + 0.5);
        return (
          <group key={i}>
            <mesh position={[x, c.mesaDeAla - 0.17, zCliente + 0.012]} material={m.carcasa}>
              <boxGeometry args={[paso - 0.02, 0.1, 0.02]} />
            </mesh>
            <mesh position={[x, c.mesaDeAla - 0.17, zCliente - 0.002]} material={m.acero}>
              <boxGeometry args={[paso * 0.4, 0.01, 0.01]} />
            </mesh>
          </group>
        );
      })}

      {/* ── La consola de la registradora ─────────────────────────────────*/}
      <group position={[c.xDeConsola, 0, c.zDeConsola]}>
        <mesh
          position={[0, c.mesa + CHECKOUT.consola.alto / 2, 0]}
          castShadow
          material={m.carcasa}
        >
          <boxGeometry
            args={[CHECKOUT.consola.ancho, CHECKOUT.consola.alto, CHECKOUT.consola.fondo]}
          />
        </mesh>
        {/* La cara inclinada del pupitre: es lo que lo separa de una caja. */}
        <mesh
          position={[0, c.mesa + CHECKOUT.consola.alto * 0.78, -CHECKOUT.consola.fondo * 0.3]}
          rotation={[-0.5, 0, 0]}
          castShadow
          material={m.carcasa}
        >
          <boxGeometry args={[CHECKOUT.consola.ancho, 0.018, CHECKOUT.consola.fondo * 0.7]} />
        </mesh>
        {/* El respaldo parado detrás del pupitre. */}
        <mesh
          position={[0, c.mesa + CHECKOUT.consola.alto + CHECKOUT.consola.respaldo / 2, CHECKOUT.consola.fondo / 2 - 0.012]}
          castShadow
          material={m.carcasa}
        >
          <boxGeometry args={[CHECKOUT.consola.ancho, CHECKOUT.consola.respaldo, 0.02]} />
        </mesh>
        {/* El cajón del dinero. */}
        <mesh
          position={[0, c.mesa + CHECKOUT.consola.alto * 0.3, -CHECKOUT.consola.fondo / 2 - 0.007]}
          material={m.acero}
        >
          <boxGeometry args={[CHECKOUT.consola.ancho - 0.07, 0.045, 0.014]} />
        </mesh>

        {/* ── El poste y la pantalla ──────────────────────────────────────
            La pantalla se apoya EN la punta del poste. Calculadas por
            separado quedaban veinticinco centímetros de aire entre las dos. */}
        <mesh
          position={[0, c.yConsola + CHECKOUT.poste.alto / 2, 0]}
          castShadow
          material={m.acero}
        >
          <cylinderGeometry
            args={[CHECKOUT.poste.radio, CHECKOUT.poste.radio, CHECKOUT.poste.alto, 12]}
          />
        </mesh>
        <group position={[0, c.yPantalla, 0]} rotation={[CHECKOUT.pantalla.caida, 0, 0]}>
          {/* La placa VESA: el monitor va atornillado a un soporte, no pegado
              al aire. En la ficha se ve de canto y es reconocible. */}
          <mesh position={[0, 0, CHECKOUT.pantalla.espesor / 2 + 0.008]} material={m.carcasa}>
            <boxGeometry args={[0.075, 0.075, 0.016]} />
          </mesh>
          <mesh castShadow material={m.pantalla}>
            <boxGeometry
              args={[CHECKOUT.pantalla.ancho, CHECKOUT.pantalla.alto, CHECKOUT.pantalla.espesor]}
            />
          </mesh>
        </group>
      </group>

      {/* La franja de estado, sobre el panel claro de la punta. */}
      <mesh
        position={[-w / 2 + punta / 2, CHECKOUT.zocalo + altoDeCuerpo * 0.28, zFrenteDeMesa - 0.016]}
        material={m.estado}
      >
        <boxGeometry args={[punta * 0.7, 0.028, 0.012]} />
      </mesh>
    </group>
  );
});
