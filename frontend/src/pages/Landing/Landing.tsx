import type React from "react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import PlanoIsometrico, { PlanoEnTabla } from "./PlanoIsometrico";
import { MiniMorfo, SalaPasos } from "./Miniaturas";
import { pesos } from "./datos";
import { quieto } from "./motor";
import "./landing.css";

/**
 * La landing pública de RECABRA — `/` para quien NO tiene sesión.
 *
 * Es la dirección **E · «La fusión»** del taller de diseño
 * (`features/landing/outputs/opciones/E-fusion/`), elegida por el dueño: la
 * estructura y la densidad de C con el gesto de A concentrado donde vale.
 * Ocho secciones; la cámara sobre el plano vive sólo en dos —el hero y «Lo que
 * hace»— y en el momento corto de «Cómo se arranca». El resto es estático y se
 * lee a la velocidad que quiera el lector.
 *
 * Quien tiene sesión no pasa por acá: `App.tsx` lo manda a su supermercado o a
 * `/plataforma`, como siempre. El login vive en `/login`, con `?invitacion=`,
 * el deep link de montaje y todo lo demás intacto.
 *
 * REGLAS DE ESTA PÁGINA (no son cosméticas):
 *  · Es pública: **cero llamadas a `/api/*`**. El plano isométrico es un
 *    supermercado inventado sembrado en `datos.ts`; ningún cliente real toca
 *    esta pantalla.
 *  · Cero recursos externos: sin fuentes web, sin imágenes, sin scripts de
 *    terceros. Entra tal cual bajo la CSP de Fase 3 y el LCP es el `<h1>`.
 *  · El texto es el de `features/landing/outputs/copy.md`, literal — salvo el
 *    titular «Recabrá cada metro.» y el subtítulo, que los trae E. Si un texto
 *    no entra en su espacio, se pide el recorte allá: el copy tiene una sola
 *    fuente y no se reescribe acá.
 *  · `prefers-reduced-motion` no apaga nada: deja la cámara **quieta**. Los
 *    encuadres siguen cambiando al bajar, pero de golpe; las capas de prueba
 *    aparecen igual. Nadie pierde una sola prueba visual.
 */

const LLAVE_TEMA = "recabra-tema-landing";

/** «Crear mi cuenta» / «Ya tengo cuenta» abren el ingreso ENCIMA de la
 *  portada (la hoja la monta `App.tsx`, que es quien conoce el login: esta
 *  página sigue sin importar ni sesión ni API). El `href` queda de respaldo
 *  para el clic con modificadores, el botón del medio y quien no tenga JS. */
function irA(modo: "login" | "registro") {
  return (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("recabra:ingresar", { detail: modo }));
  };
}

type Tema = "claro" | "oscuro";

/** El oscuro es el modo de la casa: es la estética que se está proponiendo.
 *  El claro está entero y a un clic, y queda recordado. */
function temaInicial(): Tema {
  try {
    return window.localStorage.getItem(LLAVE_TEMA) === "claro" ? "claro" : "oscuro";
  } catch {
    return "oscuro";
  }
}

/* ── piezas sueltas ───────────────────────────────────────────────────────── */

/** El cubo isométrico con las tres caras del estado. Va en línea (nada de un
 *  `.svg` externo, por la CSP). */
function Marca() {
  return (
    <svg className="mark__glyph" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M16 3 29 10.5 16 18 3 10.5Z" fill="var(--st-libre)" />
      <path d="M3 10.5 16 18v11L3 21.5Z" fill="var(--st-tomado)" opacity=".85" />
      <path d="M29 10.5 16 18v11l13-7.5Z" fill="var(--st-libera)" opacity=".7" />
    </svg>
  );
}

/** Un icono del pliego de símbolos de abajo. */
function Ico({ n, tam = 17 }: { n: string; tam?: number }) {
  return <svg width={tam} height={tam} aria-hidden="true"><use href={`#lp-i-${n}`} /></svg>;
}

/**
 * Una cifra que sube al entrar en cuadro.
 *
 * El valor final está en el HTML desde el primer pintado —no un `0` que sólo
 * se convierte en cifra si corre el JavaScript—: la animación lo baja a cero y
 * lo vuelve a subir cuando la cifra entra en pantalla. Con movimiento
 * reducido, ni eso: se queda como está.
 */
function Contador({ hasta, sufijo = "", plata = false, className, inmediato = false }: {
  hasta: number;
  sufijo?: string;
  plata?: boolean;
  className?: string;
  inmediato?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const final = (plata ? pesos(hasta) : String(hasta)) + sufijo;

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo || quieto()) return;
    let vivo = true;
    const correr = () => {
      const t0 = performance.now();
      const paso = (t: number) => {
        if (!vivo) return;
        const u = Math.min(1, (t - t0) / 1100);
        const e = 1 - Math.pow(1 - u, 4);
        const v = hasta * e;
        nodo.textContent = (plata ? pesos(v) : String(Math.round(v))) + sufijo;
        if (u < 1) requestAnimationFrame(paso);
      };
      nodo.textContent = (plata ? pesos(0) : "0") + sufijo;
      requestAnimationFrame(paso);
    };
    if (inmediato || !("IntersectionObserver" in window)) {
      correr();
      return () => { vivo = false; };
    }
    const io = new IntersectionObserver((es) => {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      correr();
    }, { threshold: 0.4 });
    io.observe(nodo);
    return () => { vivo = false; io.disconnect(); };
  }, [hasta, sufijo, plata, inmediato]);

  return <b className={className} ref={ref}>{final}</b>;
}

/** El conector que nombra, literal, el título de la sección siguiente. */
function Gancho({ n, titulo, a }: { n: string; titulo: string; a: string }) {
  return (
    <a className="hook rv" href={a}>
      <span className="hook__n">{n}</span>
      <span className="hook__t">{titulo}</span>
      <span className="hook__arrow"><Ico n="down" /></span>
    </a>
  );
}

/* ── la página ────────────────────────────────────────────────────────────── */

