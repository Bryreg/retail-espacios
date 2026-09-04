# Fase 3 Compliance — Agente Legal (política Ley 1581 + guía RNBD)

**Repo:** `/tmp/retail-espacios-test` · rama `claude/fase-3-compliance` · sin commit ni push
**Fecha:** 2026-09-04 · **Archivos de código tocados: NINGUNO**

---

## 1. Entregables

| Archivo | Qué es | Líneas |
|---|---|---|
| `docs/legal/politica-datos.md` | Política de Tratamiento de Datos Personales (Ley 1581/2012 + Decreto 1377/2013) | 545 |
| `frontend/src/legal/politica-datos.md` | **Copia byte a byte** del anterior, para la página pública `/politica-datos` (import `?raw`) | 545 |
| `docs/legal/guia-rnbd.md` | Guía operativa RNBD para el dueño del negocio | 314 |

Los tres arrancan con la misma primera línea visible:

```
> **BORRADOR PARA REVISIÓN DE ABOGADO** — este documento no constituye asesoría legal.
```

La política declara en su encabezado `**Versión: 2026-09-v1 · Vigencia: septiembre 2026**`,
que coincide exactamente con `VERSION_POLITICA = "2026-09-v1"`
(`backend/app/models/consentimiento.py:26`). No la cambié.

---

## 2. Inventario de datos personales detectado

Salió de leer `backend/app/models/{models.py,identidad.py,plataforma.py}`,
`app/services/contacts.py`, `app/routers/mounts.py` y `app/auth.py`, cruzado con las
secciones de Identidad (Fase 1) y Clientes (Fase 2) de `docs/ESTADO.md`.

### 2.1 Base del registro (base por defecto, `sesion_registro()`)

| Dato | Dónde vive | Titular | Finalidad |
|---|---|---|---|
| `firebase_uid` | `usuarios.firebase_uid` | Usuario de la plataforma | Identificar la cuenta sin depender del correo |
| Correo | `usuarios.email` | Usuario de la plataforma | Identificación, avisos, vinculación de invitaciones |
| Nombre | `usuarios.nombre` | Usuario de la plataforma | Mostrar quién es en la interfaz y en la bitácora |
| Alta y último ingreso | `usuarios.creado_en`, `ultimo_login` | Usuario de la plataforma | Soporte, detección de cuentas inactivas |
| Rol y pertenencia | `membresias.{cliente_slug,rol,activo}` | Usuario de la plataforma | Control de acceso por cliente y por rol |
| Correo del invitado, rol reservado, quién invitó | `invitaciones.{email,rol,invitado_por}` | Invitado y quien invita | Sumar gente a un cliente |
| Token de invitación, caducidad | `invitaciones.{token,expira_en,usada_en}` | Invitado | Que el enlace caduque y no se reuse |
| IP + hora de intentos fallidos de `/oauth` | `oauth_attempts.{ip,at}` | Cualquiera que intente entrar | Freno de fuerza bruta |
| IP + hora de intentos fallidos de alta | `alta_attempts.{ip,at}` | Cualquiera que intente fundar | Freno de fuerza bruta |
| Quién fundó qué cliente | `fundaciones.{usuario_id,cliente_slug}` | Usuario de la plataforma | Tope de 2 fundaciones por usuario |
| Motivo del estado de cuenta (texto libre) | `estados_cliente.motivo` | Puede nombrar personas | Gestión de cobranza; **solo lo ve el owner en `suspendido`** |
| Correo del operador que movió el estado | `estados_cliente.cambiado_por` | Operador de plataforma | Trazabilidad del cambio |
| Versión aceptada, fecha, **IP**, origen | `consentimientos` (Fase 3) | Usuario de la plataforma | Prueba de la autorización (art. 7 Dto. 1377) |
| Quién pidió supresión, correo, motivo | `solicitudes_supresion` (Fase 3) | Owner del cliente | Trámite del derecho de supresión |

### 2.2 Base de negocio (una por cliente)

