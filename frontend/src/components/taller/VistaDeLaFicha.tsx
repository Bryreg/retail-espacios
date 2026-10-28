import { Suspense, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FixtureMesh, FIXTURE_DEFS } from "../StoreEditor3D/StoreEditor3D";
import type { PlacedFixture } from "../StoreEditor3D/StoreEditor3D";
import { partesNumeradas, type ParteNumerada } from "../StoreEditor3D/muebles/contornos";
import { defDeModelo, paletaConPropias, type FixtureDef } from "../../catalogo/editor3D";
import { useFichasPropias } from "../../store/fichasPropias";
import { ANFITRION_SIN_ESCALA, SIN_ESCALA } from "../../escala";
import { fichaParaDibujar, type FormularioDeFicha } from "../../utils/formularioDeFicha";
import { Controles, EntornoNeutro, ParteNumeradaDelTaller, Piso, delCatalogo, tomaTresCuartos } from "./escena";

/**
 * El mueble de «Mis muebles» en 3D (2026-10-28): el que se está armando, a la
 * derecha del asistente, y las fotos de las tarjetas y de las familias.
 *
 * Se dibuja con la MISMA entrada de paleta con que se colocará
 * (`defDeModelo`, la de los editores): sus medidas, su color y su geometría
 * estampadas, como lo hacía la pestaña «Fichas» del taller.
 */

/** Lo que hace falta para dibujar una ficha: su entrada de la paleta, el
 *  mueble armado y sus partes numeradas (las que va a vender). */
export interface DibujoDeLaFicha {
  def: FixtureDef;
  fixture: PlacedFixture;
  numeradas: ParteNumerada[];
}

/** El dibujo de lo que dice el formulario, o `null` si su familia no admite
 *  fichas. Las medidas a medio escribir se dibujan metidas en el rango
 *  (`fichaParaDibujar`). */
export function dibujoDe(form: FormularioDeFicha, paleta: ReturnType<typeof paletaConPropias>): DibujoDeLaFicha | null {
  const ficha = fichaParaDibujar(form);
  const indice = ficha ? paleta.findIndex((f) => f.entrada === form.entrada) : -1;
  if (!ficha || indice < 0) return null;
  const def = defDeModelo(paleta[indice].base, ficha);
  const base = FIXTURE_DEFS[indice];
  return {
    def,
    fixture: delCatalogo(indice, def.w, def.d, def.h, "", def),
    numeradas: partesNumeradas({
      type: base.type, gondolaType: base.gondolaType, w: def.w, d: def.d, h: def.h,
      partes: def.partes, entrepanos: def.entrepanos, modulo: def.modulo,
    }),
  };
}

/** `dibujoDe` con la paleta de la sesión. */
export function useDibujoDe(form: FormularioDeFicha): DibujoDeLaFicha | null {
  const propias = useFichasPropias();
  const paleta = useMemo(() => paletaConPropias(propias), [propias]);
  return useMemo(() => dibujoDe(form, paleta), [form, paleta]);
}

/** La luz de la vista: la del banco, sin sombras en las fotos. */
function Luz({ sombras }: { sombras: boolean }) {
  return (
    <>
      <EntornoNeutro />
      <ambientLight intensity={0.2} />
      <directionalLight position={[3, 6, -4]} intensity={1.5} castShadow={sombras}
        shadow-mapSize={[1024, 1024]} shadow-camera-left={-4} shadow-camera-right={4}
        shadow-camera-top={4} shadow-camera-bottom={-4} />
      <directionalLight position={[-4, 3, 3]} intensity={0.35} />
    </>
  );
}

/** El mueble que se está armando, girable a mano. Arranca a tres cuartos,
 *  contra la cara A, y vuelve a encuadrar cuando cambia el tamaño (no con
 *  cada número: la cámara no salta mientras se escribe). */