/** `ingreso`: el formulario de ingreso, que `App.tsx` pasa armado cuando la
 *  portada pidió entrar. Vive en la tarjeta del hero, al lado del plano, que
 *  sigue vivo: esta página no sabe qué hay adentro (ni sesión ni API). */
export default function Landing({ ingreso }: { ingreso?: ReactNode } = {}) {
  const raizRef = useRef<HTMLDivElement | null>(null);
  const progRef = useRef<HTMLElement | null>(null);
  const anilloRef = useRef<SVGCircleElement | null>(null);
  const [tema, setTema] = useState<Tema>(temaInicial);
  const [perfil, setPerfil] = useState<"g" | "t" | "p">("g");
  const [temporada, setTemporada] = useState(0);
  const [foto, setFoto] = useState(false);
  const [aviso, setAviso] = useState("");
  const [estados, setEstados] = useState(0);

  /* El tema se escribe en el `<html>` (para el fondo de la página) y en la
     raíz de la landing (para los tokens). Al desmontar se limpia: la
     aplicación de adentro tiene su propio tema y no se entera de este. */
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("lp-activa");
    html.dataset.lpTema = tema;
    return () => {
      html.classList.remove("lp-activa");
      delete html.dataset.lpTema;
    };
  }, [tema]);

  /* El pedido de ingreso puede venir del pie o de la barra: la tarjeta que lo
     muestra es la del hero, así que la página sube hasta ahí. */
  useEffect(() => {
    if (!ingreso) return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: quieto ? "auto" : "smooth" });
  }, [ingreso]);

  const cambiarTema = useCallback(() => {
    setTema((t) => {
      const siguiente: Tema = t === "oscuro" ? "claro" : "oscuro";
      try {
        window.localStorage.setItem(LLAVE_TEMA, siguiente);
      } catch {
        /* si no se puede guardar, el cambio vale para esta visita */
      }
      return siguiente;
    });
  }, []);

  /* Movimiento reducido y puntero grueso: se anotan en la raíz de la landing
     y el CSS decide. Se escuchan en vivo porque las dos cosas cambian. */
  useEffect(() => {
    const raiz = raizRef.current;
    if (!raiz) return;
    const mr = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mc = window.matchMedia("(pointer:coarse)");
    const marcar = () => {
      raiz.setAttribute("data-reducido", mr.matches ? "1" : "0");
      raiz.setAttribute("data-coarse", mc.matches ? "1" : "0");
    };
    marcar();
    mr.addEventListener("change", marcar);
    mc.addEventListener("change", marcar);
    return () => {
      mr.removeEventListener("change", marcar);
      mc.removeEventListener("change", marcar);
    };
  }, []);

  /* Revelado al bajar: una observación por bloque, no un `scroll` escuchado.
     El mismo observador enciende los medidores. Con `prefers-reduced-motion`
     el CSS ya deja todo visible; el observador igual marca `is-in` para que
     nada dependa de que haya corrido. */
  useEffect(() => {
    const raiz = raizRef.current;
    if (!raiz) return;
    const nodos = Array.from(raiz.querySelectorAll<HTMLElement>(
      ".rv, .card__demo, .timeline, .panel, .reco, .trust__it",
    ));
    const encender = (n: HTMLElement) => {
      n.classList.add("is-in");
      n.querySelectorAll<HTMLElement>(".meter[data-meter]").forEach((m) => {
        const barra = m.firstElementChild as HTMLElement | null;
        if (barra) barra.style.width = m.getAttribute("data-meter") + "%";
      });
    };
    if (!("IntersectionObserver" in window)) {
      nodos.forEach(encender);
      return;
    }
    const io = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (!e.isIntersecting) return;
        encender(e.target as HTMLElement);
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.14 });
    nodos.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  /* La barra de progreso y la navegación viva. Atributos y estilo directo: no
     hay por qué re-renderizar la página entera en cada cuadro de scroll. */
  useEffect(() => {
    const raiz = raizRef.current;
    if (!raiz) return;
    const enlaces = Array.from(raiz.querySelectorAll<HTMLAnchorElement>(".rail__nav a"));
    const secciones = enlaces.map((a) => raiz.querySelector(a.getAttribute("href") || ""));
    let pedido = false;
    const alScroll = () => {
      const h = document.documentElement;
      if (progRef.current) {
        const total = Math.max(1, h.scrollHeight - h.clientHeight);
        progRef.current.style.width = (h.scrollTop / total * 100).toFixed(1) + "%";
      }
      const y = h.scrollTop + 140;
      let cur = -1;
      secciones.forEach((s, i) => {
        if (s && s.getBoundingClientRect().top + window.scrollY <= y) cur = i;
      });
      enlaces.forEach((a, i) => a.setAttribute("aria-current", i === cur ? "true" : "false"));
    };
    const alPedir = () => {
      if (pedido) return;
      pedido = true;
      requestAnimationFrame(() => { pedido = false; alScroll(); });
    };
    alScroll();
    window.addEventListener("scroll", alPedir, { passive: true });
    return () => window.removeEventListener("scroll", alPedir);
  }, []);

  /* El anillo de ocupación se dibuja al entrar en cuadro. */
  useEffect(() => {
    const anillo = anilloRef.current;
    if (!anillo) return;
    const pintar = () => { anillo.style.strokeDashoffset = (326.7 * (1 - 0.35)).toFixed(1); };
    if (!("IntersectionObserver" in window)) { pintar(); return; }
    const io = new IntersectionObserver((e) => {
      if (!e[0].isIntersecting) return;
      pintar();
      io.disconnect();
    }, { threshold: 0.4 });
    io.observe(anillo);
    return () => io.disconnect();
  }, []);

  /* Los tres estados de la cuenta se encienden en cadena. */
  const estadosRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const caja = estadosRef.current;
    if (!caja) return;
    const relojes: number[] = [];
    const arrancar = () => {
      if (quieto()) { setEstados(3); return; }
      [0, 1, 2].forEach((i) => {
        relojes.push(window.setTimeout(() => setEstados(i + 1), i * 760));
      });
    };
    if (!("IntersectionObserver" in window)) { arrancar(); return; }
    const io = new IntersectionObserver((e) => {
      if (!e[0].isIntersecting) return;
      io.disconnect();
      arrancar();
    }, { threshold: 0.4 });
    io.observe(caja);
    return () => { io.disconnect(); relojes.forEach((r) => window.clearTimeout(r)); };
  }, []);

  /* El aviso de «Montado» se va solo. */
  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(""), 4200);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const anio = new Date().getFullYear();

  return (
    <div className="lp" ref={raizRef} data-lp-tema={tema} data-ingreso={ingreso ? "1" : undefined}>
      {/* El pliego de símbolos: todos los iconos de la página, en línea. */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
        <defs>
          <symbol id="lp-i-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></symbol>
          <symbol id="lp-i-minus" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M5 12h14" /></symbol>
          <symbol id="lp-i-target" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="6.5" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /></symbol>
          <symbol id="lp-i-cube" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></symbol>
          <symbol id="lp-i-map" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3V7z" /><path d="M9 4v13M15 7v13" /></symbol>
          <symbol id="lp-i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></symbol>
          <symbol id="lp-i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" /></symbol>
          <symbol id="lp-i-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></symbol>
          <symbol id="lp-i-down" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v13M6 12l6 6 6-6" /></symbol>
          <symbol id="lp-i-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></symbol>
          <symbol id="lp-i-mail" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 7l8.5 6 8.5-6" /></symbol>
          <symbol id="lp-i-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><rect x="4.5" y="10" width="15" height="10" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></symbol>
          <symbol id="lp-i-camera" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M3 8.5h3.5L8 6h8l1.5 2.5H21v10H3z" /><circle cx="12" cy="13" r="3.2" /></symbol>
          <symbol id="lp-i-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.5l5 5 10-11" /></symbol>
          <symbol id="lp-i-doc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></symbol>
          <symbol id="lp-i-cal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></symbol>
          <symbol id="lp-i-tag" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M11 3H4v7l10 10 7-7L11 3z" /><circle cx="7.6" cy="7.6" r="1.3" /></symbol>
          <symbol id="lp-i-bell" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M6 9a6 6 0 1112 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9z" /><path d="M10 18.5a2.2 2.2 0 004 0" /></symbol>
          <symbol id="lp-i-chart" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19h16M7 16V9M12 16V5M17 16v-5" /></symbol>
          <symbol id="lp-i-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /></symbol>
          <symbol id="lp-i-grid" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.4" /></symbol>
        </defs>
      </svg>

      <a href="#contenido" className="skip">Ir al contenido</a>

      <div className="deco" aria-hidden="true">
        <div className="deco__veil" />
        <div className="deco__grid" />
      </div>

      {/* ═══ LA BARRA: navegación viva, cifras y progreso ═══ */}
      <header className="rail">
        <div className="wrap">
          <div className="rail__in">
            <a className="mark" href="#top" aria-label="RECABRA, inicio">
              <Marca />
              <span className="mark__txt">RECABRA</span>
            </a>
            <nav className="rail__nav" aria-label="Secciones">
              <a href="#que-hace">Funciones</a>
              <a href="#para-quien">Para quién</a>
              <a href="#como-se-usa">Implementación</a>
              <a href="#precio">Precio</a>
            </nav>
            <div className="rail__live" aria-hidden="true">
              <span className="rail__kv"><Contador hasta={7} inmediato /><span>libres</span></span>
              <span className="rail__kv"><Contador hasta={3} inmediato /><span>se liberan</span></span>
              <span className="rail__kv"><Contador hasta={6} inmediato /><span>tomados</span></span>
            </div>
            <div className="rail__acts">
              <button className="iconbtn" type="button" onClick={cambiarTema}
                aria-label={tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                title="Claro / oscuro">
                <Ico n={tema === "oscuro" ? "sun" : "moon"} tam={18} />
              </button>
              <a className="btn btn--primary btn--sm" href="/login#registro" onClick={irA("registro")}>Crear mi cuenta</a>
            </div>
            <div className="rail__prog" aria-hidden="true"><i ref={progRef} /></div>
          </div>
        </div>
      </header>

      <main id="contenido">
        {/* ═══ EL FILM: hero + «Lo que hace», sobre una sola sala ═══ */}
        <div className="film">
          <PlanoIsometrico />

          <div className="script">
            {/* ─ HERO ─ */}
            <section className="panel panel--hero" data-scene="hero" id="top">
              {ingreso ? (
                <div className="card card--ingreso">{ingreso}</div>
              ) : (
              <div className="card">
                <p className="mark__txt" style={{ display: "block", marginBottom: 10 }}>RECABRA</p>
                <p className="eyebrow">Espacios comerciales de supermercado</p>
                <h1 style={{ margin: "10px 0 14px" }}>Recabre cada metro.</h1>
                <p className="lead" style={{ marginBottom: 14 }}>
                  Qué mueble está <span style={{ color: "var(--st-libre)" }}>libre</span>,
                  {" "}quién lo <span style={{ color: "var(--st-tomado)" }}>ocupa</span>,
                  {" "}<span style={{ color: "var(--signal-ink)" }}>a cuánto</span> y
                  {" "}<span style={{ color: "var(--st-libera)" }}>hasta cuándo</span>.
                </p>
                <p className="body">
                  RECABRA es el sistema con el que un supermercado administra y comercializa sus
                  espacios de exhibición. Cada sede se representa en un plano, se define qué muebles
                  son alquilables y el contrato se registra sobre el mueble.
                </p>
                <p className="body" style={{ marginTop: "var(--s3)" }}>
                  Cuando esa información está repartida entre hojas de cálculo, conversaciones y
                  la memoria de cada persona, deja de ser administrable.
                </p>
                <div className="cta-row">
                  <a className="btn btn--primary" href="/login#registro" onClick={irA("registro")}>Crear mi cuenta</a>
                  <a className="btn btn--ghost" href="/login" onClick={irA("login")}>Ya tengo cuenta</a>
                </div>
                <p className="fine">
                  El registro se hace con correo corporativo o con Google, y toma menos de un minuto.
                </p>
                <p className="fine">
                  Los datos del plano son ilustrativos. No corresponden a ningún supermercado real.
                </p>
              </div>
              )}
            </section>

            {/* ─ 01 · LO QUE HACE ─ */}
            <section className="panel panel--corto" data-scene="qh-intro" id="que-hace">
              <div className="card">
                <p className="sec__num mono">01 / FUNCIONES</p>
                <h2 style={{ margin: "8px 0 12px" }}>Funciones</h2>
                <p className="lead">Seis funciones, todas implementadas y en operación.</p>
                <p className="card__foot">
                  Seis tarjetas. El plano contiguo acompaña cada una: acerca el mueble
                  correspondiente, lo repinta, lo separa en dos caras y despliega los avisos.
                </p>
              </div>
            </section>

            <article className="panel" data-scene="qh-1">
              <div className="card">
                <span className="num">01 <b>/</b> 06</span>
                <span className="card__i"><Ico n="map" /></span>
                <h3>El inventario como plano, no como lista de códigos</h3>
                <p className="body">
                  Cada sede se representa tal como está distribuida: góndolas, puntas, islas,
                  neveras, bateas y cajas. Cada mueble conserva su código y sus medidas, y el plano
                  muestra el estado de ocupación. Cuando el proveedor necesita evaluar cómo quedará
                  la exhibición, la misma sede puede recorrerse en 3D.
                </p>
                <div className="card__demo"><MiniMorfo /></div>
                <p className="card__foot">Plano 2D · vista 3D · una sola nomenclatura para toda la cadena</p>
              </div>
            </article>

            <article className="panel" data-scene="qh-2">
              <div className="card">
                <span className="num">02 <b>/</b> 06</span>
                <span className="card__i"><Ico n="doc" /></span>
                <h3>El contrato se registra sobre el mueble</h3>
                <p className="body">
                  Al seleccionar el espacio se completa una sola ficha: proveedor, marca, canon
                  mensual y vigencia. Si el acuerdo cubre tres puntas de góndola, se seleccionan las
                  tres y se genera un único contrato. El formulario calcula el total del plazo, que
                  es el valor que se firma: $ 1.500.000 mensuales por 61 días equivalen a
                  $ 3.050.000, sin necesidad de calcularlo durante la negociación.
                </p>
                <div className="card__demo">
                  <div className="mini">
                    <div className="mini__bar"><span>Ficha del contrato</span></div>
                    <div className="mini__body">
                      <div className="kvrow"><span>Canon mensual</span><b>$ 1.500.000</b></div>
                      <div className="kvrow"><span>Plazo</span><b>61 días</b></div>
                      <div className="total">
                        <span className="tiny" style={{ textTransform: "uppercase", letterSpacing: ".12em" }}>Total del plazo</span>
                        <Contador hasta={3050000} plata />
                      </div>
                    </div>
                  </div>
                </div>
                <p className="card__foot">Un proveedor, un periodo, los espacios que el acuerdo requiera</p>
              </div>
            </article>

            <article className="panel" data-scene="qh-3">
              <div className="card">
                <span className="num">03 <b>/</b> 06</span>
                <span className="card__i"><Ico n="cal" /></span>
                <h3>Disponibilidad por temporada comercial</h3>
                <p className="body">
                  Al seleccionar el periodo —Amor y Amistad, Halloween, Black Friday, Navidad,
                  regreso a clases— el plano se recalcula para esas fechas: disponible durante todo
                  el periodo, con liberación intermedia, u ocupado. Un panel indica cuántos espacios
                  quedan disponibles según la fecha de inicio del contrato. Un mueble que se
                  desocupa el 25 es inventario comercializable desde hoy.
                </p>
                <div className="card__demo">
                  <div className="chips" role="group" aria-label="Temporada de ejemplo">
                    {["Amor y Amistad", "Halloween", "Black Friday", "Navidad"].map((t, i) => (
                      <button key={t} className="chip" type="button" aria-pressed={temporada === i}
                        onClick={() => setTemporada(i)}>{t}</button>
                    ))}
                  </div>
                  <GridTemporada n={temporada} />
                </div>
                <p className="card__foot">
                  Nueve temporadas del calendario comercial colombiano, con la ventana de venta que
                  cada supermercado defina
                </p>
              </div>
            </article>

            <article className="panel" data-scene="qh-4">
              <div className="card">
                <span className="num">04 <b>/</b> 06</span>
                <span className="card__i"><Ico n="tag" /></span>
                <h3>Tarifa de referencia y desviación</h3>
                <p className="body">
                  Se registra una tarifa por tipo de mueble, con ajuste por sede cuando una tienda
                  tiene mayor valor comercial. Al registrar el valor de un contrato, el sistema
                  muestra la referencia y la desviación: «−17 % vs referencia». El tablero lista los
                  contratos por debajo de tarifa para revisarlos en la próxima renovación.
                </p>
                <div className="card__demo">
                  <div className="mini">
                    <div className="mini__bar">
                      <span>Valor del contrato</span>
                      <span style={{ marginLeft: "auto", color: "var(--st-libera)" }}>−17 % vs referencia</span>
                    </div>
                    <div className="mini__body">
                      <div className="meter" data-meter="83"><i /></div>
                      <div className="kvrow" style={{ border: 0, paddingTop: 10 }}>
                        <span>Tarifa de referencia</span><b>$ 1.150.000</b>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="card__foot">La tarifa la ve el administrador. El mercaderista no ve un solo peso.</p>
              </div>
            </article>

            <article className="panel" data-scene="qh-5">
              <div className="card">
                <span className="num">05 <b>/</b> 06</span>
                <span className="card__i"><Ico n="bell" /></span>
                <h3>Notificaciones automáticas</h3>
                <p className="body">
                  Al guardar un contrato se envían tres correos distintos: el área comercial recibe
                  el acuerdo con el valor, el mercaderista recibe la orden de montaje sin ningún
                  monto y con el enlace para reportar, y el proveedor recibe la constancia de su
                  acuerdo. Antes del vencimiento el sistema notifica tres veces: a 30, 15 y 6 días.
                  Con una semana de margen ya no queda espacio para renegociar; con un día, el aviso
                  solo informa un hecho consumado.
                </p>
                <div className="card__demo">
                  <div style={{ display: "grid", gap: 6 }}>
                    <div className="mailrow"><Ico n="mail" tam={14} /><b>Comercial</b> acuerdo <span className="mailrow__tag">con valor</span></div>
                    <div className="mailrow"><Ico n="mail" tam={14} /><b>Mercaderista</b> montaje <span className="mailrow__tag mailrow__tag--none">sin valor</span></div>
                    <div className="mailrow"><Ico n="mail" tam={14} /><b>Proveedor</b> constancia <span className="mailrow__tag">de lo suyo</span></div>
                  </div>
                  <div className="timeline" aria-hidden="true">
                    <span className="timeline__n">30</span><span className="timeline__l"><i /></span>
                    <span className="timeline__n">15</span><span className="timeline__l"><i /></span>
                    <span className="timeline__n">6</span>
                  </div>
                </div>
                <p className="card__foot">
                  Al acercarse el vencimiento, la acción Renovar llega precargada con el proveedor,
                  la marca y el valor vigente.
                </p>
              </div>
            </article>

            <article className="panel" data-scene="qh-6">
              <div className="card">
                <span className="num">06 <b>/</b> 06</span>
                <span className="card__i"><Ico n="camera" /></span>
                <h3>Confirmación de montaje con evidencia fotográfica</h3>
                <p className="body">
                  El correo del mercaderista incluye un enlace que abre directamente en el espacio
                  asignado. Sin contraseña y sin acceso al tablero de la tienda: únicamente el
                  mueble, su ubicación —«a unos 4 m de las cajas», señalada sobre el plano de la
                  sala— y dos acciones. «Montado» exige fotografía. «No pude» exige motivo: sin
                  motivo registrado no hay responsable identificable.
                </p>
                <div className="card__demo">
                  <div className="demo6">
                    <div className="fono">
                      <div className="fono__top"><i /></div>
                      <div className="fono__in">
                        <p className="fono__code">PUN-01</p>
                        <p className="fono__where">Punta de góndola · sede CENTRO<br />a unos 4 m de las cajas</p>
                        <div className="fono__shot" data-on={foto ? "true" : "false"}>
                          <svg viewBox="0 0 160 76" style={{ display: "block", width: "100%", height: "100%" }} aria-hidden="true">
                            <defs>
                              <linearGradient id="lp-ph" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0" stopColor="var(--st-libera)" stopOpacity=".35" />
                                <stop offset="1" stopColor="var(--signal)" stopOpacity=".22" />
                              </linearGradient>
                            </defs>
                            <rect width="160" height="76" fill="url(#lp-ph)" />
                            <g fill="var(--fg)" opacity=".22">
                              <rect x="18" y="16" width="34" height="10" rx="2" /><rect x="18" y="32" width="34" height="10" rx="2" /><rect x="18" y="48" width="34" height="10" rx="2" />
                              <rect x="62" y="16" width="34" height="10" rx="2" /><rect x="62" y="32" width="34" height="10" rx="2" /><rect x="62" y="48" width="34" height="10" rx="2" />
                              <rect x="106" y="16" width="34" height="42" rx="2" />
                            </g>
                          </svg>
                        </div>
                        <div className="fono__btns">
                          <button className="fono__b fono__b--ok" type="button"
                            onClick={() => {
                              setFoto((f) => {
                                if (!f) setAviso("Montaje confirmado con foto · PUN-01, sede CENTRO");
                                return !f;
                              });
                            }}>
                            <Ico n="check" tam={14} /> Montado
                          </button>
                          <button className="fono__b fono__b--no" type="button" disabled>No pude</button>
                        </div>
                      </div>
                    </div>
                    <p className="tiny demo6__side">
                      «Montado» exige fotografía: sin fotografía no hay montaje reportado. Puede
                      probarlo en el ejemplo.
                    </p>
                  </div>
                </div>
                <p className="card__foot">
                  La fotografía queda archivada. Es el respaldo ante un reclamo del proveedor meses
                  después.
                </p>
              </div>
            </article>

            <section className="panel panel--corto" data-scene="qh-cierre">
              <div className="card">
                <p className="lead">
                  Además: la temporada completa puede cargarse desde una planilla de Excel y
                  revisarse fila por fila antes de crear ningún contrato, todas las sedes se
                  administran desde la misma cuenta, y cada integrante del equipo se incorpora con
                  el nivel de permiso que le corresponde.
                </p>
                <a className="hook" href="#para-quien">
                  <span className="hook__n">02</span>
                  <span className="hook__t">Tres perfiles, tres vistas distintas del mismo sistema</span>
                  <span className="hook__arrow"><Ico n="down" /></span>
                </a>
              </div>
            </section>
          </div>
        </div>

        <PlanoEnTabla />

        {/* ═══ 02 · PARA QUIÉN ═══ */}
        <section className="wrap sec" id="para-quien">
          <header className="sec__head rv">
            <p className="sec__num mono">02 / PARA QUIÉN</p>
            <h2>Tres perfiles, tres vistas distintas del mismo sistema</h2>
          </header>

          <div className="roles">
            <div className="roles__tabs" role="tablist" aria-label="Perfiles">
              <Perfil id="g" activo={perfil} onElegir={setPerfil}
                rot="Gerente o administrador" titulo="Decide con datos a la vista">
                Dispone del plano, los valores y el calendario en una sola pantalla. Registra el
                contrato, fija el precio con la tarifa de referencia a la vista y conoce qué vence
                el mes siguiente. Puede mostrar el plano al proveedor durante la negociación: esa
                pantalla no expone el nombre ni el canon de ningún otro proveedor.
              </Perfil>
              <Perfil id="t" activo={perfil} onElegir={setPerfil}
                rot="Trabajador de piso" titulo="Ejecuta y reporta, sin acceso a valores">
                Recibe un correo con el espacio asignado y un enlace que abre en su teléfono.
                Confirma con una fotografía o registra el motivo del incumplimiento. No accede con
                contraseña compartida ni ve valores: el servidor los suprime antes de enviar la
                pantalla.
              </Perfil>
              <Perfil id="p" activo={perfil} onElegir={setPerfil}
                rot="Proveedor" titulo="Recibe constancia de lo contratado">
                Recibe por correo la constancia de su acuerdo: qué espacios, en qué sede y con qué
                vigencia. Antes de firmar puede visualizar el mueble en 3D con su marca aplicada, en
                una lámina de antes y después que se adjunta al envío.
              </Perfil>
            </div>

            <div className="glasscard rv rv-2" style={{ overflow: "hidden" }}>
              <div className="pbar">
                <span className="pbar__dots"><i /><i /><i /></span>
                <span>{perfil === "g" ? "Pantalla del gerente" : perfil === "t" ? "Pantalla del trabajador de piso" : "Correo del proveedor"}</span>
                <span className="pbar__sp" /><span>Supermercado de ejemplo</span>
              </div>

              <div className="rpane" id="lp-pane-g" role="tabpanel" aria-labelledby="lp-tab-g" data-on={perfil === "g"}>
                <div className="mini">
                  <div className="mini__bar"><span>Sede CENTRO · 1 → 30 de septiembre</span></div>
                  <div className="mini__body">
                    <div className="kvrow"><span>PUN-01 · Punta de góndola</span><b>Bebidas Zafiro</b></div>
                    <div className="kvrow"><span>Canon mensual</span><b>$ 1.300.000</b></div>
                    <div className="kvrow"><span>Tarifa de referencia</span><b>$ 1.150.000</b></div>
                    <div className="kvrow"><span>Hasta</span><b>28 sep</b></div>
                  </div>
                </div>
                <div className="chips">
                  <span className="chip"><i className="dot dot--libre" aria-hidden="true" style={{ marginRight: 6 }} />7 libres</span>
                  <span className="chip"><i className="dot dot--libera" aria-hidden="true" style={{ marginRight: 6 }} />3 se liberan</span>
                  <span className="chip"><i className="dot dot--tomado" aria-hidden="true" style={{ marginRight: 6 }} />6 tomados</span>
                </div>
                <p className="tiny">Proveedor y valores de ejemplo</p>
              </div>

              <div className="rpane" id="lp-pane-t" role="tabpanel" aria-labelledby="lp-tab-t" data-on={perfil === "t"}>
                <div className="mini">
                  <div className="mini__bar"><span>Enlace de montaje · sin contraseña</span></div>
                  <div className="mini__body">
                    <div className="kvrow"><span>PUN-01 · Punta de góndola</span><b>sede CENTRO</b></div>
                    <div className="kvrow"><span>Dónde queda</span><b>a unos 4 m de las cajas</b></div>
                    <div className="kvrow"><span>Canon mensual</span><b><span className="redact">$ 1.300.000</span></b></div>
                    <div className="kvrow"><span>Proveedor</span><b><span className="redact">Bebidas Zafiro</span></b></div>
                  </div>
                </div>
                <div className="fono__btns" style={{ maxWidth: 280 }}>
                  <span className="fono__b fono__b--ok"><Ico n="check" tam={14} /> Montado</span>
                  <span className="fono__b fono__b--no">No pude</span>
                </div>
                <p className="tiny">El servidor suprime los valores antes de enviar la pantalla.</p>
              </div>

              <div className="rpane" id="lp-pane-p" role="tabpanel" aria-labelledby="lp-tab-p" data-on={perfil === "p"}>
                <div className="mini">
                  <div className="mini__bar"><Ico n="mail" tam={13} /><span>Constancia del acuerdo</span></div>
                  <div className="mini__body">
                    <div className="kvrow"><span>Proveedor</span><b>Bebidas Zafiro</b></div>
                    <div className="kvrow"><span>Espacios</span><b>PUN-01 · BEB-01</b></div>
                    <div className="kvrow"><span>Sede</span><b>CENTRO</b></div>
                    <div className="kvrow"><span>Desde / hasta</span><b>1 sep → 28 sep</b></div>
                  </div>
                </div>
                <p className="tiny">Proveedor y valores de ejemplo</p>
              </div>
            </div>
          </div>

          <div className="glasscard rv" style={{ marginTop: 40, overflow: "hidden" }}>
            <div className="pbar">
              <span className="pbar__dots"><i /><i /><i /></span>
              Los indicadores disponibles en el tablero
              <span className="pbar__sp" /><span>Ocupación · ejemplo</span>
            </div>
            <div className="pad">
              <p className="lead" style={{ marginBottom: 24 }}>
                No son proyecciones. Son las cifras que el tablero calcula sobre los datos cargados.
              </p>
              <div className="readout">
                <div className="readout__hero">
                  <div className="readout__ring">
                    <svg viewBox="0 0 120 120" style={{ width: "100%", height: "100%" }} aria-hidden="true">
                      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--brd)" strokeWidth="9" />
                      <circle ref={anilloRef} cx="60" cy="60" r="52" fill="none" stroke="var(--signal)" strokeWidth="9"
                        strokeLinecap="round" strokeDasharray="326.7" strokeDashoffset="326.7"
                        transform="rotate(-90 60 60)"
                        style={{ transition: "stroke-dashoffset 1200ms cubic-bezier(.16,.84,.44,1)" }} />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                      <Contador className="fig" hasta={35} sufijo=" %" />
                    </div>
                  </div>
                  <p className="tiny">8 de 23 caras vendidas en el periodo</p>
                </div>
                <ul>
                  <li className="rrow"><span className="rrow__k"><i className="dot dot--libre" aria-hidden="true" />Ocupación</span><span className="rrow__v">35 % · 8 de 23 caras vendidas en el periodo</span></li>
                  <li className="rrow"><span className="rrow__k"><i className="dot dot--tomado" aria-hidden="true" />Canon vigente</span><span className="rrow__v">ingreso mensual de los contratos vigentes</span></li>
                  <li className="rrow"><span className="rrow__k"><i className="dot dot--libre" aria-hidden="true" />Sin alquilar</span><span className="rrow__v">valor a tarifa de los espacios desocupados, y su equivalente por día</span></li>
                  <li className="rrow"><span className="rrow__k"><i className="dot dot--libera" aria-hidden="true" />Vence en 30 días</span><span className="rrow__v">espacios e ingreso mensual que se pierden si no se renuevan</span></li>
                  <li className="rrow"><span className="rrow__k"><i className="dot dot--resto" aria-hidden="true" />Sin montar</span><span className="rrow__v">contratos ya facturados cuyo montaje aún no se ha ejecutado</span></li>
                </ul>
              </div>
              <p className="body" style={{ marginTop: 24 }}>
                Un contrato que cubre tres puntas de góndola se registra una vez, no tres.
              </p>
            </div>
          </div>

          <Gancho n="03" titulo="Cómo se implementa" a="#como-se-usa" />
        </section>

        {/* ═══ 03 · IMPLEMENTACIÓN ═══ */}
        <section className="sec" id="como-se-usa" style={{ paddingBottom: 0 }}>
          <div className="wrap">
            <header className="sec__head rv">
              <p className="sec__num mono">03 / IMPLEMENTACIÓN</p>
              <h2>Cómo se implementa</h2>
              <p className="lead">
                Tres etapas. La primera toma un minuto; la segunda concentra el trabajo de
                levantamiento y se realiza una sola vez.
              </p>
            </header>
          </div>

          <SalaPasos>
            <ol className="pasos">
              <li className="paso" data-on="true">
                <span className="paso__pipe"><i /></span>
                <span className="paso__n">1</span>
                <h3 className="h4">Creación de la cuenta y del supermercado</h3>
                <p className="body">
                  El registro se hace con Google o con correo corporativo. Quien crea la cuenta
                  queda como titular y desde ahí incorpora al equipo: cada integrante con su propio
                  correo y con el nivel de permiso que le corresponde.
                </p>
                <div className="chips" style={{ marginTop: 6 }}>
                  <span className="chip chip--stat">dueño de la cuenta</span>
                  <span className="chip chip--stat">administrador</span>
                  <span className="chip chip--stat">trabajador de piso</span>
                </div>
              </li>
              <li className="paso" data-on="false">
                <span className="paso__pipe"><i /></span>
                <span className="paso__n">2</span>
                <h3 className="h4">Levantamiento del plano de cada sede</h3>
                <p className="body">
                  Los muebles se ubican según la distribución real de la sala y se marca cuáles son
                  alquilables. Cajas y columnas quedan como referencia, en gris. Si los contratos de
                  la temporada ya existen en una planilla, se cargan en un solo paso: el sistema
                  reporta fila por fila cuáles proceden y cuáles presentan conflicto, antes de crear
                  ningún registro.
                </p>
              </li>
              <li className="paso" data-on="false">
                <span className="paso__pipe"><i /></span>
                <span className="paso__n">3</span>
                <h3 className="h4">Comercialización sobre el plano</h3>
                <p className="body">
                  Se selecciona la temporada, se identifican los espacios disponibles y se registra
                  el contrato sobre el mueble. Al guardar se envían los tres correos y el espacio
                  cambia de estado en el plano.
                </p>
              </li>
            </ol>
          </SalaPasos>

          <div className="wrap">
            <p className="small rv" style={{ marginTop: 20 }}>
              Cada supermercado inicia con el sistema vacío. RECABRA no incorpora datos de terceros.
            </p>
            <Gancho n="04" titulo="Modelo comercial" a="#precio" />
          </div>
        </section>

        {/* ═══ 04 · PRECIO ═══ */}
        <section className="wrap sec" id="precio">
          <header className="sec__head rv">
            <p className="sec__num mono">04 / PRECIO</p>
            <h2>Modelo comercial</h2>
          </header>

          <div className="precio">
            <div className="glasscard rv rv-1" style={{ overflow: "hidden" }}>
              <div className="pbar"><span className="pbar__dots"><i /><i /><i /></span>Modelo comercial</div>
              <div className="pad">
                <p className="precio__tag"><span className="slot">[COMPLETAR: precio]</span></p>
                <p className="small">
                  <span className="slot" style={{ fontSize: ".85em" }}>
                    [COMPLETAR: unidad — por supermercado al mes, por sede al mes, o lo que corresponda]
                  </span>
                </p>
                <p className="body" style={{ marginTop: 20 }}>
                  Pago por transferencia bancaria contra cuenta de cobro. No se utiliza pasarela de
                  pagos ni se solicitan datos de tarjeta.
                </p>
                <p className="body" style={{ marginTop: 20 }}>
                  Para cadenas regionales o multisede, escríbanos a
                  <span className="slot">[COMPLETAR: correo de contacto]</span> y evaluamos el
                  alcance en conjunto.
                </p>
                {/* Mientras el correo de contacto sea un [COMPLETAR] del dueño (copy §15),
                    «Hablemos» lleva al registro en vez de a un `mailto:` vacío: un botón
                    primario que no hace nada es peor que uno que abre la puerta. */}
                <p style={{ marginTop: 20 }}>
                  <a className="btn btn--primary" href="/login#registro" onClick={irA("registro")}>Hablemos</a>
                </p>
              </div>
            </div>
            <div className="rv rv-2">
              <div className="estados" ref={estadosRef}>
                <div className="estado" data-on={estados > 0}><span className="estado__d" /><p className="estado__t">Primer aviso en pantalla; el servicio continúa sin cambios.</p></div>
                <div className="estado" data-on={estados > 1}><span className="estado__d" /><p className="estado__t">Si la mora persiste, la cuenta pasa a solo lectura: se conserva el acceso y la consulta, pero no se registran contratos nuevos.</p></div>
                <div className="estado" data-on={estados > 2}><span className="estado__d" /><p className="estado__t">Los datos no se eliminan en ningún caso. Regularizada la cuenta, la operación se reanuda donde quedó.</p></div>
              </div>
            </div>
          </div>

          <Gancho n="05" titulo="Empiece por una sede" a="#cierre" />
        </section>

        {/* ═══ 05 · CIERRE ═══ */}
        <section className="wrap cierre" id="cierre">
          <div className="beam" aria-hidden="true" />
          <h2 className="rv">Empiece por una sede</h2>
          <p className="lead rv rv-1" style={{ maxWidth: "56ch" }}>
            Comience por la sede con mayor volumen de espacios comercializables y evalúe la
            disponibilidad de esta temporada. Si el resultado es útil, incorpore las demás.
          </p>
          <div className="cierre__cta rv rv-2">
            <a className="btn btn--primary" href="/login#registro" onClick={irA("registro")}>Crear mi cuenta</a>
            <a className="btn btn--ghost" href="/login" onClick={irA("login")}>Ya tengo cuenta</a>
          </div>
          <p className="small rv rv-3">
            Registro con Google o con correo corporativo. El plano de esta página es un ejemplo;
            el de cada supermercado se levanta con sus propias sedes.
          </p>
        </section>
      </main>

      <footer className="pie">
        <div className="wrap">
          <div className="pie__grid">
            <div className="pie__col">
              <a className="mark" href="#top" style={{ marginBottom: 12 }}>
                <Marca />
                <span className="mark__txt">RECABRA</span>
              </a>
              <p className="small">RECABRA · Gestión de espacios comerciales en supermercados</p>
              <p style={{ marginTop: 14 }}>
                <a className="lnk" href="#top">Volver arriba <span className="lnk__up"><Ico n="arrow" tam={14} /></span></a>
              </p>
            </div>
            <div className="pie__col">
              <h4>Producto</h4>
              <ul>
                <li><a href="#que-hace">Funciones</a></li>
                <li><a href="#como-se-usa">Implementación</a></li>
                <li><a href="#precio">Precio</a></li>
              </ul>
            </div>
            <div className="pie__col">
              <h4>Cuenta</h4>
              <ul>
                <li><a href="/login#registro" onClick={irA("registro")}>Crear mi cuenta</a></li>
                <li><a href="/login" onClick={irA("login")}>Ya tengo cuenta</a></li>
              </ul>
            </div>
            <div className="pie__col">
              <h4>Legal</h4>
              <ul>
                <li><a href="/politica-datos">Política de Tratamiento de Datos</a></li>
                <li><a href="/politica-datos#derechos">Tratamiento de datos y derechos del titular</a></li>
              </ul>
            </div>
          </div>
          <div className="pie__legal">
            <p className="tiny">
              <span className="slot">[COMPLETAR: razón social]</span> · NIT <span className="slot">[COMPLETAR: NIT]</span> · <span className="slot">[COMPLETAR: ciudad, Colombia]</span><br />
              Tratamiento de datos personales conforme a la Ley 1581 de 2012 y al Decreto 1377 de 2013.<br />
              Para ejercer sus derechos como titular, escriba a <span className="slot">[COMPLETAR: correo de protección de datos]</span>.
            </p>
            <p className="tiny">© {anio} RECABRA. Todos los derechos reservados.</p>
            <p className="tiny">
              El plano de esta página corresponde a un supermercado ficticio, definido en el código
              de la propia página. No representa a ningún cliente.
            </p>
          </div>
        </div>
      </footer>

      <div className="toast" role="status" aria-live="polite" data-on={aviso ? "true" : "false"}>
        <span style={{ color: "var(--st-libre)", display: "flex" }}><Ico n="check" tam={16} /></span>
        <span>{aviso}</span>
      </div>
    </div>
  );
}