| Dato | Dónde vive | Titular | Finalidad |
|---|---|---|---|
| Empresa, persona de contacto, teléfono, correo, notas | `suppliers.{name,contact_name,phone,email,notes}` | Contacto del proveedor | Administrar el contrato y avisarle |
| Valor, marca, fechas, notas del contrato | `space_leases.*` | Proveedor (personal si es persona natural) | Gestión comercial |
| Correos de administrador de sede, gerente y mercaderista | `app_config["notify_contacts"]` | Personal del supermercado | Avisos de contratación, vencimiento y montaje |
| Nombre escrito por quien reporta, rol, motivo, nota | `mount_confirmations.{reportado_por,rol,motivo,nota}` | Personal del supermercado | Prueba de quién montó qué y cuándo |
| Hora del montaje puesta por el servidor | `mount_confirmations.confirmado_en` | Personal del supermercado | Que la prueba no dependa del EXIF del celular |
| **Fotos de montaje** (pueden captar personas incidentalmente) | `space_files` con prefijo `montaje--` | Terceros captados en sala de ventas | Prueba de armado de la exhibición |
| Contratos escaneados (nombres, firmas, cédulas) | `space_files` (PDF/Excel/imagen) | Firmantes | Prueba documental |
| Planometrías del proveedor | `lease_files` | Proveedor | Cómo debe quedar armada la exhibición |
| Artes de producto | `supplier_assets` | Proveedor | Previsualización comercial en el 3D |
| Fecha, rol, **IP**, acción, y **correo del actor dentro de `detalle`** | `audit_log` | Usuario que actúa | Auditoría e investigación de incidentes |
| IP + hora de intentos fallidos del login legado | `login_attempts.{ip,at}` | Cualquiera que intente entrar | Freno de fuerza bruta |
| Hash Argon2id de las claves compartidas por rol | `app_config["admin_password_hash"]`, `"worker_password_hash"` | No es dato personal (clave de rol) | Autenticación legada |

### 2.3 Lo que NO es dato personal (y por eso no entró a la política)

Geometría del plano y `layout_snapshots`, códigos de espacio, tarifas de referencia,
temporadas, `clientes.{slug,nombre,db_name}`, `notification_logs`, `archived_spaces`.

### 2.4 Tres hallazgos del inventario que vale la pena que alguien mire

Ninguno es de mi territorio (no toqué código), pero salieron leyendo los modelos:

1. **El correo del actor viaja concatenado en `audit_log.detalle`**, no en una columna
   propia (ya está documentado como pendiente en `docs/ESTADO.md`). Para efectos de esta
   política es un dato personal dentro de un campo de texto libre: una supresión
   selectiva de ese correo hoy exige parsear texto. Lo declaré en el inventario del RNBD
   como parte de la bitácora.
2. **`estados_cliente.motivo` es texto libre escrito por el operador y en `gracia` /
   `solo_lectura` le llega a cualquier rol** (pendiente R conocido de Fase 2). Si el
   operador escribe ahí el nombre de una persona o una gestión de cobro, eso es un dato
   personal que ve un mercaderista. La política lo describe honestamente en 2.5, pero el
   arreglo es de producto, no de redacción.
3. **`mount_confirmations.reportado_por` lo escribe la propia persona a mano** y no está
   ligado a `usuarios`. Es dato personal declarado por el titular, lo cual es cómodo para
   la autorización pero lo hace imposible de correlacionar para atender un derecho de
   supresión de esa persona.

---

## 3. Decisiones de redacción que tomé

1. **Política orientada al lector, no al inspector.** Español corriente, tablas en vez de
   párrafos, y las fórmulas legales solo donde la ley exige precisión (plazos, derechos,
   artículos citados). La leen comerciantes.

2. **Sección propia y central para el rol dual** (sección 5 de la política), con tabla de
   quién hace qué. Es la parte que se malinterpreta y la que un supermercado con área
   jurídica va a leer primero. La conclusión operativa está escrita explícita: un proveedor
   que quiere que le borren sus datos **habla con el supermercado**, no con RECABRA, y si
   escribe a RECABRA se traslada y se le avisa a quién (art. 18 lit. e).

3. **Dije que las contraseñas de las cuentas individuales NO están en RECABRA.** Es cierto
   (las custodia Firebase) y es exactamente el tipo de afirmación que baja la temperatura
   de una revisión jurídica. Aclaré aparte que las claves compartidas del legado sí viven
   en el sistema, pero con hash Argon2id.

4. **Las fotos de montaje se declaran como riesgo de captación incidental de personas**, y
   se dice que no se les aplica reconocimiento facial ni biometría. Esconderlo era la
   opción fácil y la que revienta en una auditoría: la foto se toma en sala de ventas en
   horario de operación.

5. **Escribí "deber de seguridad del art. 17" y no "interés legítimo".** La Ley 1581 no
   tiene la figura del interés legítimo del RGPD europeo. La misión la nombraba, así que
   dejé el concepto pero anclado en el fundamento colombiano correcto y con un
   `[VALIDAR CON ABOGADO]` que explica por qué se cambió el nombre. **No re-litigo la
   spec**: la base sigue siendo la misma (seguridad), cambia el nombre jurídico.

