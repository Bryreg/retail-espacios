# ENTREGA — Fase 6: Asesoría (oportunidad de precio + cohortes de adopción)

Rama `claude/fase-6-asesoria` sobre `8068705` (spec). Sin commit ni push.
Equipo: backend-asesoria (sonnet, builder), frontend-asesoria (sonnet, builder),
contador-asesoria (opus, auditor), frontera-asesoria (opus, auditor).
Una sola ronda, coherente, cero conflictos entre agentes. Verificación: pasa.

## 1. Qué se construyó

**Backend (`backend/app/plataforma_metricas.py`, modificado).**
- `spread_pct = (Σ canon_con_tarifa / Σ tarifa_aplicable − 1) × 100` por
  cliente, con K=3 sobre el número de contratos con tarifa aplicable
  (`_spread`, misma constante `K_MINIMO_CONTRATOS`). Tarifa aplicable =
  `by_sede[SEDE][tipo]` si existe y es > 0, si no `default[tipo]` > 0, si no
  ninguna (`_tarifa_aplicable`). El mapa `codigo_completo -> (SEDE, tipo)` se
  arma en la misma pasada que ya abre el plano (`_numeros_del_layout` gana un
  tercer retorno). Las tarifas se leen con `reference_rates_raw` + la misma
  regla `_clean_rates` de `routers/layout.py`, en la sesión ya abierta.
- Campos públicos nuevos en `/api/plataforma/metricas`, por cliente:
  `spread_pct`, `tarifa_configurada`, `contratos_sin_tarifa`. Consolidado:
  `spread_pct` (ponderado Σ/Σ sobre clientes legibles con tarifa, calculado en
  `_consolidar`, sólo `/metricas`) y `clientes_con_tarifa`.
- Cinco crudos internos (`canon_con_tarifa`, `tarifa_total`,
  `contratos_con_tarifa`, `contratos_sin_tarifa`, `tarifa_configurada`) que
  no entran a `publicas_desde_crudos` (la tendencia de Fase 5 reconstruye
  crudos desde disco sin esas claves).
- `calcular()` se partió en `_calcular` (devuelve además `{slug: nº contratos
  activos}` de los legibles, uso interno) y un wrapper con la firma de
  siempre. Caché nuevo `_cache_contratos`, mismo TTL de 5 min, mismo
  `limpiar_cache_metricas()`.

**Backend (`backend/app/plataforma_adopcion.py`, NUEVO, 207 líneas).**
`calcular_adopcion()`: todo desde el registro (`ClienteRow`, `EstadoCliente`,
`Membresia`, `Usuario.ultimo_login`, `Fundacion.creado_en`) más
`contratos_activos_por_cliente`. Clasificación única en backend, precedencia
`sin_cuentas → nueva → activa → fantasma → dormida`. Cohorte = mes de la
`Fundacion` más antigua del slug, o `ClienteRow.creado`, o `null`. Cohortes
con retención 30d = activos_30d / total, ascendentes por mes.

**Router (`backend/app/routers/plataforma.py`).** `GET /api/plataforma/adopcion`,
`require_operador`, literal, declarado tras `/tendencia` y antes de
`/supresiones/{id}` y `/clientes/{slug}`. Bitácora siempre, `accion="adopcion"`,
`periodo=<YYYY-MM UTC>`, después de calcular.

**Frontend.**
- `frontend/src/api/plataforma.ts`: campos nuevos en
  `AgregadosMetricasCliente` y `ConsolidadoMetricas`; tipos `Clasificacion`,
  `CohorteAdopcion`, `ClienteAdopcion`, `Adopcion`; `getAdopcion()` (nunca en
  `localStorage`).
- `frontend/src/pages/Plataforma.tsx`: columna "vs tarifa" (`−12,4 %` /
  `+3,1 %` / `Suprimido ‹3` / `sin tarifa`), `W_SPREAD = 96`, `minWidth`
  760 → 856; `KpiTile` "VS TARIFA DE REFERENCIA" en el hero con la lectura
  "la cartera cobra X % por debajo de sus tarifas de referencia"; montaje de
  `PanelAdopcion`.
- `frontend/src/components/plataforma/adopcion.tsx` (NUEVO, 284 líneas):
  `useAdopcion()`, `PanelAdopcion` (tabla de cohortes + "A quién llamar hoy"
  con fantasmas primero, estado vacío honesto), `ClasificacionPill`.
  Reusa primitivas de `consola.tsx` y tokens `--con-*`; sin librerías nuevas.

