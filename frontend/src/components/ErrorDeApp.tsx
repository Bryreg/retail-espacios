import { Component, type ErrorInfo, type ReactNode } from "react";
import "./errorDeApp.css";

/**
 * La red de seguridad de la aplicación (auditoría pre-lanzamiento, P1-19).
 *
 * Hasta acá había límites de error sólo en el lienzo 3D, en el visor de Vender
 * y en la landing: un error de render en cualquier otra pantalla —o un pedazo
 * de JavaScript que ya no existe en el servidor— dejaba la pestaña en blanco,
 * sin un botón y sin decir qué pasó. Ahora hay dos niveles:
 *
 * - **`nivel="app"`** envuelve la aplicación entera (`main.tsx`): lo último que
 *   ataja, con «Recargar».
 * - **`nivel="modulo"`** envuelve la pantalla de cada módulo (`Dashboard.tsx`):
 *   el menú y la barra siguen andando, así que se puede ir a otro módulo sin
 *   recargar. `reinicio` (el módulo) lo vuelve a armar al cambiar de pantalla.
 *
 * **Una versión nueva publicada con la pestaña abierta.** Vite parte la app en
 * pedazos con nombre por contenido; un despliegue los reemplaza y la pestaña
 * vieja pide uno que ya no está. Eso llega como `vite:preloadError` (lo ataja
 * `instalarRecargaPorVersion`, abajo) o como un error de `import()` en un
 * `lazy()` (lo ataja este límite): las dos recargan UNA vez sola, con una marca
 * en `sessionStorage` para no entrar en un bucle si lo que falta no aparece.
 * La segunda vez se muestra la pantalla, con «Recargar».
 */

/** La marca de «ya se recargó sola por una versión nueva». Vale un rato: una
 *  pestaña que pasa el día abierta puede necesitar otra recarga más tarde. */
const MARCA_DE_RECARGA = "recabra-recarga-por-version";
const VIGENCIA_DE_LA_MARCA_MS = 5 * 60_000;

/** Ya se pidió la recarga: no vale la pena pintar el aviso medio segundo. */
let recargando = false;

/** ¿El error es un pedazo de la app que no se pudo bajar? (Chrome, Firefox y
 *  Safari lo dicen distinto; la precarga de Vite agrega el CSS.) */
export function esErrorDeCarga(error: unknown): boolean {
  const texto = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically/i.test(texto);
}

/**
 * Recarga la página si no se recargó sola hace poco. Devuelve si recargó.
 * Sin `sessionStorage` (navegación privada estricta) no se puede saber si ya
 * se intentó, así que no recarga sola: muestra la pantalla y decide la persona.
 */
export function recargarUnaVez(ahora: number = Date.now(), almacen: Pick<Storage, "getItem" | "setItem"> | null = guardaDeSesion()): boolean {
  if (!almacen) return false;
  try {
    const antes = Number(almacen.getItem(MARCA_DE_RECARGA) || 0);
    if (antes && ahora - antes < VIGENCIA_DE_LA_MARCA_MS) return false;
    almacen.setItem(MARCA_DE_RECARGA, String(ahora));
  } catch {
    return false;
  }
  recargando = true;
  if (typeof window !== "undefined") window.location.reload();
  return true;
}

function guardaDeSesion(): Storage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}

/** `vite:preloadError`: un pedazo (o su CSS) que no está. Se instala una vez,
 *  en `main.tsx`. Si recarga, cancela el error para que no se vea el aviso en
 *  el medio; si ya recargó hace poco, deja que siga y lo ataje el límite. */
export function instalarRecargaPorVersion(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", (e) => {
    if (recargarUnaVez()) e.preventDefault();
  });
}

type Props = {
  children: ReactNode;
  nivel: "app" | "modulo";
  /** El nombre de la pantalla, para el título («Indicadores no se pudo mostrar»). */
  donde?: string;
  /** Cuando cambia (otro módulo), el límite vuelve a intentar con lo nuevo. */
  reinicio?: unknown;
};

type Estado = { error: unknown; reinicio: unknown; tieneError: boolean };

export class LimiteDeError extends Component<Props, Estado> {
  state: Estado = { error: null, reinicio: this.props.reinicio, tieneError: false };

  static getDerivedStateFromError(error: unknown): Partial<Estado> {
    return { error, tieneError: true };
  }

  static getDerivedStateFromProps(props: Props, state: Estado): Partial<Estado> | null {
    // Se fue a otro módulo: lo de antes no es de esta pantalla.
    if (props.reinicio !== state.reinicio) return { reinicio: props.reinicio, error: null, tieneError: false };
    return null;
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (esErrorDeCarga(error) && recargarUnaVez()) return;
    // A la consola, con el árbol de componentes: es lo que se le pide a quien
    // avisa del error (no hay un servicio de errores del lado del navegador).
    console.error("[RECABRA] Error de pantalla", error, info.componentStack);
  }

  render() {
    if (!this.state.tieneError) return this.props.children;
    if (recargando) return <div className="error-app-espera" aria-busy="true" />;
    return (
      <PantallaDeError
        nivel={this.props.nivel}
        donde={this.props.donde}
        error={this.state.error}
        onReintentar={() => this.setState({ error: null, tieneError: false })}
      />
    );
  }
}

export function PantallaDeError({ nivel, donde, error, onReintentar }: {
  nivel: "app" | "modulo";
  donde?: string;
  error: unknown;
  onReintentar?: () => void;
}) {
  const deCarga = esErrorDeCarga(error);
  const titulo = deCarga
    ? "Hay una versión nueva de RECABRA, o se cortó la conexión"
    : donde
      ? `${donde} no se pudo mostrar`
      : "Algo falló al mostrar esta pantalla";
  const detalle = error instanceof Error ? error.message : String(error ?? "");
  const Titulo = nivel === "app" ? "h1" : "h2";
  const cuerpo = (
    <div className="error-app-tarjeta" role="alert" data-error-de-app={nivel}>
      <Titulo className="error-app-titulo">{titulo}</Titulo>
      <p>
        {deCarga
          ? "Esta pantalla no terminó de bajar. Pasa cuando se publica una versión nueva mientras la tenías abierta o cuando la red se corta. Recargá para traer la versión de hoy."
          : "Fue un error nuestro, no algo que hiciste. Lo que ya estaba guardado sigue guardado. Recargá para volver a intentarlo; si vuelve a pasar, avisanos con el detalle de abajo."}
      </p>
      <div className="error-app-acciones">
        <button type="button" className="btn-principal error-app-boton" onClick={() => window.location.reload()} data-recargar>
          Recargar
        </button>
        {nivel === "modulo" && onReintentar && !deCarga && (
          <button type="button" className="error-app-boton error-app-boton--tinta" onClick={onReintentar}>
            Probar de nuevo sin recargar
          </button>
        )}
        {nivel === "app" && (
          <a className="error-app-boton error-app-boton--tinta" href="/">Ir al comienzo</a>
        )}
      </div>
      {detalle && (
        <details className="error-app-detalle">
          <summary>Detalle para soporte</summary>
          <code>{detalle}</code>
        </details>
      )}
    </div>
  );
  return nivel === "app" ? <main className="error-app">{cuerpo}</main> : <div className="error-app error-app--modulo">{cuerpo}</div>;
}
