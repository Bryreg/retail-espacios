import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

/**
 * EL TEMA DEL INTERIOR (Fase 10 · PR 1)
 * ============================================================================
 *
 * Un interruptor, una llave, un atributo. Los valores están en `tema.css`; acá
 * sólo vive quién lo enciende.
 *
 *  · **Claro por defecto**, decisión del dueño. `prefers-color-scheme` NO se
 *    lee: si el sistema operativo está en oscuro, el interior igual abre claro.
 *    No es un descuido — el interior se usa de día, contra un plano, y el
 *    oscuro es una opción, no un default disfrazado de preferencia del sistema.
 *  · **Una sola llave**: `recabra-tema`. Antes la consola de plataforma tenía
 *    la suya (`recabra-consola-tema`) y el tablero no tenía ninguna, así que el
 *    mismo usuario podía dejar el tablero claro y la consola oscura. Ahora las
 *    dos pantallas leen y escriben esto.
 *  · **La landing no participa**: tiene su propia llave
 *    (`recabra-tema-landing`), su propio default (oscuro) y sus propios tokens
 *    bajo `.lp`. Son dos productos distintos y son dos preferencias distintas
 *    a propósito.
 *
 * El estado vive en `document.documentElement.dataset.tema`, no en un contexto
 * de React: es lo que el CSS lee, y tenerlo en dos lugares es tenerlo mal. Los
 * componentes se suscriben con `useTema()`, que es un `useSyncExternalStore`
 * sobre ese atributo — así el toggle del tablero y el de la consola se ven
 * cambiar entre sí sin que ninguno sepa del otro.
 */

export type Tema = "claro" | "oscuro";

export const LLAVE_TEMA = "recabra-tema";

/** Suscriptores del store externo. */
const oyentes = new Set<() => void>();
function avisar() {
  for (const f of oyentes) f();
}

/** Lo guardado, si hay y si se puede leer. Toda lectura de storage va en
 *  try/catch: una ventana privada tira al leer. Sin nada guardado → claro. */
export function temaInicial(): Tema {
  try {
    return window.localStorage.getItem(LLAVE_TEMA) === "oscuro" ? "oscuro" : "claro";
  } catch {
    return "claro";
  }
}

/** El tema que está puesto AHORA, leído del DOM (que es la única verdad). */
export function temaActual(): Tema {
  if (typeof document === "undefined") return "claro";
  return document.documentElement.dataset.tema === "oscuro" ? "oscuro" : "claro";
}

/** Pinta el tema en la raíz. El claro BORRA el atributo en vez de escribir
 *  `data-tema="claro"`: el claro es el default del CSS, y un atributo que
 *  significa «lo de siempre» es un atributo que alguien va a leer al revés. */
export function aplicarTema(tema: Tema): void {
  if (typeof document === "undefined") return;
  const raiz = document.documentElement;
  if (tema === "oscuro") raiz.dataset.tema = "oscuro";
  else delete raiz.dataset.tema;
  avisar();
}

export function guardarTema(tema: Tema): void {
  try {
    window.localStorage.setItem(LLAVE_TEMA, tema);
  } catch {
    /* no persiste: el cambio vale para esta visita igual */
  }
}

/** Arranque: se llama una vez desde `main.tsx`, antes del primer render, para
 *  que no haya un parpadeo de claro antes de que el oscuro se aplique. */
export function iniciarTema(): void {
  aplicarTema(temaInicial());
}

function suscribir(f: () => void) {
  oyentes.add(f);
  return () => oyentes.delete(f);
}

/** El tema puesto y la función que lo alterna (y lo guarda). */
export function useTema(): [Tema, () => void] {
  const tema = useSyncExternalStore(suscribir, temaActual, () => "claro" as Tema);
  const alternar = useCallback(() => {
    const siguiente: Tema = temaActual() === "oscuro" ? "claro" : "oscuro";
    aplicarTema(siguiente);
    guardarTema(siguiente);
  }, []);
  return [tema, alternar];
}

/**
 * El botón sol/luna de la barra del interior. Misma pieza que la de la landing
 * y misma convención: muestra el ícono del tema AL QUE SE VA, no el que está
 * puesto — un sol cuando estás en oscuro es «te llevo a claro».
 *
 * Accesible: es un `<button>` de verdad (entra en el orden de tabulación),
 * lleva `aria-label` con la acción escrita y `aria-pressed` para que un lector
 * de pantalla pueda decir en qué estado está sin depender del ícono. El foco
 * de teclado lo dibuja `.foco-tema` en `index.css` con el `--ring` del tema.
 */
export function TemaToggle({ estilo }: { estilo?: React.CSSProperties }) {
  const [tema, alternar] = useTema();
  const vaAOscuro = tema === "claro";
  return (
    <button
      type="button"
      onClick={alternar}
      className="foco-tema"
      aria-label={vaAOscuro ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
      aria-pressed={tema === "oscuro"}
      title="Claro / oscuro"
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, padding: 0,
        borderRadius: "var(--r-md)",
        background: "transparent", border: "none",
        color: "var(--ink-2)", cursor: "pointer",
        transition: "background .12s",
        ...estilo,
      }}
    >
      {vaAOscuro ? <Moon size={14} /> : <Sun size={14} />}
    </button>
  );
}

/**
 * MIENTRAS HAY UN MODAL ABIERTO, EL AMARILLO DE ATRÁS SE APAGA.
 *
 * Es la única regla de comportamiento que agrega este PR, y sale de la regla
 * del dueño: un amarillo por pantalla. Cuando un modal está arriba, ÉL es la
 * pantalla y se lleva el amarillo; si el botón principal de la pantalla de
 * atrás lo conservara, habría dos amarillos a la vez y la regla dejaría de
 * significar algo.
 *
 * Se cuenta con un contador y no con un booleano porque los modales se apilan
 * (el de consentimiento puede aparecer sobre el de configuración): con un
 * booleano, cerrar el de arriba encendería el amarillo de la pantalla aunque
 * todavía quede un modal puesto.
 */
let modalesAbiertos = 0;

/** Para un modal que se monta y se desmonta (el caso normal). */
export function useModalAbierto(): void {
  useModalAbiertoSi(true);
}

/** Para un modal que vive dentro de la pantalla y sólo aparece con una
 *  condición — un `{aviso && <div…>}` en medio de un render. Un hook no puede
 *  ir adentro del `if`, así que la condición entra como argumento. */
export function useModalAbiertoSi(activo: boolean): void {
  useEffect(() => {
    if (!activo) return;
    modalesAbiertos += 1;
    document.documentElement.dataset.modalAbierto = "1";
    return () => {
      modalesAbiertos -= 1;
      if (modalesAbiertos <= 0) {
        modalesAbiertos = 0;
        delete document.documentElement.dataset.modalAbierto;
      }
    };
  }, [activo]);
}
