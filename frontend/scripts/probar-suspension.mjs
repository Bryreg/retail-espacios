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
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

console.log(`\n${hechas} pruebas del corte por estado de cuenta`);