**Docs y legal.** `docs/legal/politica-datos.md` §5.3 y su copia en
`frontend/src/legal/` (+56 líneas cada una, byte-idénticas) declaran los
campos nuevos. `VERSION_POLITICA` no se subió; la justificación y dos
preguntas `[VALIDAR CON ABOGADO]` están dentro del documento.
`docs/ESTADO.md` ganó la sección "Fase 6 — Asesoría" (ver §5, hay que
corregirla).

**Tests nuevos.** `test_plataforma_spread.py` (11), `test_plataforma_adopcion.py`
(12), `test_asesoria_contador.py` (20 + 1 xfail), `test_asesoria_ataques.py`
(17 + 2 xfail). Listas blancas actualizadas en `test_metricas_ataques.py`,
`test_metricas_conciliacion.py`, `test_plataforma_metricas.py`.

**Guardrails.** Sin migraciones, sin tablas nuevas, sin librerías nuevas.
Frontera del operador intacta: solo lectura, solo agregados, bitácora.

## 2. Coherencia

Ronda 1 coherente, sin conflictos. El frontend se codificó contra el contrato
JSON del Maestro; el backend lo implementó idéntico; los auditores atacaron
código real, no papel. Ningún agente pisó territorio ajeno: los auditores
escribieron un solo archivo de test cada uno (más la política de datos, que
la spec asignaba a la frontera).

## 3. Verificación (Verificador, con sonda propia)

- `tsc --noEmit` exit 0. `npm run build` exit 0 (2216 módulos, 12,51 s; único
  warning: chunk > 500 kB, preexistente).
- Suite completa, dos veces en serie, `.db` borradas entre corridas, build
  terminado antes del primer pytest: `PYTEST_EXIT=0` ambas. 790 tests,
  780 passed, 10 xfailed (strict), 0 failed, 0 xpassed, patrón idéntico.
  Ningún test de Fases 1–5 cambió de resultado.
- Sonda independiente (`scratchpad/sonda_verif_f6.py`, no reusa cuentas del
  código de producción): 46 comprobaciones, 0 fallos.
  - Spread: 3 × 900.000 vs default 1.000.000 → `-10.0` exacto; 2 contratos →
    `null` con `tarifa_configurada=true`; sin tarifa → `null`,
    `tarifa_configurada=false`, `contratos_sin_tarifa=3`.
  - by_sede gana al default; código fuera del plano cuenta en
    `contratos_sin_tarifa` y no suma (test_04/05/06/08b del contador, 5 passed).
  - Consolidado a mano: 7.000.000 / 9.938.268 = 0,704348 → `-29.6`, igual al
    JSON. Promedio de spreads publicados = `-30.7`: difieren 1,1 puntos.
    `clientes_con_tarifa = 3`.
  - Grep de montos sembrados (1.000.000, 1.234.567, 3.000.000, 4.938.268,
    2.000.000, 9.938.268 × 3 formatos = 18 búsquedas) sobre el cuerpo de
    `/metricas`: ninguna aparece.
  - Adopción: fantasma (45 d sin acceso, contratos activos), activa (3 d),
    nueva (alta 10 d, nunca entró, `dias_sin_acceso=null`), sin_cuentas
    (membresías desactivadas, `usuarios_con_cuenta=0`). Cohortes 2026-02 → 3
    clientes, 33,3 %; 2026-08 → 1; 2026-09 → 5, 80,0 %. Ascendente.
  - `/adopcion`: operador 200, dueño de cliente 403, sin token 401. Bitácora:
    1 fila `accion='adopcion'`, `periodo='2026-09'`, correo del operador.
    Cuerpo sin ningún `@`.
- `cmp` de las dos políticas de datos: idénticas.
- 8 capturas en `features/asesoria/outputs/capturas/` (claro/oscuro × página
  completa, adopción, tabla vs tarifa, tile spread), tomadas contra server
  real con datos sembrados y revisadas a ojo. Server matado, `.db` de
  captura borradas.

## 4. Conflictos y hallazgos abiertos

No hay conflictos entre agentes. Hay cuatro hallazgos documentados con
`xfail(strict=True)` o caracterización, ninguno regresión:

| # | Sev | Dónde | Qué | Marcador |
|---|---|---|---|---|
| H-1 | MEDIA | `plataforma_metricas.py:843-848` | El consolidado suma `canon_con_tarifa`/`tarifa_total`/`contratos_con_tarifa` de TODOS los legibles con tarifa, incluidos los suprimidos por K=3. Con dos clientes legibles y `contratos_sin_tarifa=0`, el operador despeja por diferencia la Σ tarifa y el spread del suprimido. No sale del JSON, pero se reconstruye. | `test_asesoria_ataques.py` a17, xfail strict |
| H-2 | BAJA | decisión de la spec | Con exactamente 3 contratos del mismo tipo y sede, `ingreso/(3×(1+spread/100))` estima la tarifa unitaria con error < 0,05 %. Es el K=3 aceptado, ya documentado en ESTADO. | a18, sin xfail (medido) |
| H-3 | BAJA | `plataforma_adopcion.py:115-122` | "Base ilegible" se deduce de la AUSENCIA del slug en `_cache_contratos`. Un cliente fundado con el caché caliente (5 min) sale con `error` y `con_contratos_activos=false`: el operador llamaría a un cliente sano a avisarle que su base está caída. Es el caso normal de un alta self-service. | a19, xfail strict |
| H-4 | BAJA | `plataforma_adopcion.py:101` | `< DIAS_RECIENTE` en vez de `<=`: un acceso hace exactamente 30 días clasifica dormida/fantasma en vez de activa y baja la retención de su cohorte. Arreglo de una letra. | `test_asesoria_contador.py:803` (10e), xfail strict |