export function VistaDeLaFicha({ dibujo, conNumeros }: { dibujo: DibujoDeLaFicha | null; conNumeros: boolean }) {
  const f = dibujo?.fixture;
  // El encuadre, redondeado a 10 cm: escribir un centímetro no mueve la cámara.
  const r = (x: number) => Math.round(x * 10) / 10;
  const [w, d, h] = f ? [r(f.w), r(f.d), r(f.h)] : [1, 1, 1];
  const camara = useMemo(() => ({ position: tomaTresCuartos(1, 1, 1).pos, fov: 42, near: 0.05, far: 100 }), []);
  return (
    <div style={ANFITRION_SIN_ESCALA}>
    <Canvas camera={camara} shadows={{ type: THREE.PCFSoftShadowMap }} dpr={[1, 1.75]}
      gl={{ antialias: true }} style={{ background: "#e4e1db" }} data-vista-ficha>
      <Suspense fallback={null}>
        <Encuadre w={w} d={d} h={h} />
        <Luz sombras />
        <Piso lado={400} />
        {dibujo && <FixtureMesh fixture={dibujo.fixture} facePaint={null} />}
        {dibujo && conNumeros && dibujo.numeradas.map((p, i) => <ParteNumeradaDelTaller key={`${p.etiqueta}-${i}`} p={p} />)}
      </Suspense>
    </Canvas>
    </div>
  );
}

/** La toma de tres cuartos contra la forma del lienzo: en la tableta la vista
 *  es baja y ancha; en la computadora, alta y angosta. */
function Encuadre({ w, d, h }: { w: number; d: number; h: number }) {
  const aspecto = useThree((s) => (s.size.height > 0 ? s.size.width / s.size.height : 1.3));
  // A la décima: un píxel de más en el lienzo no vuelve a mover la cámara.
  const a = Math.round(aspecto * 10) / 10;
  const toma = useMemo(() => tomaTresCuartos(w, d, h, a), [w, d, h, a]);
  return <Controles toma={toma} />;
}

// ─── Las fotos ───────────────────────────────────────────────────────────────
//
// Las tarjetas de «Mis muebles» y las familias del paso 1 llevan la foto de su
// mueble. Un lienzo 3D por foto serían una docena de contextos de WebGL (el
// navegador tira los más viejos pasadas las 16): las saca UN lienzo escondido,
// una por vez, y quedan guardadas mientras dure la página.

interface PedidoDeFoto { clave: string; fixture: PlacedFixture }

const fotos = new Map<string, string>();
const cola: PedidoDeFoto[] = [];
const oyentes = new Set<() => void>();
let version = 0;
const avisar = () => { version++; oyentes.forEach((o) => o()); };
const suscribir = (o: () => void) => { oyentes.add(o); return () => { oyentes.delete(o); }; };

/** La foto de un mueble (un `data:` JPEG), o `null` mientras se saca. `clave`
 *  dice qué foto es: si lo dibujado cambia, la clave tiene que cambiar. */
export function useFoto(clave: string, fixture: PlacedFixture | null): string | null {
  useEffect(() => {
    if (!fixture || fotos.has(clave) || cola.some((p) => p.clave === clave)) return;
    cola.push({ clave, fixture });
    avisar();
  }, [clave, fixture]);
  return useSyncExternalStore(suscribir, () => fotos.get(clave) ?? null, () => null);
}

/** Saca la foto cuando el mueble ya está dibujado: espera unos cuadros (el
 *  entorno y los materiales tardan uno o dos) y lee el lienzo. */
function Disparo({ pedido }: { pedido: PedidoDeFoto }) {
  const { gl, camera } = useThree();
  const cuadros = useRef(0);
  useEffect(() => {
    const { w, d, h } = pedido.fixture;
    const t = tomaTresCuartos(w, d, h, 1.5);
    camera.position.set(...t.pos);
    camera.lookAt(...t.mira);
  }, [pedido, camera]);
  useFrame(() => {
    cuadros.current++;
    if (cuadros.current !== 6) return;
    fotos.set(pedido.clave, gl.domElement.toDataURL("image/jpeg", 0.86));
    cola.shift();
    avisar();
  });
  return null;
}

/** El lienzo escondido que saca las fotos de la cola. Se monta una vez por
 *  pantalla; sin nada en la cola no hay lienzo (ni contexto de WebGL). */
export function FotografoDeMuebles() {
  useSyncExternalStore(suscribir, () => version, () => 0);
  const pedido = cola[0];
  if (!pedido) return null;
  return (
    <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, width: 360, height: 240, pointerEvents: "none", zoom: SIN_ESCALA }}>
      <Canvas dpr={1.5} gl={{ antialias: true, preserveDrawingBuffer: true }}
        camera={{ position: [2, 1.5, -2], fov: 42, near: 0.05, far: 100 }}>
        <color attach="background" args={["#e4e1db"]} />
        <Suspense fallback={null} key={pedido.clave}>
          <Luz sombras={false} />
          <Piso lado={400} />
          <FixtureMesh fixture={pedido.fixture} facePaint={null} />
          <Disparo pedido={pedido} />
        </Suspense>
      </Canvas>
    </div>
  );
}
