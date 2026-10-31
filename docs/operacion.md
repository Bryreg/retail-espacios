# RECABRA — operación y recuperación

El manual de lo que hace falta para que el servicio aguante solo y para volver de
un desastre. Lo que es estado del proyecto vive en `docs/ESTADO.md`
(*Operación y despliegue (2026-10-30)*); esto es el **cómo**. Escrito para el plan
**gratuito** de Render, que es el que se usa hasta justo antes del lanzamiento
comercial: nada de acá necesita consola, shell ni pre-deploy pagos.

---

## 1. Lo que hay que configurar una vez

Cada paso dice dónde se hace. Sin ellos el código está, pero no corre.

### En GitHub (Settings → Secrets and variables → Actions)

| Nombre | Tipo | Para qué |
|---|---|---|
| `RESPALDO_S3_BUCKET` | Secret, opcional | `s3://bucket/carpeta` en S3 o R2, para una segunda copia fuera de GitHub. |
| `RESPALDO_S3_ENDPOINT` | Secret, opcional | Sólo R2: `https://<cuenta>.r2.cloudflarestorage.com`. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` | Secrets, con el bucket | Las credenciales del bucket (en R2 la región es `auto`). Dale permiso sólo de escritura en esa carpeta. |
| `MANTENIMIENTO_TOKEN` | Secret | El mismo valor que la variable del servicio en Render (abajo). Lo usan el cron de mantenimiento **y el respaldo nocturno**. |
| `MANTENIMIENTO_URL` | Variable, opcional | Si el servicio no está en `https://retail-espacios.onrender.com`. |

Sin `MANTENIMIENTO_TOKEN`, los workflows `Respaldo nocturno` y `Mantenimiento
programado` se **saltean con un aviso**, no fallan.

**La base NO se abre a internet** (Render → la base → *Networking*: sin IPs
permitidas, «External traffic not allowed»). El respaldo no la necesita: lo toma
el servicio desde adentro (§2). GitHub no guarda ni la URL de la base ni la frase
de cifrado.

### En Render (el servicio → Environment)

| Variable | Valor |
|---|---|
| `JWT_SECRET` | A mano, aleatoria, 32 bytes o más: `openssl rand -base64 48`. **No viene del Blueprint.** Cambiarla cierra todas las sesiones. |
| `MANTENIMIENTO_TOKEN` | Aleatoria (`openssl rand -hex 32`), la misma que el secret de GitHub. Sin ella `POST /api/interno/mantenimiento` y `POST /api/interno/respaldo` dan 404. |
| `RESPALDO_PASSPHRASE` | Aleatoria (`openssl rand -base64 48`). La frase con la que el servicio cifra el respaldo. **Guardala también fuera de Render** (un gestor de contraseñas): sin ella el respaldo no se abre. Sin la variable, el respaldo contesta 409 y no entrega nada. |
| `CUOTA_BASE_MB` | `1024` en la base gratuita; la del plan contratado al cambiar. |
| `SENTRY_DSN` | Opcional: el DSN del proyecto de Sentry. Sin ella, nada. |
| `STATEMENT_TIMEOUT_S` | Opcional, `30` por defecto; `0` lo apaga. |
| `TERMINOS_VIGENTES` | Vacía hasta que el abogado entregue los términos. Con la versión (`2026-10-v1`) **y** el texto sin marcas de borrador, el alta y la dueña los aceptan. Ver `docs/legal/revision-2026-10-30.md` §4. |
| `RETENCION_*` | Opcionales: los plazos de conservación (§12). Sin ellas, los propuestos. |

### En Render (el servicio → Settings)

- **Build & Deploy → Auto-Deploy → «After CI Checks Pass»** (`autoDeployTrigger:
  checksPass` en `render.yaml`). Como el servicio se creó a mano, el Blueprint
  puede no estar sincronizado: hacelo también en el panel.
- **Health Check Path → `/api/health/ready`** (mismo motivo).

### En GitHub (Settings → Branches → Branch protection rules → `main`)

Para que nada llegue a `main` sin pasar el CI —y, con eso, a producción—:

