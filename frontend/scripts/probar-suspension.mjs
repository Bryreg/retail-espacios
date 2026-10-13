/**
 * Pruebas del corte por estado de cuenta, del lado de la PANTALLA.
 *   npm run probar:suspension
 *
 * El agujero que estas pruebas cuidan no era el servidor: el 402 estaba y era
 * correcto en las 66 rutas de negocio. Lo que seguía andando era la app
 * dibujada. `aviso_cuenta` viaja UNA sola vez —en la respuesta del login— y se
 * guarda en `localStorage`; a un cliente suspendido MIENTRAS su gente ya estaba
 * adentro, la pantalla no se le enteraba nunca. Cada pedido contestaba 402 y
 * nadie los miraba, porque el interceptor sólo conocía el 401. Reproducido con
 * la app real: barra de navegación entera, pestañas, botones — y como único
 * síntoma un chip de «Sin conexión», que se lee como un problema de red.
 *
 * El arreglo es una costura entre dos repos que no se compilan juntos: el
 * backend rotula el 402 con `X-Estado-Cuenta` y el navegador lo lee. Nada más
 * los ata. Un `rename` cómodo de un lado deja al otro mirando una cabecera que
 * ya no existe, sin error de compilación, sin prueba roja, y el corte de
 * servicio vuelve a leerse como una falla de red. Eso es lo que se mide acá:
 *
 *  1. **El nombre de la cabecera es el mismo de los dos lados**, leído del
 *     archivo de cada uno y comparado — no escrito dos veces en esta prueba.
 *  2. **Los dos estados que cortan viajan y se distinguen.** `suspendido` tapa
 *     la app entera; `solo_lectura` sólo pone la franja. Un 402 pelado no
 *     alcanza para saber cuál dibujar, así que los dos valores que el backend
 *     manda tienen que ser exactamente los que el front reconoce.
 *  3. **El 402 NO cierra la sesión.** Es la diferencia con el 401, y no es un
 *     detalle: el owner tiene que poder quedarse adentro para ver el motivo y
 *     pagar, que es la misma razón por la que el login lo deja entrar.
 *  4. **Sin sesión no se marca nada**, o el estado de un cliente ajeno quedaría
 *     pegado en el store de quien todavía no entró.
 *  5. **Las dos pantallas del corte siguen colgando del store**: `BloqueoCuenta`
 *     de `suspendido` y el banner de lo demás. Si alguien las desconecta, el
 *     interceptor escribe en el vacío.
 *
 * Y desde C2 (cobranza, 2026-10-13), la vuelta y la plata:
 *
 *  6. **La pantalla se entera de que la cuenta volvió a estar al día** sin que
 *     nadie vuelva a entrar: `BloqueoCuenta` y la franja consultan
 *     `GET /auth/estado-cuenta` cada pocos minutos y con «Reintentar», y lo
 *     escriben en el store con `actualizarAvisoCuenta`, que también LIMPIA.
 *  7. **Lo que la pantalla pide estando cortada, el backend lo deja pasar**:
 *     los caminos de `api/suscripcion.ts` son los de
 *     `_EXENTOS_PARA_PONERSE_AL_DIA` en `clientes.py`, leídos de los dos lados.
 *  8. **La franja y la pantalla de bloqueo nunca muestran un monto** (se ven
 *     en Vender, delante de proveedores). La plata vive en `MiSuscripcion`, que
 *     sólo la pide la dueña: en Configuración, con el filtro de la copia de
 *     seguridad, o en `BloqueoCuenta` TRAS UN CLIC en «Ver suscripción».
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const repo = join(raiz, "..");
const leer = (p) => readFileSync(join(repo, p), "utf8");

let hechas = 0;
const prueba = (n, fn) => {
  try { fn(); hechas++; console.log("  ok   " + n); }
  catch (e) { console.error("  FALLA " + n + "\n         " + e.message); process.exitCode = 1; }
};

const clientesPy = leer(join("backend", "app", "clientes.py"));
const mainPy = leer(join("backend", "app", "main.py"));
const clientTs = leer(join("frontend", "src", "api", "client.ts"));
const storeTs = leer(join("frontend", "src", "store", "authStore.ts"));
const appTsx = leer(join("frontend", "src", "App.tsx"));
const banner = leer(join("frontend", "src", "components", "AvisoCuentaBanner.tsx"));
const bloqueo = leer(join("frontend", "src", "components", "BloqueoCuenta.tsx"));
const apiSuscripcion = leer(join("frontend", "src", "api", "suscripcion.ts"));
const vivo = leer(join("frontend", "src", "components", "suscripcion", "useEstadoCuenta.ts"));
const dashboard = leer(join("frontend", "src", "pages", "Dashboard.tsx"));

/* El nombre de la cabecera, tal como lo declara el backend. Es la única fuente:
   todo lo demás en este archivo se compara contra esto. */