6. **Transmisión ≠ transferencia.** Google/Firebase y Render se nombran como **encargados**
   y el envío como **transmisión** (art. 25 Dto. 1377), no como transferencia. La diferencia
   decide si hace falta autorización adicional del titular o basta un contrato.

7. **La conservación por estado de cuenta está escrita como regla, no como nota al pie**
   (sección 6): *"Los datos de negocio NO se borran por el estado de cuenta del
   supermercado"*. Viene de Fase 2 y es una promesa comercial además de legal.

8. **El export y la solicitud de supresión están descritos con sus límites, no como
   virtudes**: el export excluye bitácora, hashes, intentos y estado de cuenta, y tiene
   límite por hora; la supresión la ejecuta una persona. Escribir por qué (los datos de
   terceros, la irreversibilidad) es lo que hace defendible la restricción.

9. **En la guía RNBD corregí la cifra que traía la misión** (ver sección 5) y separé
   "quién está obligado" de "cuándo vencía el plazo", que es de donde nace la confusión.

10. **La guía RNBD termina en tabla de decisión y en lista de deberes irreducibles.** El
    mensaje central: no registrar no exime de casi nada. La brecha más concreta que dejo
    señalada es que **no existe contrato de transmisión con los clientes ni con los
    proveedores de infraestructura**.

11. **La guía RNBD no lleva `Versión: 2026-09-v1`** en el encabezado a propósito: ese
    string es el identificador de la política y lo referencia una constante del backend.
    La guía dice "Redactada en septiembre de 2026" y remite a la política por su versión.

12. **No inventé ni un dato de empresa.** Ni razón social, ni NIT, ni dirección, ni correo,
    ni nombre de representante legal, ni URL de la SIC.

---

## 4. Campos `[COMPLETAR]` que el humano debe resolver

### En `docs/legal/politica-datos.md` (y por lo tanto en la copia del frontend)

| # | Dónde | Qué falta |
|---|---|---|
| 1 | §1 Responsable | Razón social exacta |
| 2 | §1 Responsable | NIT con dígito de verificación |
| 3 | §1 Responsable | Domicilio (dirección, ciudad, país) |
| 4 | §1 Responsable | Correo de contacto para protección de datos |
| 5 | §1 Responsable | Teléfono |
| 6 | §1 Responsable | Nombre del área o persona designada para protección de datos |
| 7 | §5.2 Rol dual | Contrato de transmisión con cada supermercado cliente (**hoy no existe**) |
| 8 | §6 Conservación | Plazo concreto de retención de la bitácora |
| 9 | §6 Conservación | Plazos de conservación por categoría, con su sustento legal |
| 10 | §8.1 Canal | Correo, dirección física, teléfono y horario de atención al titular |
| 11 | §8.4 SIC | Canal y sitio de radicación vigentes de la SIC |
| 12 | §9.1 Suboperadores | Proveedor de correo saliente y dónde procesa |
| 13 | §10 Seguridad | Plazo interno de reporte de incidentes y quién lo hace |

### En `docs/legal/guia-rnbd.md`

| # | Dónde | Qué falta |
|---|---|---|
| 14 | §2.2 | Valor de la UVT del año en curso (resolución DIAN) |
| 15 | §2.2 | Activos totales de la empresa (estado de situación financiera) |
| 16 | §2.2 | Tamaño de empresa y naturaleza jurídica |
| 17 | §3.1 | Razón social, NIT y canal de atención para el formulario del RNBD |
| 18 | §3.1 | URL pública de la política |
| 19 | §3.2 | Razón social y NIT de cada supermercado cliente |
| 20 | §3.4 | Proveedor de correo saliente |
| 21 | §6 | Las cinco filas de la tabla de decisión |

---

## 5. Puntos `[VALIDAR CON ABOGADO]`