1. *Add rule* (o *Rulesets → New branch ruleset*), patrón `main`.
2. **Require a pull request before merging** (sin aprobaciones obligatorias si
   trabajás solo).
3. **Require status checks to pass before merging** → buscá y marcá
   `Frontend · typecheck + build` y `Backend · pytest` (aparecen después de que
   corrieron una vez). Marcá también **Require branches to be up to date**.
4. **Do not allow bypassing the above settings** (si no, un admin puede saltearla
   sin querer).
5. Lo mismo para `staging` cuando exista.

---

## 2. El respaldo nocturno

`.github/workflows/respaldo.yml`, todas las noches a las 01:41 de Colombia (y a
mano: Actions → *Respaldo nocturno* → *Run workflow*).

**Desde adentro de Render.** La base no acepta conexiones de afuera, así que el
workflow no se conecta a ella: le pide el archivo al servicio
(`POST /api/interno/respaldo`, con `MANTENIMIENTO_TOKEN`), que la ve por la red
interna (`DATABASE_URL`), arma el respaldo en una carpeta temporal
(`services/respaldo_interno.py`), lo cifra con `RESPALDO_PASSPHRASE` y lo
devuelve. GitHub sólo recibe y guarda bytes cifrados. Lo que consume: unos
segundos de CPU y algo de disco temporal del servicio (se borra al terminar),
una lectura de la base y la transferencia del archivo comprimido; a las 01:41 no
hay nadie usando la app.

1. `backend/scripts/respaldar_plataforma.py` lista las bases —la del registro
   (que es también la de GALERIAS), cada `clientes.db_name` y toda `recabra_*`
   que exista aunque el registro no la nombre— y hace un `pg_dump -Fc` de cada una.
2. Empaqueta todo en un `.tar` y lo cifra con `gpg --symmetric` (AES256).
3. El workflow lo sube como **artefacto** (14 días) y, si está configurado, al
   **bucket**. La retención del bucket la pone su regla de ciclo de vida: en R2,
   *Bucket → Settings → Object lifecycle rules → Delete objects after 14 days*; en
   S3, *Management → Lifecycle rules → Expire current versions after 14 days*.

Si falla, el workflow queda en rojo y GitHub le manda un correo a quien lo
programó. El `MANIFIESTO.json` de adentro dice cuándo se tomó (UTC), cuánto pesa y
el sha256 de cada base.

**RPO** (cuánto se puede perder): como mucho, lo que pasó desde el último
respaldo verde — **24 horas**. Se mide mirando la hora del último *Respaldo
nocturno* verde en Actions (o `tomado_en` del manifiesto). Si un día falla, el RPO
de ese día es 48 h: por eso el correo de la falla hay que leerlo.

Lo que **no** cubre: los archivos que estén sólo en el navegador de alguien (los
planos sin guardar) y lo que se escriba después de las 01:41. La **copia de cada
supermercado** (Configuración → «Copia de seguridad», un ZIP que baja la dueña)
sigue existiendo y es otra cosa: la que tiene el cliente en su mano.

### Bajar y descifrar un respaldo

```bash
# Actions → Respaldo nocturno → la corrida → Artifacts → bajar el .zip
unzip recabra-respaldo-2026-10-30-0641.zip
gpg --decrypt recabra-respaldo-2026-10-30-0641.tar.gpg > respaldo.tar   # pide la frase
tar -xf respaldo.tar          # deja la carpeta respaldo/ con los .dump y MANIFIESTO.json
```

Del bucket: `aws s3 cp s3://bucket/carpeta/<nombre>.tar.gpg .` (con
`--endpoint-url` en R2) y lo mismo.

Necesitás `pg_restore` de la **misma versión mayor que el servidor, o más nueva**
(`psql "$URL" -Atc "SHOW server_version"`), y Python con
`pip install sqlalchemy psycopg2-binary`.

---

## 3. Restaurar la plataforma entera (la base de Render se perdió)

