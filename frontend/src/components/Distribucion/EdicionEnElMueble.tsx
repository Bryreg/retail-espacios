import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { planoAlDia, useDistribucionStore } from "../../store/distribucionStore";
import { selectFixtures, useFixtureStore } from "../../store/fixtureStore";
import { guiasDeCara, type Superficie } from "../../utils/superficie";
import { corteConLaCara, puntoDeLaCara, rayoTapado, uvEnElPlano, type CajaDeMueble, type V3 } from "../../utils/zonas3d";
import { conectarEdicionEnElMueble, useEditarEnEl3D, type DepsDelControl } from "./punteroEnElMueble";

/**
 * «Editar en el 3D» (fase 2 · I2): el componente R3F que engancha el control
 * del puntero (`punteroEnElMueble.ts`) al contenedor del canvas. Perezoso y
 * montado SÓLO con el interruptor prendido, dentro del nodo `zonas` que el
 * editor ya le pasa a la escena (va dentro del grupo del mueble): `Scene` no
 * cambia ni una línea.
 *
 *   · No dibuja nada: un `<group>` vacío, hijo del grupo del mueble, para leer
 *     su `matrixWorld` (el marco del mueble). Las zonas y el trazo los dibuja
 *     `ZonasDelMueble`, del store, como siempre.
 *   · El rayo sale de la cámara con las coordenadas del evento DOM y se corta
 *     con el plano de la cara en el marco del mueble (la inversa de su
 *     matriz), igual que el clic de la escena: sin mallas para el gesto (las
 *     de las zonas siguen con `raycast` nulo).
 *   · De la órbita sólo cambia el botón DERECHO, que pasa a girar (Shift +
 *     derecho corre la vista); al desmontarse lo devuelve. Nada más: ni
 *     `enabled` (la rueda sigue acercando), ni ángulos, ni distancias.
 */
export default function EdicionEnElMueble({ orbitRef, muebles, superficies }: {
  orbitRef: { readonly current: OrbitControls | null };
  /** Los muebles del plano (para `rayoTapado`; el que se distribuye se saca). */
  muebles: { readonly current: readonly (CajaDeMueble & { id: string })[] };
  /** Las superficies de las caras que se dibujan (la del servidor para la que se edita). */
  superficies: Partial<Record<"A" | "B", Superficie>>;
}) {
  const { gl, camera } = useThree();
  const grupo = useRef<THREE.Group>(null);
  const superficiesRef = useRef(superficies);
  superficiesRef.current = superficies;

  useEffect(() => {
    const contenedor = gl.domElement.parentElement;
    if (!contenedor) return;
    const orbita = orbitRef.current;
    const derechoDeAntes = orbita ? orbita.mouseButtons.RIGHT : undefined;
    if (orbita) orbita.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const inversa = new THREE.Matrix4();
    const o = new THREE.Vector3(), d = new THREE.Vector3(), p = new THREE.Vector3();

    /** El marco del mueble: la matriz del grupo vacío (sin transformación propia). */
    const matrizDelMueble = (): THREE.Matrix4 | null => {
      const g = grupo.current;
      if (!g) return null;
      g.updateWorldMatrix(true, false);
      return g.matrixWorld;
    };
    /** El rayo de la cámara por el punto del evento, en el mundo y en el marco del mueble. */
    const rayos = (ev: { clientX: number; clientY: number }): { mundo: { origen: V3; dir: V3 }; local: { origen: V3; dir: V3 } } | null => {
      const m = matrizDelMueble();
      const r = gl.domElement.getBoundingClientRect();
      if (!m || !(r.width > 0) || !(r.height > 0)) return null;
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const ro = raycaster.ray.origin, rd = raycaster.ray.direction;
      inversa.copy(m).invert();
      o.copy(ro).applyMatrix4(inversa);
      d.copy(rd).transformDirection(inversa);
      return {
        mundo: { origen: [ro.x, ro.y, ro.z], dir: [rd.x, rd.y, rd.z] },
        local: { origen: [o.x, o.y, o.z], dir: [d.x, d.y, d.z] },
      };
    };
    /** El mueble del plano (el que mira el lienzo, para las guías y la firma). */
    const muebleDe = () => {
      const a = useDistribucionStore.getState().activa;
      if (!a) return null;
      const s = useFixtureStore.getState();
      return (s.fixturesBySede[a.sede] ?? selectFixtures(s)).find((f) => f.id === a.fixtureId) ?? null;
    };

    const deps: DepsDelControl = {
      prendido: () => useEditarEnEl3D.getState().prendido,
      puedeEditar: () => {
        const { datos, cargando, edicion } = useDistribucionStore.getState();
        const sup = datos?.superficie ?? null;
        const alDia = planoAlDia(datos, muebleDe());
        const puedeEditar = !!sup && !!datos?.por_participacion && alDia && !cargando && edicion.modo === "editar";
        return puedeEditar;
      },
      caraEditada: () => useDistribucionStore.getState().activa?.cara ?? null,
      edicion: () => useDistribucionStore.getState().edicion,
      toque: (ev) => {
        const r = rayos(ev);
        const corte = r ? corteConLaCara(r.local, superficiesRef.current) : null;
        if (!r || !corte) return null;
        // Con `dir` normalizado y el marco del mueble rígido, `t` son metros
        // del mundo: lo mismo que mide `rayoTapado` (como el clic de la escena).
        const yo = useDistribucionStore.getState().activa?.fixtureId;
        const tapado = rayoTapado(r.mundo, corte.t, muebles.current.filter((f) => f.id !== yo));
        return { cara: corte.cara, u: corte.u, v: corte.v, tapado };
      },
      uvEnLaCara: (ev, cara) => {
        const sup = superficiesRef.current[cara];
        const r = sup ? rayos(ev) : null;
        const uv = sup && r ? uvEnElPlano(r.local, sup, cara) : null;
        return uv ? [uv.u, uv.v] : null;
      },
      aPantalla: (cara, q) => {
        const sup = superficiesRef.current[cara];
        const m = matrizDelMueble();
        if (!sup || !m) return null;
        const [x, y, z] = puntoDeLaCara(sup, cara, q[0], q[1]);
        p.set(x, y, z).applyMatrix4(m).project(camera);
        // Detrás de la cámara la proyección da z > 1: no sirve.
        if (!(p.z < 1) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
        const r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
      },
      guias: (cara) => {
        const mueble = muebleDe();
        return mueble ? guiasDeCara(mueble, cara) : { entrepanos: [], parantes: [] };
      },
      despachar: (a) => useDistribucionStore.getState().despachar(a),
      ponerCursor: (q) => useEditarEnEl3D.getState().ponerCursor(q),
      soltarFoco: () => {
        const activo = document.activeElement;
        if (activo instanceof HTMLElement && activo !== document.body) activo.blur();
      },
    };

    const desconectar = conectarEdicionEnElMueble(contenedor, deps);
    return () => {
      desconectar();
      if (orbita) orbita.mouseButtons.RIGHT = derechoDeAntes;
    };
  }, [gl, camera, orbitRef, muebles]);

  return <group ref={grupo} />;
}