const CABECERA = (() => {
  const m = clientesPy.match(/^CABECERA_ESTADO_CUENTA\s*=\s*"([^"]+)"/m);
  assert.ok(m, "backend/app/clientes.py no declara CABECERA_ESTADO_CUENTA");
  return m[1];
})();

/* Los estados que el backend efectivamente manda en esa cabecera, sacados de
   los `headers={...}` de `_aplicar_estado` — no de una lista escrita a mano. */
const ESTADOS_BACKEND = (() => {
  const re = new RegExp(`headers=\\{CABECERA_ESTADO_CUENTA:\\s*"([a-z_]+)"\\}`, "g");
  return [...clientesPy.matchAll(re)].map((m) => m[1]).sort();
})();

prueba("el backend rotula el 402 con la cabecera, en los dos estados que cortan", () => {
  assert.deepEqual(
    ESTADOS_BACKEND,
    ["solo_lectura", "suspendido"],
    "`_aplicar_estado` tiene que mandar la cabecera en los DOS cortes: " +
      "un 402 sin rótulo el navegador no lo sabe dibujar",
  );
});

prueba("el navegador busca exactamente la cabecera que el backend manda", () => {
  // Axios normaliza los nombres a minúsculas: así es como hay que leerla.
  const esperado = CABECERA.toLowerCase();
  assert.ok(
    clientTs.includes(`"${esperado}"`),
    `api/client.ts no lee "${esperado}" — el backend manda "${CABECERA}" y ` +
      "nada más ata los dos lados: si uno se renombra, el corte deja de verse",
  );
});

prueba("el navegador reconoce los mismos estados que el backend manda", () => {
  const m = clientTs.match(/const ESTADOS_QUE_CORTAN = \[([^\]]+)\]/);
  assert.ok(m, "api/client.ts no declara ESTADOS_QUE_CORTAN");
  const front = [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]).sort();
  assert.deepEqual(
    front,
    ESTADOS_BACKEND,
    "los estados que corta el backend y los que entiende el front se separaron",
  );
});

prueba("`gracia` no corta: no está entre los estados que el front bloquea", () => {
  // Avisa y deja pasar. Si se colara acá, una cuenta al día con una factura
  // por vencer se quedaría sin app.
  const m = clientTs.match(/const ESTADOS_QUE_CORTAN = \[([^\]]+)\]/);
  assert.ok(!m[1].includes("gracia"), "`gracia` avisa, no corta");
});

prueba("la cabecera se expone en CORS", () => {
  // Hoy el SPA lo sirve la misma app y esto no haría falta; el día que el front
  // se sirva de otro dominio, sin esta línea el navegador ve el 402 y no el
  // motivo — y el corte vuelve a parecer una caída de red.
  const m = mainPy.match(/expose_headers=\[([^\]]*)\]/);
  assert.ok(m, "main.py no declara expose_headers en el CORSMiddleware");
  assert.ok(
    m[1].includes(`"${CABECERA}"`),
    `expose_headers no incluye "${CABECERA}"`,
  );
});

prueba("un 402 NO cierra la sesión — sólo el 401 lo hace", () => {
  // El owner entra estando suspendido a propósito: es lo único que le queda
  // para ver el motivo y pagar. Si el 402 lo desloguea, se queda afuera del
  // único lugar donde puede resolverlo.
  const cuerpo = clientTs.slice(clientTs.indexOf("interceptors.response"));
  const logouts = [...cuerpo.matchAll(/logout\(\)/g)].length;
  assert.equal(logouts, 1, "el interceptor llama a logout() más de una vez");
  const antes = cuerpo.slice(0, cuerpo.indexOf("logout()"));
  assert.ok(
    /status === 401/.test(antes),
    "el único logout() del interceptor tiene que colgar del 401",
  );
});

prueba("sin sesión no se marca ningún estado", () => {
  // Un 402 del login mismo lo muestra la pantalla de ingreso con su mensaje;
  // escribirlo en el store dejaría el estado de un cliente ajeno pegado en la
  // sesión de quien todavía no entró.
  const m = storeTs.match(/marcarEstadoCuenta:\s*\(estado, motivo\)\s*=>([\s\S]*?)\n {6}descartarConsentimiento/);
  assert.ok(m, "authStore.ts no implementa marcarEstadoCuenta");
  assert.ok(
    /!s\.token/.test(m[1]),
    "marcarEstadoCuenta tiene que no hacer nada si no hay token",
  );
});