1. **Creá una base nueva en Render** (New → PostgreSQL). En su *Networking*,
   agregá **sólo tu IP** (la de la máquina desde donde restaurás) y anotá su
   *External Database URL*. Todavía **no** le cambies `DATABASE_URL` al servicio: si la app
   arranca contra una base vacía, le crea las tablas y le siembra pasillos de
   ejemplo, y la restauración se va a negar (o hay que usar `--reemplazar`).
2. **Suspendé el servicio** (Settings → *Suspend Web Service*) para que nadie
   escriba en la base vieja si todavía responde a medias.
3. Bajá y descifrá el último respaldo (arriba).
4. Ensayo, sin tocar nada:
   ```bash
   cd backend
   python scripts/restaurar_plataforma.py ../respaldo --destino "$URL_NUEVA" --ensayo
   ```
   Dice qué base va a cuál: la del registro a la base nueva, cada cliente a su
   `recabra_<slug>` en el mismo servidor.
5. De verdad (anotá la hora: es el arranque del RTO):
   ```bash
   python scripts/restaurar_plataforma.py ../respaldo --destino "$URL_NUEVA"
   ```
   Verifica el sha256 de cada `.dump`, crea las bases de los clientes y carga
   cada una en una sola transacción. Al final dice cuánto tardó.
6. En el servicio: **Environment → `DATABASE_URL`** = la *Internal* URL de la base
   nueva (si se creó desde `render.yaml`, re-vinculala). *Resume* el servicio.
7. Esperá a que `https://retail-espacios.onrender.com/api/health/ready` dé 200.
   **Esa hora menos la del paso 5 es el RTO.**
8. Comprobá: entrá como operador a la consola (los clientes están), entrá a un
   supermercado (sus contratos están), abrí un plano 3D con fotos.
9. Si para restaurar abriste la base nueva a tu IP (*Networking*), **sacá esa IP**:
   la base vuelve a quedar cerrada y el respaldo nocturno sigue andando desde
   adentro.

Al arrancar, la app reconoce la base de `DATABASE_URL` como la del cliente de
siempre aunque se llame distinto que la vieja (`registrar_el_de_siempre`), y
`app/migraciones.py` la encuentra ya sellada en su versión de Alembic.

## 4. Restaurar un solo supermercado

Para mirarlo sin tocar el de verdad (lo recomendable primero):

```bash
python scripts/restaurar_plataforma.py ../respaldo --destino "$URL" \
    --solo recabra_olimpica --como recabra_olimpica_revision
```

Y conectate a `recabra_olimpica_revision` con `psql` para ver qué hay. Para
devolverlo a como estaba en el respaldo **pisando lo que tiene hoy** (se pierde lo
escrito después del respaldo):

```bash
python scripts/restaurar_plataforma.py ../respaldo --destino "$URL" \
    --solo recabra_olimpica --reemplazar
```

Con el servicio andando, los pedidos de ese supermercado pueden fallar durante
la carga; avisale a la dueña antes. Después, `DROP DATABASE recabra_olimpica_revision`.

GALERIAS vive en la base del registro: restaurarla suelta es restaurar el
registro entero (todas las cuentas). Para GALERIAS, mejor la copia ZIP de la
dueña (`scripts/restaurar_copia.py`, ver ESTADO *La copia de seguridad*).

## 5. El simulacro (una vez por trimestre, y antes del lanzamiento)

Un respaldo que nunca se restauró no es un respaldo. Lista:

- [ ] Correr *Respaldo nocturno* a mano y confirmar que queda verde.
- [ ] Bajar el artefacto y descifrarlo **con la frase guardada fuera de GitHub**.
- [ ] Crear una base Postgres descartable (otra base gratuita, Neon, o un
      `docker run postgres:16` local) y restaurar ahí con `--destino` (paso 3.5).
- [ ] Levantar la app local contra esa base (`DATABASE_URL=… uvicorn app.main:app`)
      y comprobar: `/api/health/ready` 200, la consola lista los clientes, un
      supermercado muestra sus contratos y una foto.
- [ ] Restaurar un supermercado suelto con `--como` (paso 4).
- [ ] Anotar en `docs/ESTADO.md` (*Operación y despliegue*): fecha, tamaño del
      respaldo, **RPO** (antigüedad del respaldo usado) y **RTO** (de empezar a
      restaurar a `/ready` en 200), y qué falló.
