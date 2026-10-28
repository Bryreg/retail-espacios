import { useDeferredValue, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Box3, BoxGeometry, TOUCH, Vector3, type Group } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FixtureMesh, storeToFixtures, type PlacedFixture } from "../StoreEditor3D/StoreEditor3D";
import { useFixtureStore, selectFixtures } from "../../store/fixtureStore";

/**
 * La vista 3D del mueble elegido, dentro de su ficha del plano 2D
 * (2026-10-28, decisión del dueño).
 *
 * El 2D dibuja la huella del mueble, no su cara: los entrepaños, las puertas
 * o el módulo no se ven desde arriba. Esta miniatura dibuja el MISMO mueble
 * que el 3D (`FixtureMesh`, con lo guardado en el plano) y se actualiza sola
 * con cada cambio, así se ve cómo queda cada mueble mientras se coloca.
 * «Toda la sede» muestra la planta entera con el elegido marcado.
 *
 * Vive DENTRO del panel y no flotando sobre el lienzo: el dueño pidió que nada
 * se tape (el dibujo la ponía encima de los filtros). Perezosa: el 3D se baja
 * recién cuando se elige un mueble.
 */

type Alcance = "mueble" | "sede";

const COLOR_MARCA = "#2563eb";
const FONDO = "#e8e4dc";

const FOV = 40;
const TAN_V = Math.tan((FOV / 2) * Math.PI / 180);

/** Qué se encuadra: un mueble (de frente a la cara que se mira) o la planta
 *  entera (su caja). */
type Objetivo =
  | { que: "mueble"; w: number; h: number; d: number; cara: "A" | "B";
      /** Dónde queda lo dibujado, si no está parado en el origen. */
      centro?: [number, number]; piso?: number }
  | { que: "sede"; minX: number; maxX: number; minZ: number; maxZ: number };

/** El encuadre: adónde mira la cámara y desde dónde. Con el aspecto del
 *  lienzo, así el mueble ocupa la caja en vez de quedar chico al fondo. */
interface Encuadre { mira: [number, number, number]; desde: [number, number, number] }

function encuadrar(o: Objetivo, aspecto: number): Encuadre {
  const tanH = TAN_V * Math.max(0.5, aspecto);
  if (o.que === "mueble") {
    // De frente, apenas de costado y un poco desde arriba: que se lean los
    // entrepaños y las puertas.
    const dist = Math.max((o.w * 0.58) / tanH, (o.h * 0.62) / TAN_V, 1.2) + o.d / 2;
    // La cara A mira hacia −z (como la toma del taller y la de venta del 3D).
    const z = o.cara === "B" ? 1 : -1;
    const [cx, cz] = o.centro ?? [0, 0], y0 = o.piso ?? 0;
    return { mira: [cx, y0 + o.h * 0.46, cz], desde: [cx + o.w * 0.12, y0 + o.h * 0.62 + dist * 0.12, cz + z * dist] };
  }
  const cx = (o.minX + o.maxX) / 2, cz = (o.minZ + o.maxZ) / 2;
  const ancho = Math.max(o.maxX - o.minX, 3), fondo = Math.max(o.maxZ - o.minZ, 3);
  // Desde adelante y arriba (55°): la planta entera, sin cortar los costados.
  const dist = Math.max((ancho * 0.56) / tanH, (fondo * 0.62) / TAN_V);
  const elev = 55 * Math.PI / 180;
  return { mira: [cx, 0, cz], desde: [cx, dist * Math.sin(elev), cz + dist * Math.cos(elev)] };
}

function cajaDeLaSede(muebles: PlacedFixture[]): Objetivo {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const f of muebles) {
    const r = Math.max(f.w, f.d) / 2;
    minX = Math.min(minX, f.x - r); maxX = Math.max(maxX, f.x + r);
    minZ = Math.min(minZ, f.z - r); maxZ = Math.max(maxZ, f.z + r);
  }
  if (!Number.isFinite(minX)) return { que: "sede", minX: -2, maxX: 2, minZ: -2, maxZ: 2 };
  return { que: "sede", minX, maxX, minZ, maxZ };
}

/** La órbita a mano: GIRAR, nada más. La cámara se vuelve a
 *  poner SÓLO cuando cambia lo que se mira (`vista`: otro mueble, otra cara,
 *  «Toda la sede», otras medidas): con cada redibujo del panel —el plano que
 *  se sincroniza, el mueble que se arrastra— saltaba y se perdía lo girado. */
