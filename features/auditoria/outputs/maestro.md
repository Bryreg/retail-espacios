# Maestro — triage de la auditoría integral (post Fase 6)

Verificación hecha por mí antes de decidir (sólo los tests que reproducen cada
hallazgo, `TMPDIR=/tmp/pt-maestro`):

```
tests/test_auditoria_bugs.py::test_bugs_1_...                      PASSED  (verde: caracteriza el bug con pytest.raises)
tests/test_auditoria_frontera.py::test_f09_... (frontera-5)        XFAIL   (falla como anuncia: el despeje da el canon al peso)
tests/test_auditoria_frontera.py::test_f06_... (frontera-2)        XFAIL
tests/test_auditoria_hardening.py::test_h1_files_...               PASSED  (leyó 2.097.156 bytes antes del 413)
tests/test_auditoria_hardening.py::test_h1b_mounts_...             PASSED
tests/test_auditoria_hardening.py::test_h1c_login_...              PASSED  (5 MB de body pre-auth, 401)
tests/test_auditoria_compliance.py::test_compliance1_...           XFAIL
tests/test_auditoria_ingresos.py::test_ingresos_1_...              XFAIL
```

Lo que agrego al leer el código, que los auditores no vieron:

- `app/routers/catalogo.py:114` y `app/routers/planograms.py:109` tienen el
  MISMO `await file.read()` seguido de chequeo de tamaño que hardening-1/1b.
  Se arreglan con el mismo helper.
- frontera-3 propone rechazar períodos futuros con 422. **No se puede**: los
  tests existentes consultan meses futuros a propósito (`2026-10` en
  `test_metricas_ataques.py:1064`, `MES_SIN_NADA = "2026-11"` en
  `test_metricas_conciliacion.py`, noviembre en `test_plataforma_metricas.py:409`)
  porque un contrato que arranca el mes que viene se ve preguntando por ese
  mes. Lo que sí: no PERSISTIR snapshots de meses futuros, tope LRU al caché,
  y una ventana razonable (24 meses atrás, 12 adelante) fuera de la cual es 422.
- bugs-1 y frontera-5 tocan la misma función (`persistir_snapshots` /
  `consolidar_*`): van al mismo builder para no pisarse.

## Tabla de decisión

| id | sev (auditor) | sev (Maestro) | estado | builder |
|---|---|---|---|---|
| hardening-1 / 1b (+ catalogo, planograms) | alta | alta | ARREGLAR | backend-hardening |
| hardening-1c (sin tope de body pre-auth) | alta | alta | ARREGLAR | backend-hardening |
| bugs-1 (reconstrucción usa datos de hoy) | alta | alta | ARREGLAR | backend-plataforma |
| compliance-1 = frontera-2 (nombre crudo en disco) | alta / media | alta | ARREGLAR | backend-plataforma |
| frontera-5 (consolidado despeja el contrato único) | alta | alta, **decisión de producto** | DOCUMENTAR + escalar | — |
| ingresos-1 (Bearer basura reabre oráculo 402) | media | media, arreglo chico | ARREGLAR | backend-hardening |
| ingresos-2 (exenciones con `startswith`) | baja | baja, arreglo chico | ARREGLAR | backend-hardening |
| frontera-1 (saneo sólo ASCII) | media | media, arreglo chico | ARREGLAR | backend-plataforma |
| frontera-3 (periodo sin techo, caché sin tope, futuros persistidos) | media | media, arreglo chico | ARREGLAR (variante) | backend-plataforma |
| frontera-4 = ingresos-5 (registro sin purga) | media / baja | media | ARREGLAR | backend-plataforma |
| frontera-6 (GET supresiones/clientes sin bitácora) | media | media, arreglo chico | ARREGLAR | backend-plataforma |
| hardening-8 (gate pip-audit nunca falla) | media | media | ARREGLAR sólo el script | backend-hardening |
| compliance-2 (nada impide escribir `@` en el modelo) | media | baja | DOCUMENTAR (cae con compliance-1; una validación en el ORM es defensa opcional) | — |
| compliance-3 (token de invitación en el correo, política) | media | baja (texto legal) | DOCUMENTAR | — |
| ingresos-3 (leeway sobre exp) | baja | baja | DOCUMENTAR | — |
| ingresos-4 (falla de infra disfrazada de slug tomado) | baja | baja | DOCUMENTAR | — |
| hardening-2 (HSTS spoof) | baja | baja | DOCUMENTAR | — |
| hardening-9 (Dockerfile sin USER) | baja | baja | DOCUMENTAR (no verificable contra Render) | — |

### Por qué frontera-5 NO se arregla en esta rama

Está confirmado y es grave para la regla que la propia frontera declara
("jamás valores de contratos individuales"). Pero el comportamiento contrario
es una **decisión de producto escrita y test-enforced**: ESTADO.md ("el
ingreso consolidado sí suma a todos: ahí el total del negocio es el dato"),
`test_m26` (afirma que la plata del suprimido cuenta en el consolidado),
`test_metricas_conciliacion.py:1338` (afirma literalmente `consolidado − tres
== 400_000`), `test_plataforma_metricas.py:495/516`,
`test_plataforma_tendencia.py:632/670`. Cambiar la regla exige reescribir esas
expectativas en cinco archivos ajenos a los territorios, y además decidir QUÉ
regla: (a) sumar sólo publicables (precedente del spread, a17) o (b) sumar
también a los suprimidos sólo si entre todos juntan ≥ K contratos (el
residuo `consolidado − visibles` deja de ser un contrato y pasa a ser una
celda K-segura; conserva "total del negocio" en casi todos los meses reales).
Recomiendo (b). Va al usuario como la primera decisión pendiente de la
entrega; `f09` queda `xfail(strict)` como regresión hasta que se decida.
El Verificador debe dejarlo así, no borrarlo.

## Builders

Dos, territorios disjuntos. Ninguno toca `docs/ESTADO.md` (lo escribe el
Maestro en la ENTREGA con lo que reporten). Ninguno instala ni cambia
dependencias. Cada uno corre SOLO su archivo de tests del auditor + los tests
existentes que cubren los módulos que tocó, con `TMPDIR` propio; nunca la
suite completa ni `npm run build`.

- **backend-hardening** (`app/main.py`, `app/clientes.py`, `app/auth.py`,
  `app/routers/{files,mounts,catalogo,planograms,montaje}.py`, nuevo
  `app/services/subidas.py`, `.github/scripts/pip_audit_severity.py`,
  `tests/test_auditoria_hardening.py`, `tests/test_auditoria_ingresos.py`).
- **backend-plataforma** (`app/plataforma_metricas.py`,
  `app/plataforma_tendencia.py`, `app/routers/plataforma.py`,
  `tests/test_auditoria_frontera.py`, `tests/test_auditoria_bugs.py`,
  `tests/test_auditoria_compliance.py`; y sólo si un arreglo obliga,
  `tests/test_plataforma_tendencia.py`).

Las instrucciones por hallazgo van en la salida estructurada del Maestro.
