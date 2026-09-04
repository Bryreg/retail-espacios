# Fase 4 — Consola de Plataforma · Plan del Maestro Orchestrator (Fable)

Repo: `/tmp/retail-espacios-test` · rama `claude/fase-4-plataforma` (desde `main`, con Fases 1–3 mergeadas). **Nadie hace commit ni push.**
Spec vinculante: `features/plataforma/spec.md` (lista de agregados TAXATIVA; enmienda del operador exacta). Reglas duras: `docs/ESTADO.md`.

---

## 1. Análisis (lo que leí en el código, no en la spec)

**Las tres superficies y sus trampas reales:**

1. **Backend de agregados.** `app/routers/plataforma.py` hoy JAMÁS abre una base de cliente (su docstring lo declara como contrato). La enmienda abre UNA puerta quirúrgica: `GET /api/plataforma/metricas`. El recorrido de bases es el patrón de `_run_lease_maintenance` (`app/main.py:108`): `listar()` + try/except por cliente, uno roto no tumba el resto. La "bitácora del REGISTRO" que pide la spec **no existe todavía**: `audit_log` (`AuditEntry`) vive adentro de cada base de cliente — anotar la consulta del operador ahí sería abrir la base del cliente para escribir, exactamente lo prohibido. Hace falta **tabla nueva del registro** (`bitacora_plataforma`), permitida por la regla (tablas nuevas sí, columnas no).

2. **La puerta del operador sin membresías es el seam más peligroso de la fase.** Hoy `/oauth` da 403 sin membresías (routers/auth.py: "Tu cuenta no tiene acceso a ningún cliente"). Y no alcanza con dejar de dar 403: `require_auth` depende de `get_db` → `sesion_para_pedido` → `cliente_del_pedido`, y `decode_token` chequea `_membresia_activa(sub, cliente)` cuando el token trae `sub`. Un token sin slug cae en `unico()` y **abre la base del único cliente** (agujero de privacidad); un token con slug inventado da 401 hasta en `/api/plataforma/*`. La solución que fijo: token con `cliente="plataforma"` (slug **reservado** en el alta — ningún cliente real puede llamarse así), que (a) en `decode_token` valida `es_operador(email)` en vez de membresía — de paso, sacar a alguien de `OPERADOR_EMAILS` le mata el token en el próximo request —, y (b) en `cliente_del_pedido` resuelve SOLO bajo `/api/plataforma/*` (contra la base por defecto, que es la del registro, para el chequeo de época) y da 401 en cualquier otro path, por construcción.

3. **Frontend.** `App.tsx` monta `BrowserRouter` solo con sesión y hoy tiene una única ruta `/`; el modal `PlataformaPanel.tsx` se abre desde Dashboard. Trampa encontrada: con token puesto, `App.tsx` arranca `startAutoSync()` → los endpoints de layout con el token "plataforma" dan 401 → **el interceptor de `api/client.ts` borra la sesión**: el operador quedaría deslogueado a los dos segundos de entrar. La sesión de plataforma debe suprimir el autosync (y el guard de la SPA es cortesía: el 403 del backend manda).

**Métricas con trampa contable (lección de vitrinas):** el consolidado NO puede ser promedio de promedios (canon) ni promedio de porcentajes (ocupación) — se consolida por sumas y se recalcula. El universo de "espacios comercializables" vive en el JSON del layout (`rentable` ausente = comercializable; góndola doble = 2 caras, sufijo `-B`, código completo `SEDE-CODE`), mientras los contratos viven en `spaces`/`space_leases` — hay contratos sembrados sobre espacios sin mueble en el plano (ESTADO.md lo documenta): cuentan para canon/ingreso/top, NO para ocupación, o el porcentaje puede pasar de 100.

**Higiene de tests (R-0, ESTADO.md):** antes de cada corrida completa, `rm -f backend/retail_espacios.db backend/recabra_*.db` — la suite solo está verde la primera vez sobre un checkout sucio.

---

## 2. Decisiones que FIJO (los builders no las renegocian)

### 2.1 Contrato del JSON de métricas (idéntico en backend y frontend)

`GET /api/plataforma/metricas?periodo=YYYY-MM` · `require_operador` (403 si no) · 422 si `periodo` malformado · sin parámetro = mes calendario en curso (UTC).

```json
{
  "periodo": { "anio_mes": "2026-09", "desde": "2026-09-01", "hasta": "2026-09-30" },
  "generado_en": "2026-09-04T15:04:05+00:00",
  "de_cache": false,
  "consolidado": {
    "clientes_total": 4,
    "clientes_con_error": 1,
    "sedes_con_plano": 7,
    "espacios_comercializables": 212,
    "ocupacion_pct": 63.2,
    "canon_promedio_mensual": 1480000.0,
    "ingreso_contratado_mes": 41500000.0,
    "top_proveedores": [ { "nombre": "Alpina", "contratos_activos": 9 } ],
    "usuarios_con_cuenta": 31
  },
  "clientes": [
    {
      "slug": "galerias", "nombre": "Galerías",
      "estado_cuenta": "activo",
      "error": null,
      "metricas": {
        "sedes_con_plano": 3,
        "espacios_comercializables": 106,
        "ocupacion_pct": 54.7,
        "canon_promedio_mensual": 1350000.0,
        "ingreso_contratado_mes": 18400000.0,
        "top_proveedores": [ { "nombre": "Alpina", "contratos_activos": 5 } ],
        "usuarios_con_cuenta": 12,
        "ultimo_acceso": "2026-09-03"
      }
    },
    { "slug": "roto", "nombre": "Roto", "estado_cuenta": "activo",
      "error": "No se pudo leer la base de este cliente.", "metricas": null }
  ]
}
```