- [ ] Borrar la base descartable.

---

## 6. El mantenimiento

Lo que corre solo: vencer contratos, recordatorios, reintentar correos, purgar
la bitácora y lo demás que tiene plazo (§12), fotos vencidas, cierre del mes, la
escalera de cobranza, el tamaño de la base y el chequeo de códigos `…-PC<n>`.

- **El hilo de la app**: al arrancar y cada 12 h, mientras esté despierta.
- **El cron de GitHub** (`.github/workflows/mantenimiento.yml`): cada 3 horas
  llama a `POST /api/interno/mantenimiento` con la cabecera
  `X-Mantenimiento-Token`, y de paso despierta al servicio.

Los dos pasan por un **candado de líder** (advisory lock en el registro): corre una
vuelta a la vez aunque coincidan, o aunque haya varias instancias. Cada vuelta deja
una línea `Mantenimiento (cron|hilo) terminado en … s: {…}` en el log de Render. La
última vuelta, el tamaño de la base, los clientes degradados y los correos en cola
se ven en `GET /api/plataforma/salud` (operadores).

A mano: Actions → *Mantenimiento programado* → *Run workflow*, o
`curl -X POST -H "X-Mantenimiento-Token: …" https://…/api/interno/mantenimiento`.

## 7. Los correos que no salen

Todo correo de un pedido (contrato nuevo, montaje, edición, guía) queda anotado en
`correos_pendientes`, en la base del supermercado, **antes** de salir. Si el
proveedor falla, una línea WARNING `Correo #N no salió (intento i de 7…)` —con
cuántos destinatarios y sus dominios, nunca las direcciones— y se reintenta: a los
5 min, 30 min, 2 h, 6 h, 12 h y 24 h (cada 5 min mientras la app está despierta, y
en cada vuelta de mantenimiento). Al séptimo intento queda `abandonado`, con su
WARNING. Lo enviado se borra a los 30 días; lo abandonado, a los 90.

Si ves `HTTP 401` en esas líneas: la `EMAIL_API_KEY` se revocó o el remitente dejó
de estar verificado. Se arregla en Render → Environment, y lo pendiente sale solo
en el próximo reintento.

## 8. Cuando algo anda mal

| Síntoma | Dónde mirar |
|---|---|
| `/api/health/ready` da 503 | El registro no contesta: la base de Render (¿venció la gratuita?, ¿llegó al tope?). |
| Un supermercado ve «La base de este supermercado no está disponible…» (503) | Su base no se pudo preparar al arrancar: el log tiene `La base del cliente X no se pudo preparar`. El mantenimiento la reintenta en cada vuelta; `GET /api/plataforma/salud` la lista. |
| `La base ocupa … MB: 7x % de la cuota` | Ver abajo. |
| `El plano de la sede X pesa … KiB` | Ese plano se acerca al tope de 2 MiB del guardado; pasado el tope, guardar da 413. |
| `canceling statement due to statement timeout` | Una consulta pasó de `STATEMENT_TIMEOUT_S`. Si es legítima (una copia ZIP muy grande), subilo en Render. |
| `Cliente X: N mueble(s) … que se lee como participación` | Renombralos con la renumeración del plano (`scripts/buscar_codigos_pc.py` lo explica). |

### La base se llena

Los archivos (fotos de montaje, documentos, planometrías, artes) viven adentro de
la base. Lo que libera lugar es la limpieza de fotos de contratos terminados, que
está **apagada** y sólo ensaya:

1. En el log de Render buscá las líneas `Fotos vencidas, cliente …` de la última
   vuelta: dicen cuántas fotos y cuántos MB borraría en cada supermercado.
2. Si lo que dice está bien (sólo contratos terminados hace más de lo previsto),
   Render → Environment → `LIMPIAR_FOTOS_VENCIDAS=1`.
3. En la vuelta siguiente la línea dice lo que borró. Mirá la próxima medición del
   tamaño (`La base ocupa …`).