prueba("marcar el mismo estado dos veces no vuelve a despertar a la app", () => {
  // Corre en CADA respuesta 402: en `solo_lectura` eso es una vez por intento
  // de guardar, y un `set` con objeto nuevo redibuja a todos los suscriptores.
  const m = storeTs.match(/marcarEstadoCuenta:[\s\S]*?\n {6}descartarConsentimiento/);
  assert.ok(
    /avisoCuenta\?\.estado === estado/.test(m[0]),
    "marcarEstadoCuenta no compara contra el estado que ya estaba",
  );
});

prueba("la app sigue tapándose entera cuando el store dice `suspendido`", () => {
  assert.ok(
    /avisoCuenta\?\.estado === "suspendido"/.test(appTsx) &&
      /<BloqueoCuenta/.test(appTsx),
    "App.tsx dejó de reemplazar la app con BloqueoCuenta: el interceptor " +
      "escribiría el estado en el vacío",
  );
});

prueba("el banner sigue leyendo el store, y no tapa nada en `suspendido`", () => {
  assert.ok(
    /useAuthStore\(\(s\) => s\.avisoCuenta\)/.test(banner),
    "AvisoCuentaBanner dejó de leer avisoCuenta del store",
  );
  assert.ok(
    /aviso\.estado === "suspendido"/.test(banner),
    "el banner tiene que dejarle `suspendido` a BloqueoCuenta",
  );
});

// ─── C2: la vuelta a «al día» y la plata ────────────────────────────────────

/** El código sin comentarios: los docstrings hablan de montos y de «Ver
 *  suscripción» a propósito, y no son pantalla. */
const sinComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

