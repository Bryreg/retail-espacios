# Auditoría integral (post Fase 6) — Dimensión 6: Compliance y privacidad (Ley 1581)

Agente: auditor de compliance. Territorio: `backend/tests/test_auditoria_compliance.py`
(único archivo tocado). No se arregló código de producción — este agente sólo
demuestra. Verificación: `TMPDIR=/tmp/pt-compliance python -m pytest -q
tests/test_auditoria_compliance.py` → **3/3 verde** (1 xfail-strict, 2 sondas pasan).

## Qué ya estaba cubierto (no se repite)

Antes de escribir un solo test se revisó el estado real, no lo que ESTADO.md
afirma:

- **Copia byte-idéntica y versión** (hipótesis 1): `docs/legal/politica-datos.md`
  y `frontend/src/legal/politica-datos.md` son **idénticas hoy** (`diff` sin
  salida) y el encabezado dice `2026-09-v1`, igual que `VERSION_POLITICA` en
  `models/consentimiento.py`. Ya fijado por `test_asesoria_ataques.py` (función
  de comparación de archivos) y por `test_consentimiento.py`. Fase 6 (§5.3 de
  la política) declaró spread/adopción **sin** subir versión, con una
  justificación explícita en el propio texto (el umbral K=3 ya cubre el nuevo
  campo) — no es un hallazgo, es una decisión documentada a la espera del
  abogado.
- **Export owner-only y frontera de datos** (hipótesis 2): `test_x1*`, `test_x2*`
  y `test_derechos.py` ya prueban exhaustivamente que `GET
  /clientes/mi-export` nunca lleva bitácora, hashes, tablas de intentos ni
  `estados_cliente`, y que no arrastra datos de otro cliente. Sobre si el
  `Supplier.contact_name/phone/email` que SÍ sale en el export es un problema
  de "dato de tercero": **no lo es por diseño ya documentado** —
  `docs/legal/politica-datos.md` §2.3 y §4.2 declaran expresamente que esos
  contactos de proveedor son datos de terceros que **carga el supermercado**,
  que el supermercado es responsable de esa relación, y que el propio owner ya
  tiene acceso diario a esos mismos campos por la API normal de negocio — el
  export no abre una puerta nueva, documenta una que ya existía.
