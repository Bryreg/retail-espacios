import { useCallback, useEffect, useRef, useState } from "react";
import PlanoIsometrico from "./PlanoIsometrico";
import "./landing.css";

/**
 * La landing pública de RECABRA — `/` para quien NO tiene sesión.
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
 *  · El texto es el de `features/landing/outputs/copy.md`, literal. Si un
 *    texto no entra en su espacio, se pide el recorte allá — el copy tiene una
 *    sola fuente y no se reescribe acá.
 */

const LLAVE_TEMA = "recabra-tema-landing";

type Tema = "claro" | "oscuro";

function temaInicial(): Tema {
  try {
    const guardado = window.localStorage.getItem(LLAVE_TEMA);
    if (guardado === "claro" || guardado === "oscuro") return guardado;
  } catch {
    /* navegación privada o almacenamiento bloqueado: manda el sistema */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro";
}

/** El cubo isométrico con una sola cara pintada: un mueble tiene caras, y una
 *  cara se vende. Va en línea (nada de un `.svg` externo, por la CSP). */
function Marca({ tam = 26 }: { tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <g strokeLinejoin="round">
        <polygon points="16,3 29,10.5 16,18 3,10.5" fill="var(--st-libre-t)" />
        <polygon points="3,10.5 16,18 16,29 3,21.5" fill="var(--st-libre-l)" />
        <polygon points="29,10.5 29,21.5 16,29 16,18" fill="var(--st-libre-r)" />
      </g>
    </svg>
  );
}

export default function Landing() {
  const raizRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const [tema, setTema] = useState<Tema>(temaInicial);
  const [eleccionPropia, setEleccionPropia] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(LLAVE_TEMA) !== null;
    } catch {
      return false;
    }
  });

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

  /* Sin elección propia, la página sigue al sistema aunque cambie en vivo. */
  useEffect(() => {
    if (eleccionPropia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const alCambiar = () => setTema(mq.matches ? "oscuro" : "claro");
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, [eleccionPropia]);

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
    setEleccionPropia(true);
  }, []);

  /* Revelado por scroll: una observación por bloque, no un `scroll` escuchado.
     Con `prefers-reduced-motion` el CSS ya deja todo visible; el observador
     igual marca `in` para que nada dependa de que haya corrido. */
  useEffect(() => {
    const raiz = raizRef.current;
    if (!raiz) return;
    const nodos = Array.from(raiz.querySelectorAll<HTMLElement>(".rv, .rv-s"));
    if (!("IntersectionObserver" in window)) {
      nodos.forEach((n) => n.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 },
    );
    nodos.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  /* La línea de la barra aparece recién al bajar. Atributo, no estado: no hay
     por qué re-renderizar la página entera en cada scroll. */
  useEffect(() => {
    const alScrollear = () => {
      navRef.current?.setAttribute("data-stuck", window.scrollY > 8 ? "1" : "0");
    };
    alScrollear();
    window.addEventListener("scroll", alScrollear, { passive: true });
    return () => window.removeEventListener("scroll", alScrollear);
  }, []);

  return (
    <div className="lp" ref={raizRef} data-lp-tema={tema}>
      <a className="skip" href="#main">Saltar al contenido</a>

      {/* ═══ NAV ═══ */}
      <header className="nav" ref={navRef} data-stuck="0">
        <div className="wrap nav__in">
          <a className="brand" href="#top" aria-label="RECABRA, inicio">
            <span className="brand__mark"><Marca /></span>
            <span className="brand__name">RECABRA</span>
          </a>
          <nav className="nav__links" aria-label="Secciones">
            <a href="#que-hace">Qué hace</a>
            <a href="#para-quien">Para quién</a>
            <a href="#como-se-usa">Cómo se usa</a>
            <a href="#asesoria">Asesoría</a>
            <a href="#precio">Precio</a>
          </nav>
          <div className="nav__act">
            <button
              type="button"
              className="iconbtn"
              onClick={cambiarTema}
              aria-label={tema === "oscuro" ? "Cambiar al tema claro" : "Cambiar al tema oscuro"}
              title="Claro / oscuro"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
              </svg>
            </button>
            <a className="btn btn--ghost btn--sm" href="/login">Ya tengo cuenta</a>
            <a className="btn btn--primary btn--sm" href="/login#registro">Crear mi cuenta</a>
          </div>
        </div>
      </header>

      <main id="main">
        <span id="top" />

        {/* ═══ 1 · HERO ═══ */}
        <section className="hero">
          <div className="hero__grid" aria-hidden="true" />
          <div className="wrap hero__in">
            <div className="hero__col rv">
              <div className="brandmark-xl">
                <Marca tam={20} />
                <span className="w">RECABRA</span>
              </div>
              <p className="eyebrow" style={{ marginTop: 26 }}>Espacios comerciales de supermercado</p>
              <h1>
                Qué mueble está libre, quién lo ocupa, <span className="q">a cuánto y hasta cuándo.</span>
              </h1>
              <div className="hero__subs">
                <p className="lead">
                  RECABRA es el sistema con el que un supermercado vende sus espacios de exhibición.
                  Dibujás el plano de cada sede, marcás qué muebles se alquilan y armás el contrato
                  ahí mismo, tocando el mueble.
                </p>
                <p className="hero__sub2">
                  Si hoy eso vive en un Excel, en un chat de WhatsApp o en la memoria de alguien,
                  esta es la pantalla que falta.
                </p>
              </div>
              <div className="hero__cta">
                <a className="btn btn--primary" href="/login#registro">
                  Crear mi cuenta <span className="arrow" aria-hidden="true">→</span>
                </a>
                <a className="btn btn--ghost" href="/login">Ya tengo cuenta</a>
              </div>
              <p className="hero__note">
                Entrás con tu correo o con Google. Crear la cuenta y tu supermercado toma un minuto.
              </p>
            </div>

            <div className="hero__col rv">
              <PlanoIsometrico />
            </div>
          </div>
        </section>

        {/* ═══ 2 · LO QUE HACE ═══ */}
        <section className="sec" id="que-hace">
          <div className="wrap">
            <header className="sechead rv">
              <div className="rule"><span className="eyebrow">01 — Producto</span></div>
              <h2>Lo que hace</h2>
              <p className="lead bajada">Seis cosas concretas. Todas están construidas y andan hoy.</p>
            </header>

            <div className="bento rv-s">
              <article className="card c1">
                <p className="card__n">01</p>
                <h3>El plano de tu tienda, no una lista de códigos</h3>
                <p>
                  Dibujás cada sede como es: góndolas, puntas, islas, neveras, bateas, cajas. Cada
                  mueble queda con su código y sus medidas. En el plano se ve de un vistazo qué está
                  libre y qué está tomado, y cuando el proveedor quiere ver cómo le va a quedar la
                  exhibición, la misma tienda se recorre en 3D.
                </p>
                <div className="art">
                  <CampoDeEscasez />
                </div>
                <p className="card__pie">Plano 2D · vista 3D · una nomenclatura para toda la cadena</p>
              </article>

              <article className="card c2">
                <p className="card__n">02</p>
                <h3>El contrato se arma sobre el mueble</h3>
                <p>
                  Tocás el espacio y llenás una sola ficha: proveedor, marca, canon mensual, desde y
                  hasta. Si el acuerdo cubre tres puntas de góndola, las tocás las tres y queda un
                  solo contrato, no tres. Abajo del formulario está el total del plazo, que es lo que
                  se firma: $ 1.500.000 al mes por 61 días son $ 3.050.000, y esa cuenta ya no se
                  hace de cabeza con el proveedor esperando.
                </p>
                <div className="art">
                  <div className="cuenta">
                    <div className="r"><span>Canon mensual</span><span>$ 1.500.000</span></div>
                    <div className="r"><span>Plazo</span><span>61 días</span></div>
                    <div className="tot"><span>Total del plazo</span><span>$ 3.050.000</span></div>
                  </div>
                </div>
                <p className="card__pie">Un proveedor, un periodo, todos los espacios que haga falta</p>
              </article>

              <article className="card c3">
                <p className="card__n">03</p>
                <h3>Qué hay libre en la temporada que estás vendiendo</h3>
                <p>
                  Elegís el periodo —Amor y Amistad, Halloween, Black Friday, Navidad, regreso a
                  clases— y el plano entero se repinta para ese periodo: libre todo el tiempo, se
                  libera adentro, o tomado. Un panel te dice cuántos espacios hay libres si el
                  contrato arranca el 26 y cuántos si arranca el 29. Un mueble que se desocupa el 25
                  es inventario que podés ofrecer hoy.
                </p>
                <p className="card__pie">
                  Nueve temporadas del calendario colombiano, con la ventana de venta que vos definas
                </p>
              </article>

              <article className="card c4">
                <p className="card__n">04</p>
                <h3>Tu tarifa, y cuánto te estás corriendo de ella</h3>
                <p>
                  Cargás una tarifa por tipo de mueble, con ajuste por sede si una tienda vale más
                  que otra. Cuando escribís el valor de un contrato, al lado te aparece la referencia
                  y el desvío: «−17 % vs referencia». En el tablero hay una lista de todo lo que está
                  por debajo de tarifa, para revisarlo en la próxima renovación.
                </p>
                <div className="art">
                  <div className="tarifa-row">
                    <span className="v">$ 955.000</span>
                    <span className="ref">referencia $ 1.150.000</span>
                    <span className="chip-desvio">−17 % vs referencia</span>
                  </div>
                </div>
                <p className="card__pie">La tarifa la ve el administrador. El mercaderista no ve un solo peso.</p>
              </article>

              <article className="card c5">
                <p className="card__n">05</p>
                <h3>Los avisos salen solos</h3>
                <p>
                  Al guardar un contrato salen tres correos distintos: el comercial recibe el acuerdo
                  con el valor, el mercaderista recibe la orden de montaje sin un solo monto y con el
                  enlace para reportar, y el proveedor recibe la constancia de lo suyo. Antes de
                  vencer, el sistema avisa tres veces: a 30, a 15 y a 6 días. A una semana ya no hay
                  margen para negociar; a un día el correo llega para contar algo que ya pasó.
                </p>
                <div className="art avisos">
                  <div className="mails">
                    <span className="mail">comercial · con valor</span>
                    <span className="mail no-plata">montaje · sin montos</span>
                    <span className="mail">proveedor · constancia</span>
                  </div>
                  <div className="avisos__line" aria-hidden="true">
                    <span style={{ left: "8%" }} data-d="30 días" />
                    <span style={{ left: "50%" }} data-d="15 días" />
                    <span style={{ left: "92%" }} data-d="6 días" />
                  </div>
                </div>
                <p className="card__pie">
                  Y cuando falta poco, el botón Renovar viene con el proveedor, la marca y el valor
                  que se está pagando ya escritos.
                </p>
              </article>

              <article className="card c6">
                <div className="c6__txt">
                  <p className="card__n">06</p>
                  <h3>El montaje se confirma con foto, desde el celular</h3>
                  <p>
                    El correo del mercaderista trae un enlace que abre directo en el espacio que le
                    toca. Sin contraseña y sin ver el tablero de la tienda: solo el mueble, dónde
                    queda —«a unos 4 m de las cajas», con el plano de la sala señalado— y dos
                    botones. «Montado» exige foto. «No pude» exige motivo, porque sin motivo no se
                    sabe a quién reclamarle.
                  </p>
                  <p className="card__pie">
                    La foto queda guardada. Es la que responde el reclamo del proveedor tres meses después.
                  </p>
                </div>
                <div className="c6__art">
                  <div className="fono" aria-hidden="true">
                    <div className="fono__notch" />
                    <p className="fono__code">PUN-01</p>
                    <p className="fono__ubi">Punta de góndola · a unos 4 m de las cajas</p>
                    <div className="fono__map"><i /></div>
                    <div className="fono__btns"><b>Montado</b><b>No pude</b></div>
                  </div>
                </div>
              </article>
            </div>

            <p className="cierre-linea rv">
              Y además: cargás la temporada entera desde una planilla de Excel, revisás fila por fila
              antes de crear nada, manejás todas tus sedes desde la misma cuenta e invitás a tu
              equipo con el permiso que le toca a cada uno.
            </p>
          </div>
        </section>

        {/* ═══ 3 · PARA QUIÉN ═══ */}
        <section className="sec" id="para-quien">
          <div className="wrap">
            <header className="sechead rv">
              <div className="rule"><span className="eyebrow">02 — Personas</span></div>
              <h2>Tres personas usan esto, y cada una ve otra cosa</h2>
            </header>

            <div className="perfiles rv-s">
              <article className="perfil">
                <p className="perfil__rot">Gerente o administrador</p>
                <h3>Vende con datos, no de memoria</h3>
                <p>
                  Ve el plano, la plata y el calendario en la misma pantalla. Arma el contrato, pone
                  el precio con la tarifa al lado y sabe qué se le cae el mes que viene. Puede girar
                  el portátil y mostrarle el plano al proveedor que tiene enfrente: esa pantalla no
                  muestra el nombre ni el canon de ningún otro proveedor.
                </p>
              </article>
              <article className="perfil">
                <p className="perfil__rot">Trabajador de piso</p>
                <h3>Monta y reporta, sin ver dinero</h3>
                <p>
                  Le llega un correo con el espacio que le toca y un enlace que abre en su celular.
                  Confirma con una foto o dice qué pasó. No entra con una contraseña compartida y no
                  ve valores: el sistema le borra la plata antes de mandarle la pantalla.
                </p>
              </article>
              <article className="perfil">
                <p className="perfil__rot">Proveedor</p>
                <h3>Sabe qué compró</h3>
                <p>
                  Recibe por correo la constancia de su acuerdo: qué espacios, en qué sede, desde
                  cuándo y hasta cuándo. Y antes de firmar puede ver el mueble en 3D con su marca
                  puesta, en una lámina de antes y después que se le manda adjunta.
                </p>
              </article>
            </div>

            <div className="rv" style={{ marginTop: "clamp(40px,5vw,72px)" }}>
              <h3 style={{ fontSize: "clamp(1.3rem,1.05rem + 1vw,1.8rem)", letterSpacing: "-.03em" }}>
                Los números que vas a tener a la vista
              </h3>
              <p className="lead" style={{ marginTop: 10, maxWidth: "58ch" }}>
                No son promesas. Son las cifras que la pantalla te muestra cada vez que la abrís.
              </p>
            </div>

            <div className="cifras rv" style={{ marginTop: "var(--s-5)" }}>
              <div className="cifra">
                <p className="cifra__k">Ocupación</p>
                <p className="cifra__v mono" style={{ fontSize: "2.4rem" }}>35 %</p>
                <BarraOcupacion />
                <p className="cifra__d">8 de 23 caras vendidas en el periodo</p>
              </div>
              <div className="cifra">
                <p className="cifra__k">Canon vigente</p>
                <p className="cifra__d">Lo que están pagando hoy los contratos vivos, al mes.</p>
              </div>
              <div className="cifra">
                <p className="cifra__k">Sin alquilar</p>
                <p className="cifra__d">Cuánto vale a tarifa lo que está vacío, y cuánto es eso por día vacío.</p>
              </div>
              <div className="cifra">
                <p className="cifra__k">Vence en 30 días</p>
                <p className="cifra__d">Cuántos espacios y cuánta plata se te caen si nadie los renueva.</p>
              </div>
              <div className="cifra">
                <p className="cifra__k">Sin montar</p>
                <p className="cifra__d">Contratos ya cobrados que todavía no están armados en el piso.</p>
              </div>
            </div>
            <p className="rv" style={{ marginTop: "var(--s-4)", color: "var(--ink-2)" }}>
              Y un contrato de tres puntas de góndola se arma una vez, no tres.
            </p>
          </div>
        </section>

        {/* ═══ 4 · CÓMO SE ARRANCA ═══ */}
        <section className="sec" id="como-se-usa">
          <div className="wrap">
            <header className="sechead rv">
              <div className="rule"><span className="eyebrow">03 — Puesta en marcha</span></div>
              <h2>Cómo se arranca</h2>
              <p className="lead bajada">
                Tres pasos. El primero toma un minuto; el segundo es el trabajo de verdad y se hace
                una sola vez.
              </p>
            </header>

            <div className="pasos rv-s">
              <article className="paso">
                <p className="paso__n mono">1</p>
                <h3>Creá la cuenta y tu supermercado</h3>
                <p>
                  Entrás con Google o con tu correo, le ponés nombre a tu supermercado y quedás como
                  dueño de la cuenta. Después invitás a tu equipo: cada persona con su correo y con
                  el permiso que le toca.
                </p>
                <div className="paso__art mini" aria-hidden="true">
                  <div className="mini__bar"><i /><i /><i /></div>
                  <div className="mini__body">
                    <div className="mini__row w40" />
                    <div className="mini__row w80" />
                    <div className="mini__row w60" />
                    <div className="mini__row acc" />
                  </div>
                </div>
              </article>

              <article className="paso">
                <p className="paso__n mono">2</p>
                <h3>Dibujá el plano de cada sede</h3>
                <p>
                  Ponés los muebles como están en la sala y marcás cuáles se alquilan. Las cajas y
                  las columnas quedan de contexto, en gris. Si ya tenés los contratos de la temporada
                  en un Excel, los cargás de una vez: el sistema te muestra fila por fila qué entra y
                  qué choca, antes de crear nada.
                </p>
                <div className="paso__art mini" aria-hidden="true">
                  <div className="mini__bar"><i /><i /><i /></div>
                  <div className="mini__pad">
                    <div className="mini__plan">
                      <b style={{ left: "12%", top: "24%", width: "34%", background: "var(--st-resto-dot)" }} />
                      <b style={{ left: "12%", top: "44%", width: "34%", background: "var(--st-resto-dot)" }} />
                      <b style={{ left: "12%", top: "64%", width: "34%", background: "var(--st-resto-dot)" }} />
                      <b style={{ left: "56%", top: "26%", width: "16%", background: "var(--st-libre-dot)" }} />
                      <b style={{ left: "56%", top: "50%", width: "16%", background: "var(--st-libera-dot)" }} />
                      <b style={{ left: "78%", top: "38%", width: "14%", background: "var(--st-tomado-dot)" }} />
                    </div>
                  </div>
                </div>
              </article>

              <article className="paso">
                <p className="paso__n mono">3</p>
                <h3>Vendé tocando el mapa</h3>
                <p>
                  Elegís la temporada, mirás qué quedó verde, tocás el mueble y llenás el contrato.
                  Al guardar salen los tres correos y el espacio cambia de color en el plano.
                </p>
                <div className="paso__art mini" aria-hidden="true">
                  <div className="mini__bar"><i /><i /><i /></div>
                  <div className="mini__split">
                    <div className="mini__plan">
                      <b style={{ left: "14%", top: "30%", width: "26%", background: "var(--st-libre-dot)" }} />
                      <b style={{ left: "52%", top: "54%", width: "22%", background: "var(--st-tomado-dot)" }} />
                    </div>
                    <div className="mini__col">
                      <div className="mini__row w80" />
                      <div className="mini__row w60" />
                      <div className="mini__row w80" />
                      <div className="mini__row acc" style={{ width: "100%" }} />
                    </div>
                  </div>
                </div>
              </article>
            </div>

            <p className="cierre-linea rv">
              Cada supermercado empieza vacío. RECABRA no viene con datos de nadie adentro.
            </p>
          </div>
        </section>

        {/* ═══ 5 · ASESORÍA ═══ */}
        <section className="sec banda" id="asesoria">
          <div className="wrap">
            <header className="sechead rv">
              <div className="rule"><span className="eyebrow">04 — El diferencial</span></div>
              <p className="eyebrow" style={{ letterSpacing: ".06em", textTransform: "none", fontSize: ".95rem", color: "var(--ink-2)" }}>
                Lo que ningún Excel te va a decir
              </p>
              <h2>Además del sistema, te decimos qué proponer</h2>
              <p className="lead bajada">
                Un sistema te muestra lo que pasó. Nosotros miramos tus números y te llevamos, por
                escrito, qué le podés ofrecer a quién esta semana.
              </p>
            </header>

            <div className="bento rv-s" style={{ gap: "var(--s-4)" }}>
              <article className="card a1">
                <p className="card__n">A</p>
                <h3>Recomendaciones ordenadas por lo que hay en juego</h3>
                <p>
                  Cada recomendación viene con un valor al lado y una razón. «Tenés tres puntas de
                  góndola libres: ofrecelas a $ 2.000.000 cada una, que es el promedio que vos mismo
                  estás cobrando por ese tipo — $ 6.000.000 en juego.» «El contrato de esa punta
                  vence en 19 días: renovalo o reasignalo — $ 2.000.000 en juego.» Primero las de
                  mayor valor.
                </p>
                <div className="reco">
                  <div className="reco__item">
                    <p>
                      Tres puntas de góndola libres. Ofrecelas a $ 2.000.000 cada una, que es el
                      promedio que vos mismo estás cobrando por ese tipo.
                    </p>
                    <p className="reco__val">$ 6.000.000</p>
                  </div>
                  <div className="reco__item">
                    <p>El contrato de esa punta vence en 19 días: renovalo o reasignalo.</p>
                    <p className="reco__val">$ 2.000.000</p>
                  </div>
                </div>
              </article>

              <article className="card a2">
                <p className="card__n">B</p>
                <h3>Oportunidades espacio por espacio</h3>
                <p>
                  Para cada mueble libre o que se libera en el periodo: un precio sugerido —el
                  promedio que ya cobrás por ese tipo, o el promedio de los supermercados que usan
                  RECABRA si vos todavía no cobrás ninguno— y hasta tres proveedores tuyos que
                  podrían tomarlo, empezando por los que ya alquilan ese mismo tipo de mueble.
                </p>
                <div className="art oport">
                  <div className="oport__row">
                    <span className="oport__code">PUN-05</span>
                    <span className="oport__sug">$ 1.000.000</span>
                    <span className="oport__prov">
                      <span className="tag">Bebidas Zafiro</span>
                      <span className="tag">Confites Milagro</span>
                    </span>
                  </div>
                  <div className="oport__row">
                    <span className="oport__code">EXP-02</span>
                    <span className="oport__sug">$ 1.200.000</span>
                    <span className="oport__prov">
                      <span className="tag">Galletas Doña Rita</span>
                      <span className="tag">Aseo Rocío</span>
                    </span>
                  </div>
                  <div className="oport__row">
                    <span className="oport__code">BAT-01</span>
                    <span className="oport__sug">$ 320.000</span>
                    <span className="oport__prov"><span className="tag">Frutas del Ocaso</span></span>
                  </div>
                </div>
                <p className="card__pie">Proveedores y valores de ejemplo</p>
              </article>

              <article className="card a3">
                <p className="card__n">C</p>
                <h3>Tendencia mes a mes</h3>
                <p>
                  Ocupación, ingreso contratado y canon promedio, guardados mes a mes desde que
                  entrás. La pregunta «¿estamos mejorando?» deja de contestarse de memoria. Un mes
                  sin datos aparece como un hueco, no como un cero: un cero sería mentira.
                </p>
                <GraficoTendencia />
              </article>
            </div>

            <div className="cierre-honesto rv">
              <p>
                <b>Cómo funciona, sin vueltas.</b> Esta parte no es una pantalla tuya: la revisa una
                persona de RECABRA sobre tus propios datos, y te llega en la sesión de asesoría. Todo
                lo que se lee está escrito en la Política de Tratamiento de Datos, queda anotado con
                la fecha y el correo de quien lo consultó, y podés pedir ese registro cuando quieras
                desde tu propia cuenta.
              </p>
              <a className="linklike" href="/politica-datos">
                Ver el reporte de transparencia <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </section>

        {/* ═══ 6 · CONFIANZA ═══ */}
        <section className="sec" id="confianza">
          <div className="wrap">
            <header className="sechead rv">
              <div className="rule"><span className="eyebrow">05 — Confianza</span></div>
              <h2>Dónde quedan tus datos</h2>
              <p className="lead bajada">
                Esto lo usa gente distinta de la misma tienda, y hay dinero adentro. Así está resuelto.
              </p>
            </header>

            <div className="puntos rv-s">
              <article className="punto">
                <p className="punto__n">01</p>
                <h3>Cada supermercado, en su propia base</h3>
                <p>
                  Los planos, los contratos y los proveedores de tu supermercado viven en una base
                  separada de la de cualquier otro cliente. No es un filtro por columna: es otra base.
                </p>
              </article>
              <article className="punto">
                <p className="punto__n">02</p>
                <h3>Cada persona entra con su cuenta</h3>
                <p>
                  Con Google o con correo y contraseña. Nada de una clave compartida que sigue
                  funcionando cuando alguien se va. Desactivás a esa persona y pierde el acceso en el
                  siguiente clic, sin tocar a nadie más.
                </p>
              </article>
              <article className="punto">
                <p className="punto__n">03</p>
                <h3>El dinero no le llega a quien no le toca</h3>
                <p>
                  Los valores no se ocultan en la pantalla: se borran en el servidor antes de
                  mandarla. El mercaderista no tiene forma de verlos, ni siquiera mirando lo que le
                  llegó al navegador.
                </p>
              </article>
              <article className="punto">
                <p className="punto__n">04</p>
                <h3>Podés auditar qué se mira de vos</h3>
                <p>
                  El dueño de la cuenta puede pedir, cuando quiera, el reporte de transparencia: qué
                  datos toma RECABRA, cómo los calcula, de dónde salen, para qué, y quién los
                  consultó y qué día. También puede descargar todos sus datos y pedir la supresión.
                </p>
              </article>
              <article className="punto">
                <p className="punto__n">05</p>
                <h3>Colombia, Ley 1581</h3>
                <p>
                  Tratamiento de datos personales conforme a la Ley 1581 de 2012 y al Decreto 1377 de
                  2013. La política es pública y se lee sin tener cuenta.
                </p>
              </article>
            </div>

            <p className="rv enlaces-legales">
              <a className="linklike" href="/politica-datos">
                Política de Tratamiento de Datos <span aria-hidden="true">→</span>
              </a>
              <a className="linklike" href="/politica-datos#transparencia">
                Reporte de transparencia <span aria-hidden="true">→</span>
              </a>
            </p>
          </div>
        </section>

        {/* ═══ 7 · PRECIO ═══ */}
        <section className="sec" id="precio">
          <div className="wrap">
            <header className="sechead rv">
              <div className="rule"><span className="eyebrow">06 — Precio</span></div>
              <h2>Cuánto cuesta</h2>
            </header>

            <div className="precio">
              <div className="cuenta-cobro rv">
                <p className="eyebrow">Precio</p>
                <p style={{ marginTop: 14 }}><span className="pendiente">[COMPLETAR: precio]</span></p>
                <p style={{ marginTop: 10 }}>
                  <span className="pendiente">
                    [COMPLETAR: unidad — por supermercado al mes, por sede al mes, o lo que corresponda]
                  </span>
                </p>
                <hr />
                <p className="eyebrow">Cómo se paga</p>
                <p className="lead" style={{ marginTop: 10 }}>
                  Por transferencia bancaria, contra cuenta de cobro. No hay pasarela de pagos ni te
                  pedimos una tarjeta.
                </p>
              </div>

              <div className="rv">
                <p className="eyebrow">Qué pasa si un mes te atrasás</p>
                <div className="estados-cuenta">
                  <div className="ec"><i aria-hidden="true" /><p>Primero te avisamos en la pantalla, y todo sigue funcionando igual.</p></div>
                  <div className="ec"><i aria-hidden="true" /><p>Si el atraso sigue, la cuenta pasa a solo lectura: podés entrar, ver todo y consultar, pero no se cargan contratos nuevos. Si sigue más, se suspende y solo el dueño puede entrar.</p></div>
                  <div className="ec"><i aria-hidden="true" /><p>Tus datos no se borran nunca. Ponés la cuenta al día y volvés a trabajar donde lo dejaste.</p></div>
                </div>
                <p className="precio__contacto">
                  ¿Tenés varias sedes o una cadena regional y querés que lo veamos juntos? Escribinos
                  a <span className="pendiente pendiente--chico">[COMPLETAR: correo de contacto]</span>.
                </p>
                <p className="precio__cta">
                  {/* Mientras el correo de contacto sea un [COMPLETAR] del dueño (copy §15),
                      «Hablemos» lleva al registro en vez de a un `mailto:` vacío: un botón
                      primario que no hace nada es peor que uno que abre la puerta. */}
                  <a className="btn btn--primary" href="/login#registro">
                    Hablemos <span className="arrow" aria-hidden="true">→</span>
                  </a>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ 8 · CTA FINAL ═══ */}
        <section className="sec cta">
          <div className="cta__grid" aria-hidden="true" />
          <div className="wrap cta__in rv">
            <Marca tam={34} />
            <h2>Empezá por una sede</h2>
            <p className="lead">
              Creá la cuenta, dibujá la tienda que más espacios vende y mirá cuántos tenés libres
              esta temporada. Si sirve, seguís con las demás.
            </p>
            <div className="hero__cta">
              <a className="btn btn--primary" href="/login#registro">
                Crear mi cuenta <span className="arrow" aria-hidden="true">→</span>
              </a>
              <a className="btn btn--ghost" href="/login">Ya tengo cuenta</a>
            </div>
            <p className="micro" style={{ maxWidth: "52ch" }}>
              Entrás con Google o con tu correo. El plano de arriba es de ejemplo; el tuyo lo dibujás vos.
            </p>
          </div>
        </section>
      </main>

      {/* ═══ 9 · PIE ═══ */}
      <footer className="pie">
        <div className="wrap">
          <div className="pie__top">
            <div>
              <div className="marca-pie">
                <Marca tam={22} />
                <span className="brand__name">RECABRA</span>
              </div>
              <p className="pie__desc">
                <span className="sr">RECABRA · </span>Gestión de espacios comerciales en supermercados
              </p>
            </div>
            <div>
              <h4>Producto</h4>
              <ul>
                <li><a href="#que-hace">Qué hace</a></li>
                <li><a href="#como-se-usa">Cómo se usa</a></li>
                <li><a href="#precio">Precio</a></li>
              </ul>
            </div>
            <div>
              <h4>Cuenta</h4>
              <ul>
                <li><a href="/login#registro">Crear mi cuenta</a></li>
                <li><a href="/login">Ya tengo cuenta</a></li>
              </ul>
            </div>
            <div>
              <h4>Legal</h4>
              <ul>
                <li><a href="/politica-datos">Política de Tratamiento de Datos</a></li>
                <li><a href="/politica-datos#derechos">Tratamiento de datos y derechos del titular</a></li>
              </ul>
            </div>
          </div>

          <div className="pie__legal">
            <p>
              [COMPLETAR: razón social] · NIT [COMPLETAR: NIT] · [COMPLETAR: ciudad, Colombia]<br />
              Tratamiento de datos personales conforme a la Ley 1581 de 2012 y al Decreto 1377 de 2013.<br />
              Para ejercer tus derechos como titular, escribí a [COMPLETAR: correo de protección de datos].
            </p>
            <div className="cols">
              <p>© {new Date().getFullYear()} RECABRA. Todos los derechos reservados.</p>
              <p><a href="#top">Volver arriba</a></p>
            </div>
            <p>
              El plano de esta página es un supermercado inventado, sembrado en el código de la
              propia página. No corresponde a ningún cliente.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** 52 celdas, 7 encendidas: la escasez, sin escribir ninguna cifra. */
function CampoDeEscasez() {
  const marcados = [4, 9, 17, 26, 33, 41, 47];
  const color = ["v", "a", "r"];
  return (
    <div className="escasez" aria-hidden="true">
      {Array.from({ length: 52 }, (_, i) => {
        const k = marcados.indexOf(i);
        return <i key={i} className={k > -1 ? "on " + color[k % 3] : undefined} />;
      })}
    </div>
  );
}

/** La barra de ocupación crece de 0 a 35 % al entrar en pantalla. */
function BarraOcupacion() {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const i = ref.current;
    if (!i) return;
    if (!("IntersectionObserver" in window)) {
      i.style.width = "35%";
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting) {
            i.style.width = "35%";
            io.disconnect();
          }
        });
      },
      { threshold: 0.4 },
    );
    io.observe(i);
    return () => io.disconnect();
  }, []);
  return <div className="barra" aria-hidden="true"><i ref={ref} /></div>;
}