prueba("los caminos que la pantalla pide estando cortada son los que el backend exime", () => {
  const m = clientesPy.match(/^_EXENTOS_PARA_PONERSE_AL_DIA = \(([\s\S]*?)\)/m);
  assert.ok(m, "clientes.py no declara _EXENTOS_PARA_PONERSE_AL_DIA");
  const exentos = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
  const pedidos = [...apiSuscripcion.matchAll(/client\.(?:get|put|post)<[^>]*>\("([^"]+)"/g)]
    .map((x) => "/api" + x[1]);
  assert.ok(pedidos.length >= 3, "api/suscripcion.ts dejó de pedir estado-cuenta y mi-suscripcion");
  for (const ruta of pedidos) {
    assert.ok(
      exentos.some((e) => ruta === e || ruta.startsWith(e + "/")),
      `${ruta} lo pide la pantalla pero el backend no lo exime del corte: en sólo lectura o ` +
        "suspendida contestaría 402 justo cuando hace falta",
    );
  }
  for (const e of exentos) {
    assert.ok(pedidos.some((r) => r === e || r.startsWith(e + "/")), `${e} está exento y nadie lo pide`);
  }
});

prueba("`actualizarAvisoCuenta` limpia el aviso, y sin sesión no escribe nada", () => {
  const m = storeTs.match(/actualizarAvisoCuenta: \(aviso\) =>([\s\S]*?)\n {6}logout/);
  assert.ok(m, "authStore.ts no implementa actualizarAvisoCuenta");
  assert.ok(/if \(!s\.token\) return s;/.test(m[1]), "sin sesión tiene que no hacer nada");
  assert.ok(/aviso === null[\s\S]*avisoCuenta: null/.test(m[1]), "con la cuenta al día tiene que LIMPIAR el aviso");
});

prueba("un 402 no pisa el motivo de verdad con el genérico «en caliente»", () => {
  // La sincronización consulta cada 20 s: en suspendido, cada 402 volvía a
  // escribir el texto genérico encima del motivo que dijo el servidor.
  const m = storeTs.match(/marcarEstadoCuenta: \(estado, motivo\) =>[\s\S]*?\n {6}descartarConsentimiento/);
  assert.ok(/!s\.token \|\| s\.avisoCuenta\?\.estado === estado\s*\n\s*\? s/.test(m[0]),
    "marcarEstadoCuenta tiene que dejar el aviso como está si el estado es el mismo");
});

prueba("la consulta en vivo: al montarse, cada pocos minutos, y escribe en el store", () => {
  assert.ok(/getEstadoCuenta\(\)/.test(vivo), "useEstadoCuenta no consulta GET /auth/estado-cuenta");
  assert.ok(/setInterval\(/.test(vivo) && /clearInterval\(/.test(vivo), "la consulta no se repite (o no se limpia)");
  assert.ok(/actualizarAvisoCuenta\(r\.estado === "activo" \? null/.test(vivo),
    "«activo» tiene que limpiar el aviso: si no, la pantalla de bloqueo no se levanta nunca");
  const ms = Number((vivo.match(/CONSULTA_ESTADO_MS = ([\d_]+) \* 60_000/) || [])[1]);
  assert.ok(ms >= 1 && ms <= 10, "cada «pocos minutos»: entre 1 y 10");
});

prueba("BloqueoCuenta y la franja consultan solas y tienen «Reintentar»", () => {
  for (const [nombre, src] of [["BloqueoCuenta", bloqueo], ["AvisoCuentaBanner", banner]]) {
    const codigo = sinComentarios(src);
    assert.ok(/useEstadoCuentaVivo\(\)/.test(codigo), `${nombre} no consulta el estado en vivo`);
    assert.ok(/"Reintentar"/.test(codigo) && /onClick=\{\(\) => void revisar\(\)\}/.test(codigo),
      `${nombre} no tiene «Reintentar»`);
  }
});

prueba("la franja y la pantalla de bloqueo no muestran un monto", () => {
  for (const [nombre, src] of [["BloqueoCuenta", bloqueo], ["AvisoCuentaBanner", banner]]) {
    const codigo = sinComentarios(src);
    for (const prohibido of [/_cop\b/, /\bpesos\(/, /\bplata\(/, /getMiSuscripcion/, /toLocaleString/]) {
      assert.ok(!prohibido.test(codigo), `${nombre} nombra ${prohibido}: la plata va tras un clic`);
    }
  }
  assert.ok(!/MiSuscripcion/.test(sinComentarios(banner)), "la franja no puede montar la vista con montos");
});

prueba("en BloqueoCuenta la plata está detrás de un clic, y sólo para la dueña", () => {
  const codigo = sinComentarios(bloqueo);
  assert.ok(/const \[verSuscripcion, setVerSuscripcion\] = useState\(false\)/.test(codigo),
    "«Ver suscripción» tiene que arrancar cerrado");
  const aperturas = [...codigo.matchAll(/setVerSuscripcion\(true\)/g)];
  assert.equal(aperturas.length, 1, "sólo un camino abre la suscripción");
  assert.ok(/onClick=\{\(\) => setVerSuscripcion\(true\)\}/.test(codigo), "se abre con un clic, no sola");
  assert.ok(/if \(verSuscripcion && duena\)/.test(codigo), "la vista con montos exige que sea la dueña");
  assert.ok(/\{duena && \(\s*<button[\s\S]*?Ver suscripción/.test(codigo), "el botón es sólo para la dueña");
  assert.ok(/\{duena && onVerSuscripcion && \(/.test(sinComentarios(banner)),
    "en la franja, «Ver suscripción» también es sólo para la dueña");
});

prueba("la API de la suscripción sólo la usa la vista de la dueña", () => {
  const fuera = [];
  const recorrer = (rel) => {
    for (const e of readdirSync(join(raiz, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) recorrer(r);
      else if (/\.tsx?$/.test(e.name) && r !== "src/api/suscripcion.ts" && !r.startsWith("src/components/suscripcion/")) {
        const src = sinComentarios(readFileSync(join(raiz, r), "utf8"));
        if (/\b(getMiSuscripcion|guardarMiFacturacion)\b/.test(src)) fuera.push(r);
      }
    }
  };
  recorrer("src");
  assert.deepEqual(fuera, [], "la plata de la suscripción se pide fuera de su vista");
});

prueba("«Suscripción» en Configuración tiene el filtro de la copia de seguridad", () => {
  const seccion = (nombre) => {
    const i = dashboard.indexOf(`function ${nombre}(`);
    assert.ok(i >= 0, `Dashboard.tsx no tiene ${nombre}`);
    return dashboard.slice(i, dashboard.indexOf("\n}\n", i));
  };
  const filtro = /if \(rolCliente && rolCliente !== "owner"\) return null;/;
  assert.ok(filtro.test(seccion("CopiaSection")), "la copia de seguridad perdió su filtro");
  assert.ok(filtro.test(seccion("SuscripcionSection")), "«Suscripción» no tiene el filtro de la dueña");
  assert.ok(/<SuscripcionSection /.test(dashboard), "«Suscripción» no está montada en Configuración");
});

console.log(`\n${hechas} pruebas del corte por estado de cuenta`);