Semántica fija:
- **Universo**: TODAS las filas de `clientes` del registro (activas e inactivas; suspendidos incluidos — guardrail de la spec). `estado_cuenta` con la misma regla que `GET /plataforma/clientes` (fila ausente en `estados_cliente` = `"activo"`).
- **Contrato activo en el período** = `start_date <= hasta AND end_date >= desde` (rangos inclusivos en ambos extremos — regla del repo; un contrato de un día es válido).
- **`espacios_comercializables`** = caras vendibles del JSON de `layout_snapshots`: semántica `isRentable` replicada server-side (`rentable` ausente = comercializable; solo `false` explícito excluye) y góndola doble = 2 caras (`fixture.faceB`, sufijo `-B`); códigos completos `SEDE-CODE` (`fullSpaceCode`).
- **`ocupacion_pct`** = caras comercializables con contrato activo en el período / `espacios_comercializables` × 100, 1 decimal; `null` si denominador 0. Un contrato sobre un espacio sin mueble en el plano NO cuenta para ocupación (sí para canon/ingreso/top).
- **`canon_promedio_mensual`** = promedio de `monthly_rent` de contratos activos del período; `null` si no hay. Consolidado **PONDERADO**: suma de todos los canones / nº total de contratos activos de los clientes legibles — jamás promedio de promedios.
- **`ingreso_contratado_mes`** = suma de `monthly_rent` de contratos activos del período, sin prorrateo ("contratado", no "devengado").
- **`top_proveedores`** = máx 5 por nº de contratos activos del período, descendente, empates alfabéticos; cada objeto EXACTAMENTE `{nombre, contratos_activos}` — nunca id, email, teléfono ni contacto.
- **`usuarios_con_cuenta`** = usuarios distintos con membresía ACTIVA del cliente (tabla `membresias` del REGISTRO — no toca la base del cliente). **`ultimo_acceso`** = fecha `YYYY-MM-DD` (sin hora, sin identidad) del `ultimo_login` más reciente de esos usuarios; `null` si nadie entró.
- **Consolidado** excluye los clientes con `error` de todo agregado y los cuenta en `clientes_con_error`. `ocupacion_pct` consolidada = suma de ocupadas / suma de comercializables.
- **Frontera**: los ÚNICOS arrays de toda la respuesta son `clientes` y `top_proveedores`. Ninguna fila de negocio, ningún valor de contrato individual, ningún correo/nombre de usuario final, ninguna nota/foto/bitácora de cliente. `error` es texto corto fijo y JAMÁS contiene la URL/credenciales de la base ni el mensaje crudo del driver.
- **Cache**: 5 min en memoria del registro, por `anio_mes`, con candado (patrón de `plataforma_estado._estado_cache`) y helper de limpieza para tests. `de_cache: true` en hits; `generado_en` = momento del cálculo.
- **Bitácora**: tabla NUEVA del registro `bitacora_plataforma` (`id, email, accion="metricas", periodo, en` UTC). Se anota **CADA consulta, hit de cache incluido** — la bitácora registra el acceso, no el cálculo.

### 2.2 Contrato `/oauth` (bifurcación del operador sin membresías)

- Sin membresías activas **y** `es_operador(email)` → 200 con token en vez de 403. La respuesta gana el campo top-level `"plataforma": true` y `"cliente": "plataforma"` / `"cliente_nombre": "Plataforma"`; **la FORMA del JWT no cambia** (mismos claims de siempre: `role`, `epoca`, `cliente`, `sub`, `email`) — cambian los valores: `role="worker"` (mínimo privilegio), `cliente="plataforma"` (slug reservado), `epoca` leída de la base por defecto.
- Sin membresías y NO operador → el 403 de hoy, byte a byte.
- Operador CON membresías → flujo actual intacto (elige cliente, entra normal, ve el botón del Topbar). Sin `plataforma: true`.
- Invariantes del token plataforma: `decode_token` lo valida con `es_operador(email)` en lugar de `_membresia_activa` (solo cuando `cliente=="plataforma"`); `cliente_del_pedido` lo resuelve SOLO bajo `/api/plataforma/*` (contra la base por defecto/registro) y responde 401 en cualquier endpoint de negocio, **por construcción**. Login legado intocado.

### 2.3 VERSION_POLITICA: NO se sube — aclaración editorial, con justificación