Si con eso no alcanza: subir de plan la base (y `CUOTA_BASE_MB`), o mover los
archivos a un almacenamiento de objetos (P2-6 de la auditoría, pendiente).

---

## 9. Migraciones (Alembic, sólo aditivo)

- Un cambio de esquema que `create_all` no hace (una columna o un índice en una
  tabla que ya existe) va en una migración: `cd backend && alembic revision -m "…"`.
- **Sólo agregar**: tablas, columnas que aceptan NULL (o con `server_default`),
  índices. Nada se borra, se renombra ni cambia de tipo:
  `tests/test_migraciones.py` lo rechaza. Una columna se agrega con
  `agregar_columna_si_falta` de `app.migraciones`, y también va en el modelo
  (`test_t22` exige la migración).
- Corre sola al arrancar, en el registro y en cada supermercado, bajo un advisory
  lock. En un plan pago, como paso previo: `preDeployCommand: python -m
  app.migraciones` (comentado en `render.yaml`). A mano: `python -m app.migraciones`.
- Una base nueva nace de `create_all` sellada en la última revisión; una que ya
  existía sin Alembic se sella en `0001_linea_base` y recibe lo que siga.

## 10. Staging

`render.staging.yaml` es un Blueprint aparte, **inactivo** hasta que lo des de
alta (Render → New → Blueprint → este repo → *Blueprint file path*:
`render.staging.yaml`). Servicio y base en plan gratuito, rama `staging`, deploy
cuando el CI pasa. Ojo: Render admite **una** base gratuita por workspace; si
producción ya la usa, la de staging es paga o se reemplaza por otra gratuita
(Neon) en `DATABASE_URL`.

El flujo:

1. `git switch -c staging main && git push -u origin staging` (una vez).
2. Un PR de backend va primero contra `staging`. Mergeado y con el CI verde,
   Render lo despliega en staging.
3. Se prueba allá contra datos **anonimizados**: restaurá un supermercado con
   `--como` en una base aparte, cambiá nombres de proveedores, correos y
   teléfonos (`UPDATE suppliers SET email = NULL, phone = NULL, contact_name = 'Contacto ' || id`),
   y cargalo en staging. Nunca la base de producción tal cual.
4. Un PR `staging → main`, que vuelve a pasar el CI, y a producción.

## 11. Los derechos de una persona (Ley 1581): consultas y supresiones

Una persona —con o sin cuenta: una administradora que se fue, el contacto de una
marca, alguien a quien le llegan los avisos— escribe al canal de atención de la
política (§8.1) pidiendo saber qué datos suyos hay o que se borren. **Los plazos
corren desde el día hábil siguiente a que llega el pedido:**

| Pedido | Plazo | Prórroga (avisando antes del vencimiento, con el motivo) |
|---|---|---|
| **Consulta** (qué datos hay) | **10 días hábiles** (art. 14) | 5 días hábiles más |
| **Reclamo** (corregir, suprimir, revocar) | **15 días hábiles** (art. 15) | 8 días hábiles más |

Si el reclamo llega incompleto, se le pide lo que falta dentro de los 5 días
siguientes; si en 2 meses no contesta, se entiende que desistió. Mientras el
reclamo está en trámite, anotá en la referencia «reclamo en trámite».

### El paso a paso

1. **Anotar el pedido**: fecha de llegada, quién pide, qué pide, el correo con el que
   aparece en RECABRA. Calcular la fecha límite (días hábiles de Colombia).
2. **Verificar que es la persona**: que escribe desde ese correo, o que acredita la
   representación. Si no, pedirlo (el plazo de «incompleto» corre).
3. **¿Quién responde?** Si es una persona con cuenta (dueña, administración,
   mercaderista), responde RECABRA. Si es personal del supermercado o el contacto de
   un proveedor, el responsable es **el supermercado**: avisarle a la persona que se
   le trasladó y escribirle a la dueña; cuando la dueña lo instruya (o lo pida la
   persona y la dueña no conteste en el plazo, ver la política §7.2), se ejecuta acá.