Recomendación del Maestro: H-4 arreglar en este PR (una letra, quitar el
xfail). H-3 arreglar en este PR o en uno inmediato: distinguir "slug no está
en el caché porque nació después" de "base ilegible" (p. ej. que `_calcular`
devuelva también el conjunto de slugs ilegibles, o invalidar
`_cache_contratos` en `crear_cliente`). H-1 decidir con el humano: excluir
del consolidado a los suprimidos (cambia la semántica "todos los legibles con
tarifa" de la spec) o aceptar el riesgo y dejarlo escrito como H-2. H-2 ya
está aceptado.

## 5. Texto para `docs/ESTADO.md` — sección "Fase 6 — Asesoría"

La sección ya existe en la rama (escrita por backend-asesoria). Dos cambios
obligatorios antes del PR:

**(a) Reemplazar** el párrafo de apertura, que dice "Backend completo; frontend
queda para la sesión de esa fase", por:

> Cierra el roadmap de asesoría de la consola con las dos lecturas que faltaban
> para que una sesión tenga algo concreto que recomendar: **oportunidad de
> precio** (spread canon vs tarifa de referencia) y **cohortes de adopción**
> (cuentas fantasma). Backend y frontend completos en esta fase.

**(b) Agregar**, después del bloque "Conteo de contratos para adopción (parte B)"
y antes de "### Pendientes conocidos: clientes y plataforma":

> **Decisión de privacidad del spread (vinculante).** La tarifa de referencia
> es estrategia comercial del cliente y NUNCA cruza la frontera del operador:
> ni su valor, ni Σ tarifa, ni un promedio, ni por sede. Sólo viaja la
> relación `spread_pct`. Lista taxativa de campos nuevos en `/metricas`:
> por cliente `spread_pct` (`null` por dos motivos distintos: sin tarifa o
> K=3), `tarifa_configurada` (bool), `contratos_sin_tarifa` (conteo de
> contratos activos sin tarifa aplicable: código fuera del plano o tipo sin
> tarifa ni por sede ni default); consolidado `spread_pct` (ponderado
> Σ canon / Σ tarifa de los legibles con tarifa, nunca promedio de spreads) y
> `clientes_con_tarifa`. Lista negra test-enforced: ninguna otra clave con
> `tarifa`, `rates`, `by_sede`, `default`. Riesgo aceptado (K=3): con
> exactamente 3 contratos con tarifa del mismo tipo, el ingreso publicado
> deja estimar la tarifa unitaria; es la misma aceptación que ya rige el
> canon promedio. Histórico del spread fuera de alcance (SIN MIGRACIONES).
>
> **Clasificación de adopción.** Se calcula UNA vez en el backend
> (`plataforma_adopcion.py`), el frontend nunca la re-deriva. Precedencia:
> `sin_cuentas` (cero membresías activas — cliente legado con claves
> compartidas) → `nueva` (alta hace menos de 30 días) → `activa` (algún
> `ultimo_login` en 30 días) → `fantasma` (contratos activos este período y
> nadie entró en 30+ días o nunca — la señal que la asesoría busca) →
> `dormida` (sin contratos y sin acceso). Cohorte = `YYYY-MM` de la
> `Fundacion` más antigua del slug, o `ClienteRow.creado`, o `null` ("sin
> fecha de alta", no se inventa). Retención por cohorte = clientes con acceso
> en 30 días / clientes de la cohorte. Por cliente viaja `cohorte`,
> `usuarios_con_cuenta`, `usuarios_activos_30d`, `dias_sin_acceso` (`null`
> si nadie entró nunca), `estado`, `con_contratos_activos`, `clasificacion`.
> Ningún correo, nombre ni id de usuario; fechas sin hora salvo
> `generado_en`.
>
> **Endpoint `GET /api/plataforma/adopcion`.** Sin parámetros (`?periodo`
> se ignora; siempre el mes en curso UTC). `require_operador`: sin token 401,
> admin legado 403, dueño de cliente 403, operador 200; `OPERADOR_EMAILS`
> vacía cierra para todos. Bitácora siempre, `accion="adopcion"`,
> `periodo=<YYYY-MM>`, después de calcular; con caché compartido cada fila
> lleva el correo del operador que consultó. Métodos distintos de GET → 405.
> Responde `{ periodo, generado_en, cohortes: [...], clientes: [...] }`
> (fantasmas primero en el frontend). No abre ninguna base de cliente que
> `/metricas` no abra ya: usa `contratos_activos_por_cliente` (parte B).
>
> **Frontend (`/plataforma`).** Columna "vs tarifa" en la tabla de clientes
> con tres estados (`−12,4 %` / `+3,1 %` en tinta, ámbar cuando negativo;
> `Suprimido ‹3` con ojo tachado; `sin tarifa` apagado); tile en el hero
> "VS TARIFA DE REFERENCIA" con la lectura en palabras; panel "Adopción"
> debajo de "Tendencia" con tabla de cohortes (mes, clientes, retención 30d,
> desglose por badge) y lista "A quién llamar hoy". `components/plataforma/
> adopcion.tsx`; primitivas de `consola.tsx`, tokens `--con-*`, claro y
> oscuro, sin librerías nuevas, bajo la CSP de Fase 3. `getAdopcion()` nunca
> toca `localStorage`.
>
> **Pendientes conocidos de Fase 6** (xfail strict; la suite se rompe si
> alguien los arregla sin quitar el marcador):
> - H-1 (media): el consolidado incluye a los clientes suprimidos por K=3;
>   con dos legibles y `contratos_sin_tarifa=0` se despeja el spread del
>   suprimido por diferencia (`test_asesoria_ataques.py` a17).
> - H-3 (baja): "base ilegible" en adopción se deduce de la ausencia del slug
>   en `_cache_contratos`; un cliente fundado con el caché caliente sale 5
>   minutos con `error` y `con_contratos_activos=false` (a19).
> - H-4 (baja): `plataforma_adopcion.py:101` usa `<` en vez de `<=` sobre
>   `DIAS_RECIENTE`; el día 30 exacto clasifica mal
>   (`test_asesoria_contador.py` 10e).

## 6. Qué le queda al humano

1. `git add` de lo no trackeado antes de commitear: `backend/app/
   plataforma_adopcion.py`, `frontend/src/components/plataforma/adopcion.tsx`,
   los cuatro tests nuevos (`test_plataforma_spread.py`,
   `test_plataforma_adopcion.py`, `test_asesoria_ataques.py`,
   `test_asesoria_contador.py`) y `features/asesoria/outputs/`. El
   `git diff --stat` actual (12 archivos, +816 −21) subestima la fase.
2. Aplicar §5 a `docs/ESTADO.md` (corregir "frontend queda para la sesión" y
   agregar el bloque).
3. Decidir H-1 (excluir suprimidos del consolidado vs aceptar y documentar).
   Arreglar H-4 (`<=`) y, si entra, H-3; quitar los xfail correspondientes.
4. Validar con abogado las dos preguntas `[VALIDAR CON ABOGADO]` en
   `docs/legal/politica-datos.md` §5.3 y decidir si `VERSION_POLITICA` sube
   (si sube, en las dos copias, byte-idénticas).
5. Mirar las 8 capturas en `features/asesoria/outputs/capturas/`.
6. Commit, PR contra `main`, merge → auto-deploy en Render. En producción,
   `spread_pct` va a salir `null` con `tarifa_configurada=false` para casi
   todos al principio: es el estado esperado, no un bug.
7. Cargar en Engram (desde la máquina local) el gotcha `datetime` es subclase
   de `date` (ya escrito en ESTADO) y la decisión de privacidad del spread.