El punto nuevo declara que el operador ve **métricas agregadas** del negocio de cada cliente. Fallo que NO amerita re-consentimiento (mantener `2026-09-v1`), por tres razones que el builder legal documenta en su output y el punto marca `[VALIDAR CON ABOGADO]`:
1. Los agregados **no contienen datos personales por construcción** (Ley 1581: dato personal = vinculable a persona natural determinada/determinable): números, nombres comerciales de proveedores (+conteo) y una fecha de último acceso sin identidad. No hay tratamiento nuevo de datos de titulares.
2. Lo que cambia es la relación **RECABRA↔cliente (empresa)**, no titular↔responsable; el consentimiento del titular no versa sobre eso.
3. La política sigue siendo **BORRADOR** con `[COMPLETAR]` (ESTADO.md: "no publicar sin abogado"); disparar el 428 de re-consentimiento a todos los usuarios por una aclaración de un borrador sería castigar el flujo por un cambio que no altera su tratamiento. Si el abogado opina lo contrario, subir la versión es un cambio de una constante + el encabezado, y queda anotado como pendiente.

### 2.4 Rutas y territorio

- `/metricas` se declara en `plataforma.py` junto a las literales, ANTES de `/clientes/{slug}` y `/supresiones/{solicitud_id}` (regla: literales antes de paramétricas).
- Sin librería de charts: SVG/CSS propio con los tokens de `frontend/src/index.css`. Justificación: son ≤2 gráficos sobrios (barras de ocupación por cliente, barras del top de proveedores); una librería de charts es una dependencia nueva, un bundle más pesado y un sistema visual ajeno para dos vistas que un `<div>` con `width:%` y un `<svg>` de 30 líneas resuelven dentro del design system.
- **Territorios DISJUNTOS** (nadie pisa archivo de otro):
  - `backend-metricas`: `backend/app/**` + `backend/tests/test_plataforma_metricas.py`.
  - `frontend-consola`: `frontend/src/**` EXCEPTO `frontend/src/legal/**`.
  - `legal-politica`: `docs/legal/**`, `frontend/src/legal/**`, `docs/ESTADO.md`.
  - `auditor-contador`: `backend/tests/test_metricas_conciliacion.py` + `features/plataforma/outputs/conciliacion-metricas.md`.
  - `auditor-privacidad`: `backend/tests/test_metricas_ataques.py` + `features/plataforma/outputs/red-team-metricas.md`.

---

## 3. El equipo (5 agentes: 3 builders + 2 auditores)

| id | rol | modelo | base de catálogo | superficie |
|---|---|---|---|---|
| `backend-metricas` | builder | **opus** | `agente-backend.md` | agregados read-only, cache, bitácora del registro, tolerancia a fallos, bifurcación `/oauth` |
| `frontend-consola` | builder | sonnet | `agente-frontend.md` (métricas inspiradas en `agente-analytics.md`) | ruta `/plataforma`, mudanza del modal, panel de métricas, post-login del operador |
| `legal-politica` | builder | sonnet | `agente-legal.md` | punto en la política (×2 copias byte a byte), enmienda en ESTADO.md, fallo de versión |
| `auditor-contador` | auditor | **opus** | `agente-contador.md` | fórmulas contra datos sembrados; conciliación consolidado↔filas (lección de vitrinas) |
| `auditor-privacidad` | auditor | **opus** | `agente-backend.md` adaptado a red team (precedente: `tests/test_plataforma_ataques.py`) | qué se filtra por el JSON; el token plataforma contra todo endpoint de negocio |

Backend lleva opus porque concentra los dos riesgos máximos (frontera de privacidad + seam de auth); los dos auditores llevan opus porque su fracaso es silencioso (una cifra que no cuadra, un correo que se cuela). Los builders corren en paralelo con los contratos de §2 fijados textualmente en sus misiones; los auditores corren después, sobre lo construido.

Misiones completas y autocontenidas: en el retorno estructurado de este mismo run (campo `mision` de cada agente). Verificación de cierre para el Conciliador: los 10 checks de la spec + suite completa verde DOS veces seguidas (con `rm -f backend/retail_espacios.db backend/recabra_*.db` antes de cada corrida) + `cd frontend && npx tsc --noEmit` limpio + los dos reportes de auditoría sin hallazgos bloqueantes.

## 4. Riesgos que quedan sobre la mesa

- El chequeo de época del token plataforma corre contra la base por defecto (que es también la de GALERIAS): un cambio de contraseña del rol `worker` de GALERIAS invalida tokens de operador. Aceptable (revalidan con Google en un click) y documentado; la alternativa (saltarse la época) debilita la revocación.
- El cache de métricas es por proceso: con más de un worker de uvicorn habría un cálculo por proceso. Hoy Render corre uno; anotado en ESTADO.md como pendiente conocido.
- `ultimo_acceso` sale de `ultimo_login`, que solo se actualiza en `/oauth`: usuarios de login legado no mueven la fecha. Documentado en la UI como "último acceso con cuenta".