4. **Consulta → exportar.** En la consola, con la sesión de operador:

   ```
   POST /api/plataforma/titulares/exportar
   {"correo": "persona@dominio.co", "referencia": "Radicado 2026-11-03 #4"}
   ```

   o, para el contacto de un proveedor de un supermercado (el número del proveedor lo
   da la dueña):

   ```
   {"cliente": "acme", "proveedor_id": 12, "referencia": "…"}
   ```

   (también se puede buscar por `"telefono"`, y limitar a un supermercado con
   `"cliente"`). Devuelve un JSON con la cuenta, cada lugar donde aparece la persona
   en el registro y en cada supermercado, y `no_revisados` (bases que no se pudieron
   abrir: reintentar). Se le manda a la persona, con la lista de
   `fuera_de_esta_descarga`.
5. **Supresión → anonimizar.** Mismo cuerpo, con la referencia obligatoria:

   ```
   POST /api/plataforma/titulares/suprimir
   {"correo": "persona@dominio.co", "referencia": "Radicado 2026-11-03 #4"}
   ```

   Si la persona es la **única dueña** de un supermercado activo contesta 409
   `unica_duena`: primero que la dueña pase el supermercado a otra persona, o se
   tramita la supresión del supermercado; si igual corresponde, repetir con
   `"aunque_sea_la_unica_duena": true`. Lo que se conserva por ley (contratos,
   bitácora, facturación, constancias de autorización) queda anonimizado, no
   borrado: el detalle está en `backend/app/services/titulares.py` y en la política
   §7.1 e).
6. **Lo que el sistema no alcanza, a mano:**
   - borrar la cuenta en **Firebase** (consola de Firebase → Authentication → Users →
     buscar el correo → *Delete account*);
   - si se restaura un respaldo de antes de la supresión dentro de los 14 días que
     viven, **volver a aplicar** cada supresión atendida después de la fecha del
     respaldo (las constancias están en `GET /api/plataforma/titulares`; el correo
     de cada una, en el canal de atención);
   - los respaldos vencen solos a los 14 días: no hay que tocarlos.
7. **Responder** a la persona dentro del plazo: qué se hizo, el número de constancia,
   lo que quedó por obligación legal y por qué.

Cada paso deja rastro: una **constancia** en `derechos_de_titulares` (con la huella
de la persona, nunca su correo), una línea `titular_export`/`titular_supresion` en la
bitácora de la plataforma por cada supermercado tocado —que ese supermercado ve en su
reporte de transparencia— y una `titular.exportado`/`titular.suprimido` en la
bitácora del supermercado. `GET /api/plataforma/titulares` lista las constancias.

Las personas con cuenta pueden, además, bajar lo suyo solas: menú de la cuenta →
**Descargar mis datos** (`GET /api/auth/mis-datos`, 3 por hora).

## 12. Cuánto se guarda (retención)

El mantenimiento borra solo lo que no es prueba de nada, con plazos que se cambian
por variable en Render (los valores son los propuestos en la política §6; los que
el abogado tiene que confirmar están marcados ahí):

| Variable | Por defecto | Qué |
|---|---|---|
| `RETENCION_BITACORA_DIAS` | 365 | Bitácora de cada supermercado |
| `RETENCION_BITACORA_PLATAFORMA_DIAS` | 760 | Bitácora del operador (25 meses: el reporte de transparencia muestra 24) |
| `RETENCION_INTENTOS_DIAS` | 1 | Intentos fallidos (login, cuenta) y de export; los del alta, 24 h fijas |
| `RETENCION_ALTAS_EN_ESPERA_DIAS` | 90 | Altas que llegaron con el tope del día |
| `RETENCION_CORREOS_ENVIADOS_DIAS` | 30 | Cola de correos: lo enviado |
| `RETENCION_CORREOS_ABANDONADOS_DIAS` | 90 | Cola de correos: lo que no salió |

Las sesiones cerradas y los enlaces cortados se borran al vencer; las fotos de
montaje y planometrías, con `LIMPIAR_FOTOS_VENCIDAS` (§8); los respaldos, a los 30
días (regla del bucket, §2). Un valor menor que 1 o que no es un número se ignora
(con un WARNING) y vale el de por defecto: un «0» no vacía la bitácora.