/* ── piezas de las secciones ──────────────────────────────────────────────── */

function Perfil({ id, activo, onElegir, rot, titulo, children }: {
  id: "g" | "t" | "p";
  activo: string;
  onElegir: (id: "g" | "t" | "p") => void;
  rot: string;
  titulo: string;
  children: React.ReactNode;
}) {
  const orden: Array<"g" | "t" | "p"> = ["g", "t", "p"];
  return (
    <button
      className="rtab" role="tab" type="button"
      id={`lp-tab-${id}`} aria-controls={`lp-pane-${id}`} aria-selected={activo === id}
      onClick={() => onElegir(id)}
      onKeyDown={(e) => {
        const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1
          : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const i = orden.indexOf(id);
        const siguiente = orden[(i + d + orden.length) % orden.length];
        onElegir(siguiente);
        document.getElementById(`lp-tab-${siguiente}`)?.focus();
      }}
    >
      <span className="rtab__k">{rot}</span>
      <span className="rtab__t">{titulo}</span>
      <span className="rtab__d">{children}</span>
    </button>
  );
}

/** Los dieciséis espacios repintados por temporada, en la tarjeta 03. */
const MAPAS = ["lllllllaaaTTTTTT", "llllaaTTTTTTllll", "llaaaTTTTTTTTll", "laaTTTTTTTTTlll"];
const COLOR: Record<string, string> = {
  l: "var(--st-libre)", a: "var(--st-libera)", T: "var(--st-tomado)",
};

function GridTemporada({ n }: { n: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const caja = ref.current;
    if (!caja) return;
    const m = MAPAS[n] || MAPAS[0];
    const celdas = Array.from(caja.children) as HTMLElement[];
    const relojes = celdas.map((c, i) => window.setTimeout(() => {
      c.style.background = COLOR[m.charAt(i)] || "var(--st-resto)";
    }, quieto() ? 0 : i * 22));
    return () => relojes.forEach((r) => window.clearTimeout(r));
  }, [n]);
  return (
    <div className="gridmini" ref={ref} style={{ marginTop: 12 }} aria-hidden="true">
      {Array.from({ length: 16 }, (_, i) => <i key={i} />)}
    </div>
  );
}