- **Supresión** (hipótesis 3) y **habeas data no se corta por estado de
  cuenta** (hipótesis 4): `test_x9` a `test_x12b` y `test_derechos.py` ya
  prueban "una pendiente por cliente", "nada se borra por ningún camino" y
  `test_x24`/`test_owner_de_cliente_suspendido_puede_exportar_y_pedir_supresion`
  ya prueban que export, solicitar-supresión y aceptar-política funcionan con
  cliente suspendido. El riesgo de habeas data por **ejecución manual** (nadie
  garantiza un plazo) está bien reconocido por la propia política (§7.1: "la
  atiende una persona") — es una decisión de diseño explícita, no un hallazgo
  nuevo con reproducción propia.
- **Retención de `bitacora_plataforma` / `snapshot_metricas` por CRECIMIENTO**
  (hipótesis 6, la mitad del ángulo): **ya está encontrado y reportado por
  otro agente** — `test_auditoria_frontera.py::test_f08_hallazgo_la_bitacora_del_operador_no_se_purga_nunca`
  (xfail strict) siembra una fila de tres años en cada tabla, corre
  `_run_lease_maintenance()` y demuestra que sólo se purga la del cliente
  (`AuditEntry`, 365 días vía `services/bitacora.purgar`); `bitacora_plataforma`
  y `snapshot_metricas` no tienen ningún mecanismo de purga. Confirmado leyendo
  `app/main.py` (`purgar(db)` sólo corre dentro del `for cliente in listar()`,
  nunca contra el registro) — no se repite ese test acá.

## Hallazgos con reproducción (este agente)

### compliance-1 — El saneo de nombre de proveedor es SOLO de lectura: a disco baja el dato de contacto de un tercero, sin sanear y sin plazo

- **Severidad:** alta.
- **Estado:** documentado (no arreglado — fuera del alcance de este agente:
  arreglar tocaría `app/plataforma_metricas.py`/`app/plataforma_tendencia.py`,
  que no le corresponden a este territorio).
- **Repro:** `test_compliance1_snapshot_metricas_no_deberia_guardar_el_contacto_del_proveedor_sin_sanear`
  (`xfail(strict=True)`). Siembra un proveedor con 3 contratos activos (por
  encima de K=3) cuyo `Supplier.name` lleva pegado un correo y un teléfono de
  contacto — exactamente el escenario que la Fase 4 dice que el saneo de
  `_top()` existe para evitar ("para que el campo de texto libre que carga el
  supermercado no filtre un dato de contacto de un tercero", ESTADO.md). Corre
  `calcular(periodo, origen="vista")` (el mismo write-through que dispara
  cualquier vista real del panel) y lee **directo de
  `snapshot_metricas.proveedores_json`** en el registro. El correo y el
  teléfono están ahí, en texto plano.
- **Por qué pasa:** `models/plataforma.py::SnapshotMetricas` lo dice en su
  propio docstring — "Guarda CRUDOS, nunca públicos" y el campo
  `proveedores_json` es literalmente `{nombre_ORIGINAL_del_proveedor: nº de
  contratos}`. El saneo (`_top()`, que enmascara correos/teléfonos) se aplica
  **sólo al leer** la serie pública (`publicas_desde_crudos` en
  `plataforma_metricas.py`, reusada por `publicar_fila` en
  `plataforma_tendencia.py`) — nunca al escribir el snapshot.
- **Por qué importa aunque HOY no salga por ninguna API:** el propio
  `test_t13_ningun_correo_ni_telefono_en_el_json` (`test_tendencia_ataques.py`)
  ya prueba que la respuesta pública de `/tendencia` no lleva `@` ni
  teléfonos — la API está bien. El problema es que la garantía vive en **un
  solo punto de lectura**, no en el dato en reposo: cualquier camino nuevo que
  lea `snapshot_metricas` directo (un endpoint de diagnóstico futuro, un
  script de soporte, un dump para depuración, un backup de la base del
  registro) expone el contacto crudo. Y como `test_f08` (otro agente) ya
  demostró que esa tabla **nunca se purga**, el dato de contacto de un tercero
  que nunca dio consentimiento a RECABRA queda ahí para siempre.
- **No declarado:** `docs/legal/politica-datos.md` §6 ("Cuánto tiempo
  conservamos los datos") no menciona `snapshot_metricas` en absoluto —
  habla de datos de negocio, fotos, bitácora, frenos y cuentas, pero nada
  sobre el histórico de métricas del operador ni sobre que ahí vive una copia
  sin sanear del nombre de proveedor. §2.3 ("Contactos de proveedores")
  tampoco menciona esta segunda copia.
- **Arreglo propuesto (no aplicado):** sanear con `_top`/la función de saneo
  de nombre **antes** de serializar `proveedores_json` en el write-through
  (`calcular()` y `cerrar_mes_anterior()`), guardando el nombre YA saneado a
  disco en vez de re-sanear al leer. Riesgo a manejar: el saneo de hoy
  requiere el conteo agrupado por nombre ORIGINAL para poder desempatar y
  agrupar variantes de escritura — sanear antes de agrupar podría fusionar
  proveedores distintos con el mismo nombre saneado. Alternativa más simple y
  más segura: aplicar el saneo de correo/teléfono (no el recorte de largo, que
  sí puede ir después) en el momento de construir `conteo_proveedores`, antes
  de que ese diccionario se convierta en `crudos["proveedores"]` — un solo
  punto de entrada al registro, en vez de dos (metricas y tendencia). Sumar a
  la Fase siguiente: declarar `snapshot_metricas` en §6 de la política con su
  propio plazo, y darle purga simétrica a `bitacora_plataforma` (ver
  `test_f08`).

### compliance-2 — Sonda de diseño: nada en el esquema impide escribir un correo de tercero en `snapshot_metricas`

- **Severidad:** media (es la causa estructural detrás de compliance-1, no un
  hallazgo de fuga independiente).
- **Estado:** documentado.
- **Repro:** `test_compliance2_sonda_nada_impide_escribir_un_nombre_de_proveedor_con_arroba_en_el_registro`
  (sonda, pasa en verde con salida literal). Inserta directo, vía el ORM, un
  `SnapshotMetricas` con `proveedores_json` conteniendo un correo, sin pasar
  por ningún router ni por `_top()`. El `commit()` no lanza — ni constraint,
  ni trigger, ni validación a nivel de modelo lo frena. Salida literal
  capturada: `snapshot_metricas.proveedores_json` releído contiene
  `"carlos.perez@alpina-ejemplo.example"` tal cual se escribió.
- **Lectura:** confirma que la invariante de privacidad de esta tabla depende
  **enteramente** de que todo código futuro que la escriba recuerde llamar al
  saneo — no hay una segunda barrera (a nivel de esquema o de modelo) que
  proteja el dato en reposo si alguien olvida ese paso.
- **Arreglo propuesto:** el mismo de compliance-1 (sanear antes de escribir),
  más — opcional, defensa en profundidad — una validación en el
  `__init__`/setter de `SnapshotMetricas.proveedores_json` (o un test de
  esquema, estilo `test_x*`) que falle si algún nombre en el JSON contiene
  `@` o una secuencia de 7+ dígitos, para que un futuro cambio en
  `calcular()` no pueda reintroducir el problema en silencio.

### compliance-3 — El correo saliente a Brevo/SendGrid lleva el token de invitación en claro; la política todavía no nombra al proveedor ni ese dato

- **Severidad:** media (brecha de **transparencia** documentada con
  reproducción — no una fuga de seguridad: el token es de un solo uso,
  expira, y no deriva de `JWT_SECRET`, según el propio docstring de
  `routers/usuarios.py`).
- **Estado:** documentado.
- **Repro:** `test_compliance3_sonda_el_cuerpo_del_correo_de_invitacion_lleva_el_token_en_claro`
  (sonda, pasa en verde). Intercepta `send_mail_to_bg` en el flujo real de
  `POST /api/usuarios/invitar` y captura el HTML que viajaría al proveedor de
  correo. Salida literal:
  ```
  compliance-3 -- enlace con token que viaja al proveedor de correo:
  https://retail-espacios.onrender.com/login?invitacion=WgZwtKKTb_8UoLPO2x4goQe9zCc8DSqOHhY4Mqy-sJw
  ```
  Ese mismo cuerpo, cuando `EMAIL_PROVIDER=brevo` o `sendgrid`
  (`services/mailer.py::_enviar_por_api`), viaja por HTTPS al proveedor
  externo como `htmlContent`/`content` del payload — el token completo pasa
  por su infraestructura.
- **Qué dice hoy la política:** `docs/legal/politica-datos.md` §9.1 (tabla de
  suboperadores) tiene el renglón del proveedor de correo saliente **sin
  completar**: `[COMPLETAR: proveedor de correo saliente]`, y la columna "Qué
  datos ve" dice genéricamente "Correos de destinatarios y contenido del
  aviso" — no menciona que ese contenido incluye, en el caso de invitaciones,
  un enlace con una credencial de un solo uso. `docs/ESTADO.md` (líneas
  ~1785-1807), en cambio, sí nombra a Brevo y SendGrid con detalle de
  ingeniería — la brecha es entre lo que el equipo sabe y lo que la política
  (que sigue marcada BORRADOR) todavía dice.
- **Arreglo propuesto:** al completar la política (ya marcada
  `[VALIDAR CON ABOGADO]`/`[COMPLETAR]`, no es un fix de código): nombrar
  Brevo/SendGrid explícitamente en §9.1 y agregar una línea aclarando que el
  contenido de los correos de invitación y de "montar espacio" incluye un
  enlace con un token de acceso de un solo uso y vida corta, para que quede
  claro que el proveedor de correo ve, momentáneamente, una credencial y no
  sólo una dirección.

## Sospechas sin confirmar

- **Logging de destinatarios**: `mailer.py` hace
  `logger.info("Correo enviado (%s) a %s", subject, ", ".join(recipients))` —
  los correos de destinatarios (que pueden ser personal del supermercado o el
  contacto de un proveedor) quedan en los logs de aplicación (Render). No se
  escribió reproducción porque no está claro qué retención tienen los logs de
  Render en el plan actual ni si eso cuenta como un "encargado" adicional bajo
  la Ley 1581 — necesitaría una decisión de producto, no sólo de código.
- **§6 de la política sigue con `[COMPLETAR]` el plazo de la bitácora**,
  aunque el código YA tiene un plazo concreto (`DIAS_QUE_SE_GUARDA = 365`
  en `services/bitacora.py`). No es una contradicción — es un placeholder
  legal pendiente de que el abogado lo redacte — pero vale la pena que quien
  complete la política simplemente copie ese número en vez de inventar uno
  nuevo.
- **Transmisión internacional (§9.2)**: la política ya reconoce, con
  `[VALIDAR CON ABOGADO]`, que falta confirmar si EE.UU. tiene nivel adecuado
  de protección según la SIC. No se investigó porque es una pregunta legal,
  no técnica, y la propia política ya la señala como pendiente.

## Veredicto de esta dimensión

La superficie de derechos del titular (export, supresión, consentimiento,
frontera owner-only, exención del 402) está **sólidamente probada** por el
trabajo previo (`test_compliance_ataques.py`, `test_consentimiento.py`,
`test_derechos.py`) y la política, aunque BORRADOR, es honesta sobre sus
propios huecos (`[COMPLETAR]`/`[VALIDAR CON ABOGADO]` en los puntos que de
verdad dependen de un abogado). El punto débil real y nuevo que este agente
encontró está un nivel más abajo de la API: el **dato en reposo** del
histórico de métricas del operador (`snapshot_metricas`) guarda el nombre de
proveedor **sin sanear**, con el mismo tipo de contacto de tercero que la
Fase 4 dice proteger, y sin ningún plazo de conservación declarado — una
promesa de privacidad que hoy sólo la sostiene el punto de lectura, no el
dato. Complementa (no repite) el hallazgo de **crecimiento** que ya reportó
el agente de la dimensión 2 sobre las mismas tablas.