| # | Dónde | Qué hay que validar | Por qué lo marqué |
|---|---|---|---|
| V1 | Guía §2.1 | **El umbral del RNBD es 100.000 UVT de activos totales, no 610.000.** | **La misión traía 610.000 UVT como umbral de la obligación. Es un dato equivocado.** El Decreto 090 de 2018 obliga a sociedades y ESAL con **activos totales > 100.000 UVT** y a personas jurídicas de naturaleza pública. Los 610.000 UVT fueron el corte que **escalonó los plazos de la primera inscripción** (>610.000 UVT hasta el 30-sep-2018; entre 100.000 y 610.000 hasta el 30-nov-2018). Confundirlas lleva a concluir "no estamos obligados" cuando sí se está. Verificado contra el comunicado de la SIC y la nota de Holland & Knight sobre el decreto. **Lo escribí corregido y con la explicación de la confusión adentro del documento**, no en silencio |
| V2 | Política §2.5, Guía §3.2 | Si la SIC exige declarar la **imagen** como dato sensible cuando puede captarse incidentalmente | La imagen puede ser sensible según el uso; acá no se usa para identificar |
| V3 | Política §2.5 (menores) | Si la captación incidental de menores en sala de ventas exige tratamiento específico (art. 7 Ley 1581, art. 12 Dto. 1377) | No se recolectan a sabiendas, pero una foto de pasillo puede tenerlos |
| V4 | Política §4.3 | Redacción del fundamento para tratar IPs de seguridad | En Colombia no hay "interés legítimo" como en el RGPD; el ancla es el art. 17 lit. d |
| V5 | Política §9.2 | Si **Estados Unidos** figura hoy en el listado de países con nivel adecuado que mantiene la SIC | Ese listado ha cambiado; no debe darse por sabido |
| V6 | Política §9.2 | Si los términos estándar de **Google Cloud/Firebase** y de **Render** satisfacen el "contrato de transmisión" del art. 25 Dto. 1377, o si hay que firmar anexo | Decide si hace falta autorización expresa del titular para la transmisión internacional |
| V7 | Política §9.1 | Región concreta donde el proyecto de Firebase procesa los datos | Depende de la configuración real del proyecto `recabra` |
| V8 | Política §8.4 | Dirección y procedimiento vigentes de radicación ante la SIC | No inventé URL |
| V9 | Guía §3.2 | **Quién registra la base de negocio de un cliente**: el supermercado (responsable) o RECABRA (encargado) | Es la duda más frecuente del RNBD; conviene resolverla por escrito |
| V10 | Guía §4.2 | Nombres de menús y ruta exacta del portal de la SIC | Cambian con las actualizaciones de la plataforma |
| V11 | Guía §4.3 | Fechas límite exactas del **reporte semestral de reclamos** del año en curso | Confirmé que es semestral y que se reporta aunque no haya reclamos; las fechas puntuales varían |
| V12 | Guía §4.4 | Rangos y criterios de graduación de las sanciones del art. 23 Ley 1581 | El tope de 2.000 SMMLV es sólido; la graduación no |
| V13 | Guía §5 punto 7 | Canal y formato para reportar un incidente a la SIC **cuando no se está inscrito en el RNBD** | El deber del art. 17 lit. n existe igual; el canal es lo que no está claro |

---

## 6. Supuestos asumidos

1. **Jurisdicción: Colombia.** Ley 1581/2012 + Decreto 1377/2013 (compilado en el DUR
   1074/2015). Viene de la spec. No se contempla RGPD ni otra jurisdicción; si RECABRA
   vende fuera de Colombia hay que revisar.
2. **La empresa que opera RECABRA es una sociedad privada pequeña**, no una entidad
   pública. Todo el punto 2 de la guía se cae si no lo es, y por eso la tabla de decisión
   arranca preguntándolo.
3. **RECABRA es responsable de los datos de sus usuarios y encargado de los datos de
   negocio de cada cliente.** Es la lectura natural del modelo (base separada por cliente,
   ser operador no abre la base de negocio de nadie), y es la que sostiene toda la
   sección 5 de la política. Si el abogado la revierte, cambia el documento entero.
4. **La página pública `/politica-datos` se sirve sin login**, como fija el plan del
   Maestro. La política lo asume al remitir a ella.
5. **Los tres mecanismos de consentimiento (alta, invitación, login) quedan como los
   describe la spec**, y el sistema guarda versión, fecha, IP y origen. La política lo
   afirma; si el builder de consentimiento cambia el alcance, esta afirmación queda
   desalineada. Verifiqué que `VERSION_POLITICA = "2026-09-v1"` ya está en
   `backend/app/models/consentimiento.py:26`.
6. **`GET /api/clientes/mi-export` y `POST /api/clientes/solicitar-supresion` son
   owner-only y la supresión la atiende una persona.** La política describe además que el
   export excluye bitácora, hashes, tablas de intentos y estado de cuenta, y que tiene
   límite por hora. Salen del contrato §3.4 del plan del Maestro. **Si el builder de
   derechos cambia el nombre de un endpoint o el alcance del export, hay que actualizar
   la sección 7.1 de la política y volver a copiar el archivo al frontend.**