function Orbita({ objetivo, vista, dibujo }: {
  objetivo: Objetivo; vista: string;
  /** Lo dibujado del mueble: se encuadra lo que se ve, no la medida. */
  dibujo?: RefObject<Group>;
}) {
  const { camera, gl, invalidate, size } = useThree();
  const ctrl = useRef<OrbitControls | null>(null);
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enablePan = false;
    // La miniatura vive en la ficha, que se desplaza con la rueda: con el
    // acercamiento prendido, pasar la rueda sobre ella acercaba o alejaba la
    // cámara en vez de bajar la ficha, y unas vueltas la metían adentro del
    // mueble o la llevaban lejos — «se pierde» (el dueño, 2026-10-28). Para
    // mirarlo de cerca está «Abrir en 3D».
    c.enableZoom = false;
    // Ni por debajo del piso ni cenital: siempre se ve el mueble parado.
    c.minPolarAngle = 0.2;
    c.maxPolarAngle = Math.PI / 2 - 0.06;
    // En el teléfono un dedo desplaza la ficha (como en el resto de la
    // pantalla) y dos dedos giran el mueble.
    c.touches = { ONE: -1 as unknown as TOUCH, TWO: TOUCH.DOLLY_ROTATE };
    gl.domElement.style.touchAction = "pan-y";
    const redibujar = () => invalidate();
    c.addEventListener("change", redibujar);
    ctrl.current = c;
    return () => { c.removeEventListener("change", redibujar); c.dispose(); ctrl.current = null; };
  }, [camera, gl, invalidate]);
  // El aspecto, a la décima: un píxel de más en el lienzo no mueve la cámara.
  const clave = `${vista}|${(size.width / Math.max(1, size.height)).toFixed(1)}`;
  useEffect(() => {
    const c = ctrl.current;
    const encuadre = encuadrar(lodibujado(objetivo, dibujo?.current ?? null), size.width / Math.max(1, size.height));
    camera.position.set(...encuadre.desde);
    if (c) { c.target.set(...encuadre.mira); c.update(); } else camera.lookAt(...encuadre.mira);
    invalidate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, camera, invalidate]);
  return null;
}

/** El mueble según lo que de verdad se dibujó. La medida es la del espacio
 *  que ocupa, no la de lo que se ve: una estiba libre mide 1,40 m de alto
 *  —hasta dónde se carga— y se dibuja la tarima sola, de 15 cm. Encuadrada
 *  por la medida, la tarima quedaba abajo, chiquita, y de 1,00 × 1,00 ni
 *  entraba: la vista salía vacía (el dueño, 2026-10-28). */
function lodibujado(o: Objetivo, g: Group | null): Objetivo {
  if (o.que !== "mueble" || !g) return o;
  const caja = new Box3().setFromObject(g);
  if (caja.isEmpty()) return o;
  const t = caja.getSize(new Vector3()), m = caja.getCenter(new Vector3());
  if (t.x < 0.01 || t.y < 0.01 || t.z < 0.01) return o;
  return { ...o, w: t.x, h: t.y, d: t.z, centro: [m.x, m.z], piso: caja.min.y };
}