/**
 * Ocupación mes a mes. Una serie, cambio en el tiempo → línea, sin leyenda.
 * El mes sin datos NO baja a cero: la línea se corta, el puente es punteado y
 * el punto es hueco. Un cero sería mentira, y esa es justamente la frase del
 * copy que este gráfico ilustra.
 */
function GraficoTendencia() {
  return (
    <div className="chartbox">
      <div className="chartbox__head">
        <p className="chartbox__t">Ocupación mes a mes</p>
        <p className="chartbox__s">Ejemplo · datos inventados</p>
      </div>
      <svg viewBox="0 0 368 130" role="img"
        aria-label="Línea de ocupación mensual de ejemplo: sube de 22 % en abril a 46 % en diciembre. Julio no tiene dato y la línea queda cortada, no en cero.">
        <line x1="18" y1="100.5" x2="358" y2="100.5" stroke="var(--line)" strokeWidth="1" />
        <line x1="18" y1="58.5" x2="358" y2="58.5" stroke="var(--line-hair)" strokeWidth="1" />
        <line x1="18" y1="16.5" x2="358" y2="16.5" stroke="var(--line-hair)" strokeWidth="1" />
        <path d="M24 63 L64 54.6 L104 47.9 L144 51.3" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M144 51.3 L224 42.9" fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="3 5" strokeLinecap="round" />
        <path d="M224 42.9 L264 36.2 L304 31.1 L344 22.7" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <g fill="var(--accent)" stroke="var(--surface)" strokeWidth="2">
          <circle cx="24" cy="63" r="3.6" /><circle cx="64" cy="54.6" r="3.6" />
          <circle cx="104" cy="47.9" r="3.6" /><circle cx="144" cy="51.3" r="3.6" />
          <circle cx="224" cy="42.9" r="3.6" /><circle cx="264" cy="36.2" r="3.6" />
          <circle cx="304" cy="31.1" r="3.6" /><circle cx="344" cy="22.7" r="4.6" />
        </g>
        <circle cx="184" cy="47.1" r="3.6" fill="var(--surface)" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="2 2" />
        <text x="184" y="36" textAnchor="middle" fontSize="8.5" fill="var(--ink-3)">sin datos</text>
        <text x="344" y="14" textAnchor="end" fontSize="11" fontWeight="600" fill="var(--ink)">46 %</text>
        <g fontSize="8.5" fill="var(--ink-3)" textAnchor="middle">
          <text x="24" y="114">abr</text><text x="64" y="114">may</text><text x="104" y="114">jun</text>
          <text x="144" y="114">jul</text><text x="184" y="114">ago</text><text x="224" y="114">sep</text>
          <text x="264" y="114">oct</text><text x="304" y="114">nov</text><text x="344" y="114">dic</text>
        </g>
      </svg>
    </div>
  );
}