7. **No hay proveedor de correo saliente nombrado.** Vi `app/services/mailer.py` pero no
   asumí cuál es el SMTP real en producción: quedó como `[COMPLETAR]`.
8. **Los reportes de montaje no están ligados a `usuarios`**: el nombre lo escribe la
   persona. La política lo describe tal cual, sin prometer que se pueda correlacionar.

---

## 7. Cómo verifiqué

```
$ head -1 docs/legal/politica-datos.md
$ head -1 frontend/src/legal/politica-datos.md
$ head -1 docs/legal/guia-rnbd.md
> **BORRADOR PARA REVISIÓN DE ABOGADO** — este documento no constituye asesoría legal.   (×3)

$ cmp docs/legal/politica-datos.md frontend/src/legal/politica-datos.md
IDENTICOS OK            (md5 8ddbe7b97671c8a7bc8dae8de6dbf695 en los dos)

$ grep -n VERSION_POLITICA backend/app/models/consentimiento.py
26:VERSION_POLITICA = "2026-09-v1"        → coincide con el encabezado de la política

$ cd backend && python -c "import app.main"
OK

$ cd frontend && npx tsc --noEmit
EXIT=0
```

**Sobre `pytest`:** no lo corrí. Toqué **cero archivos de código** (`git status` confirma
que lo único mío son `docs/legal/`, `frontend/src/legal/` y este archivo), y los builders
de `consentimiento` y `derechos` están editando `routers/auth.py`, `routers/alta.py` y sus
tests **en paralelo en este mismo checkout**: una corrida ahora mediría su trabajo a medias,
no el mío, y además dejaría `backend/retail_espacios.db` y `backend/recabra_*.db` escritos,
que es exactamente el gotcha R-0 que hace fallar la segunda corrida de la suite. La
verificación de suite completa la hace el red-team al final, después del conciliador.

Recordatorio para quien la corra: `rm -f backend/retail_espacios.db backend/recabra_*.db`
antes.

---

## 8. Riesgo residual que dejo declarado

1. **La política afirma cosas sobre endpoints que otro builder está escribiendo ahora
   mismo.** Sección 7.1 nombra `GET /api/clientes/mi-export` y
   `POST /api/clientes/solicitar-supresion` y describe qué excluye el export. Si el
   conciliador detecta divergencia, la fuente de verdad del **contenido** es
   `docs/legal/politica-datos.md` y hay que re-copiarlo al frontend con `cp`; la fuente de
   verdad del **comportamiento** es el código de `derechos`.
2. **Los dos archivos de política tienen que moverse juntos, siempre.** Son copias, no un
   symlink. Cualquier edición futura de uno sin el otro deja la página pública mintiendo.
   Un chequeo de una línea en CI (`cmp` de los dos) lo cerraría; no lo agregué porque el
   workflow de CI es territorio del builder de hardening.
3. **La cifra del umbral del RNBD la corregí contra la que traía la misión.** Está marcada
   como V1 y explicada dentro del propio documento. Si el abogado confirma otra cosa, el
   texto ya tiene el lugar donde cambiarla.
4. **Ningún documento está listo para publicar.** Trece `[COMPLETAR]` en la política, ocho
   en la guía, trece `[VALIDAR CON ABOGADO]` entre las dos. Publicar la política con
   corchetes sin llenar sería peor que no tenerla: el art. 13 del Decreto 1377 exige
   identificar al responsable y su canal de atención.

---

## Fuentes consultadas para las cifras del RNBD

- [Gobierno Nacional reduce universo de obligados a cumplir el registro de bases de datos ante la SIC](https://www.sic.gov.co/gobierno-nacional-reduce-universo-de-obligados-a-cumplir-el-registro-de-bases-de-datos-ante-superintendencia-de-industria-y-comercio) — Superintendencia de Industria y Comercio
- [Nuevos Requisitos para el Registro Nacional de Bases de Datos en Colombia](https://www.hklaw.com/en/insights/publications/2018/08/nuevos-requisitos-para-el-registro-nacional-de-bas) — Holland & Knight
- [Preguntas frecuentes RNBD](https://sic.gov.co/preguntas-frecuentes-rnbd) — SIC
- [Registro Nacional de Bases de Datos](https://www.sic.gov.co/registro-nacional-de-bases-de-datos) — SIC