export default function Miniatura3D({ id, cara, onAbrir3D }: {
  id: string;
  /** La cara que se mira en el panel: la miniatura la pone de frente. */
  cara: "A" | "B";
  onAbrir3D: () => void;
}) {
  const [alcance, setAlcance] = useState<Alcance>("mueble");
  /** «Centrar»: vuelve a la toma de frente (o a la sede entera). */
  const [vuelta, setVuelta] = useState(0);
  // Diferido: mientras se arrastra en el 2D el plano cambia en cada paso, y
  // «Toda la sede» se volvía a dibujar entera con cada uno.
  const fixtures = useDeferredValue(useFixtureStore(selectFixtures));
  const muebles = useMemo(() => storeToFixtures(fixtures), [fixtures]);
  const fix = muebles.find((f) => f.id === id) ?? null;
  const objetivo = useMemo<Objetivo | null>(() => {
    if (alcance === "sede") return cajaDeLaSede(muebles);
    return fix ? { que: "mueble", w: fix.w, h: fix.h, d: fix.d, cara } : null;
  }, [alcance, muebles, fix, cara]);
  // Dónde arranca la cámara: el encuadre con el aspecto de la caja (la órbita
  // lo vuelve a poner con el de verdad apenas se mide el lienzo).
  const inicio = objetivo ? encuadrar(objetivo, 1.8) : null;
  /** Lo que se mira: cuando cambia, la cámara vuelve a su toma. */
  const vista = `${vuelta}|` + (objetivo?.que === "mueble"
    ? `mueble|${id}|${cara}|${objetivo.w.toFixed(2)}|${objetivo.h.toFixed(2)}|${objetivo.d.toFixed(2)}`
    : objetivo ? `sede|${id}|${[objetivo.minX, objetivo.maxX, objetivo.minZ, objetivo.maxZ].map((n) => n.toFixed(1)).join("|")}` : "");
  /** La cámara del lienzo, UNA: `<Canvas camera>` con un objeto nuevo en cada
   *  render hacía que react-three-fiber (8.x compara esas opciones) creara una
   *  cámara nueva con cada redibujo del panel —sin el giro de quien miraba y
   *  sin su proporción hasta el próximo cambio de tamaño—, y el mueble saltaba
   *  o desaparecía. Dónde se para la pone `Orbita`. */
  const [camara] = useState(() => ({ position: [2.5, 1.6, -3] as [number, number, number], fov: FOV, near: 0.05, far: 600 }));
  // La caja del elegido en «Toda la sede»: una por medida, y se suelta.
  const dibujo = useRef<Group>(null);
  const [cw, ch, cd] = fix ? [fix.w, fix.h, fix.d] : [0, 0, 0];
  const cajaElegida = useMemo(() => new BoxGeometry(cw + 0.12, ch + 0.06, cd + 0.12), [cw, ch, cd]);
  useEffect(() => () => cajaElegida.dispose(), [cajaElegida]);

  return (
    <div className="p2-mini3d" data-miniatura-3d>
      <div className="p2-mini3d-h">
        <b>Vista 3D</b>
        <div className="p2-seg" role="group" aria-label="Qué se ve en 3D">
          <button type="button" aria-pressed={alcance === "mueble"} onClick={() => setAlcance("mueble")}>Este mueble</button>
          <button type="button" aria-pressed={alcance === "sede"} onClick={() => setAlcance("sede")}>Toda la sede</button>
        </div>
      </div>
      <div className="p2-mini3d-lienzo">
        {fix && objetivo && inicio ? (
          <Canvas frameloop="demand" dpr={[1, 1.5]} gl={{ antialias: true }}
            camera={camara}
            style={{ background: FONDO }}>
            <ambientLight intensity={0.6} color="#fff8f0" />
            <directionalLight position={[4, 30, 6]} intensity={1.5} />
            <directionalLight position={[-6, 20, -6]} intensity={0.35} color="#fffaee" />
            <Orbita objetivo={objetivo} vista={vista} dibujo={dibujo} />
            {alcance === "mueble" ? (
              <>
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[30, 30]} />
                  <meshStandardMaterial color="#d8d4cc" roughness={0.95} />
                </mesh>
                <group ref={dibujo}><FixtureMesh fixture={fix} /></group>
              </>
            ) : (
              <>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[inicio.mira[0], 0, inicio.mira[2]]}>
                  <planeGeometry args={[400, 400]} />
                  <meshStandardMaterial color="#d8d4cc" roughness={0.95} />
                </mesh>
                {muebles.map((f) => (
                  <group key={f.id} position={[f.x, 0, f.z]} rotation={[0, f.rotY, 0]}>
                    {f.id === fix.id && (
                      <>
                        {/* El elegido: la huella pintada y su caja dibujada. */}
                        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
                          <planeGeometry args={[f.w + 0.5, f.d + 0.5]} />
                          <meshBasicMaterial color={COLOR_MARCA} transparent opacity={0.55} depthWrite={false} />
                        </mesh>
                        <lineSegments position={[0, f.h / 2 + 0.03, 0]}>
                          <edgesGeometry args={[cajaElegida]} />
                          <lineBasicMaterial color={COLOR_MARCA} />
                        </lineSegments>
                      </>
                    )}
                    <FixtureMesh fixture={f} />
                  </group>
                ))}
              </>
            )}
          </Canvas>
        ) : (
          <p className="p2-mini3d-vacio">Este mueble no tiene vista 3D.</p>
        )}
      </div>
      <div className="p2-mini3d-pie">
        <span>{alcance === "mueble" ? `Cara ${cara} · arrastrá para girarlo` : "La sede entera · el elegido, marcado"}</span>
        <button type="button" className="p2-enlace" onClick={() => setVuelta((v) => v + 1)} data-centrar-miniatura
          title="Volver a la vista de frente">Centrar</button>
        <button type="button" className="p2-enlace" onClick={onAbrir3D} data-abrir-en-3d>Abrir en 3D ↗</button>
      </div>
    </div>
  );
}
