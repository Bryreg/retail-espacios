# Segunda tanda de pantallas de la versión final (se ejecuta al final de final.py, con sus nombres).
# Cubre las secciones del inventario que faltaban, con los mismos datos de la base.
import unicodedata, re as _re
def slug(t):
    t = unicodedata.normalize("NFKD", t.lower()).encode("ascii", "ignore").decode()
    return _re.sub(r"[^a-z0-9]+", "-", t).strip("-")
li = lambda xs: "".join(f'<div class="dato"><b>{x}</b></div>' for x in xs)
def tarjeta_sec(titulo, cuerpo, sec=None, extra=""):
    return f'<section class="tarjeta" data-sec="{sec or slug(titulo)}" {extra}><header><h2>{titulo}</h2></header>{cuerpo}</section>'
def telefono(cuerpo):
    return f'<div class="telefono"><div class="tel-barra"><b>RECABRA · Montaje</b><span class="sub">sin montos</span></div>{cuerpo}</div>'
hoy_iso = HOY.isoformat()

# ── Entrada y cliente nuevo (pantalla pública: sin la barra) ───────────────────
def publica(nombre, titulo, cuerpo):
    html = (f'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>RECABRA · {titulo}</title>'
            f'<link rel="stylesheet" href="recabra.css"><link rel="stylesheet" href="final.css"></head><body class="publica"><main class="contenido">{cuerpo}</main></body></html>')
    open(f"{OUT}/{nombre}.html", "w").write(html); PAGINAS.append(nombre)
publica("entrada", "Entrar", f'''<div class="cab"><div class="tit"><h1>RECABRA</h1><p>Gestión de espacios comerciales en supermercados.</p></div></div>
<div class="rejilla-caras">
{tarjeta_sec("Crear cuenta e ingresar", li(['<span class="btn pri">Crear mi cuenta</span> <span class="btn">Ya tengo cuenta</span>', "Ingresar con Google, o con correo y contraseña", "Crear cuenta con correo y verificarlo · Reenviar el correo de verificación", '<a href="#">Olvidé mi contraseña</a>', "Elegir supermercado si estás en más de uno", '<a href="#">Política de Tratamiento de Datos</a> · la acepto']))}
{tarjeta_sec("Registrar un supermercado", li(["Nombre del supermercado · acepto la política → <span class='btn pri'>Crear y entrar</span>", "Topes: 2 supermercados por persona y freno por IP (POST /api/alta)"]))}
{tarjeta_sec("Aceptar una invitación", li(["Se entra desde el enlace del correo y se canjea con el mismo correo invitado", '<span class="btn">Continuar sin la invitación</span> <span class="btn">Ingresar con otra cuenta</span>', "Aviso si la invitación venció (dura 7 días)"]))}
</div><p class="sub"><a href="configuracion-inicial.html">Después de entrar: configuración inicial →</a> · <a href="inicio.html">Inicio</a></p>''')

n_mueb = len(M["muebles"]); n_esp = len(M["unidades"])
pasos_ci = [("Crear las sedes", "Hecho", f'CENTRO · plano guardado ({M["impacto"]["spaces"]} espacios en la base)', "plano2d.html"),
            ("Dibujar el plano de cada sede", "Hecho", f"CENTRO: {n_mueb} muebles, {n_esp} espacios contratables", "plano2d.html"),
            ("Definir las tarifas", "Hecho", f'{len(M["tarifas"]["default"])} tipos de mueble con tarifa', "tarifas.html"),
            ("Definir responsables por sede", "Falta", "Sin responsables: no salen los avisos de montaje ni de vencimiento a nadie más que al gerente", "ajustes.html#avisos"),
            ("Invitar al equipo", "Falta", f'{len(M["equipo"]["miembros"])} miembros · {len(M["equipo"]["invitaciones"])} invitaciones', "ajustes.html#equipo"),
            ("Registrar el primer contrato o cargar los existentes", "Hecho", f'{len(M["contratos"])} contratos vivos', "contratos-tabla.html")]
hechos = sum(p[1] == "Hecho" for p in pasos_ci)
ci = (cab("Configuración inicial", f"{hechos} de 6 · el siguiente paso está marcado.", '<a class="btn" href="ajustes.html">Ocultar y volver desde Ajustes</a>')
      + f'<div class="avance"><i style="width:{hechos / 6 * 100:.0f}%"></i></div>'
      + tarjeta_sec("Configuración inicial", "".join(f'<div class="dato"><small>Paso {i + 1} · {t}</small><b>{pil("ok" if e == "Hecho" else "warn", e)} {escape(d)} <a class="btn {"pri" if e != "Hecho" and all(x[1] == "Hecho" for x in pasos_ci[:i]) else "suave"}" href="{h}">{"Ir" if e == "Hecho" else "Hacerlo ahora"}</a></b></div>' for i, (t, e, d, h) in enumerate(pasos_ci))))
P("configuracion-inicial", "Ajustes", "Configuración inicial", f'<div class="contenido">{ci}</div>', sec="configuracion-inicial")

# ── Indicadores: todas las sedes y detalle del tablero ────────────────────────
sin_renovar_90 = [c for c in M["contratos"] if c["activo"] and c["vence_en"] <= 90]
sedes = (cab("Todas las sedes", "Una tarjeta para el total y una por sede. Hoy hay una sola sede con plano: CENTRO.", "") + '<div class="rejilla-caras llenar">'
         + "".join(tarjeta_sec(t, f'<div class="dato"><small>Canon del mes</small><b>{V("kpi.canon_mes")}</b></div><div class="dato"><small>Ocupación · Canon ÷ tarifa</small><b>{V("kpi.ocupacion")} · {V("kpi.canon_tarifa")}</b></div>'
                                  f'<div class="dato"><small>Sin renovar a 90 días</small><b>{len(sin_renovar_90)} contratos</b></div><p class="sub">Pide atención por: {len(sin_renovar_90)} contratos vencen en 90 días y {D["kpi.montajes"]["texto"]} montajes por resolver.</p><a class="btn" href="indicadores.html">Abrir</a>', "todas-las-sedes") for t in ("Total", "CENTRO"))
         + "</div>")
P("sedes", "Indicadores", "Todas las sedes", f'<div class="contenido">{pest}{sedes}</div>', sec="todas-las-sedes")

potencial = sum(u["tarifa"] for u in M["unidades"])
no_fact = [c for c in M["contratos"] if c["ventas"]]
semanas = []
for i in range(8):
    a = HOY + timedelta(days=7 * i); b = a + timedelta(days=6)
    vence = [c for c in M["contratos"] if c["activo"] and a.isoformat() <= c["hasta"] <= b.isoformat()]
    semanas.append((a, sum(c["al_mes"] for c in vence), len(vence)))
por_tipo = "".join(f'<tr><td class="cod">{NOMBRE[t]}</td><td>{sum(1 for u in M["unidades"] if u["tipo"] == t)}</td><td>{sum(1 for c in M["contratos"] if c["activo"] and MUE[UNI[unidad_de(c["codigo"])]["mueble"]]["type"] == t)}</td><td>{V("ocup." + t)}</td></tr>' for t in ("gondola", "punta", "nevera_puertas"))
embudo = [("Empiezan este mes", sum(1 for c in M["contratos"] if c["desde"][:7] == hoy_iso[:7])), ("Con aviso de montaje", sum(1 for c in M["contratos"] if c["planometria"])),
          ("Registrados", len(M["reportes"])), ("Montados", sum(r["estado"] == "montado" for r in M["reportes"])), ("Verificados", 0)]
detalle = (cab("Detalle del tablero", "Resultado, lo que viene, por qué y la operación. Cada bloque con su lectura.", '<span class="btn">Ver como tabla</span><span class="btn">Exportar CSV</span>')
           + '<div class="dos">' + tarjeta_sec("Resultado", f'<div class="dato"><small>Canon contra potencial (Σ tarifas de los {len(M["unidades"])} espacios)</small><b>{V("kpi.canon_mes")} de {plata(potencial)}</b></div><div class="dato"><small>Ocupación · Canon ÷ tarifa</small><b>{V("kpi.ocupacion")} · {V("kpi.canon_tarifa")}</b></div><div class="dato"><small>Lo no facturado</small><b>{len(no_fact)} contrato por % de las ventas sin cortes cargados</b></div><p class="sub">Lectura: lo contratado se paga a tarifa; lo que falta es ocupar.</p>', "detalle-del-tablero")
           + tarjeta_sec("Lo que viene", "".join(f'<div class="dato"><small>Semana del {a.strftime("%d/%m")}</small><b>{plata(v)} al mes vencen · {n} contratos</b></div>' for a, v, n in semanas), "detalle-del-tablero") + "</div>"
           + '<div class="dos llenar">' + tarjeta_sec("Por qué", f'<div class="tabla-env"><table><thead><tr><th class="cod">Tipo</th><th>Espacios</th><th>Contratados</th><th>Ocupación</th></tr></thead><tbody>{por_tipo}</tbody></table></div>', "detalle-del-tablero")
           + tarjeta_sec("Operación", "".join(f'<div class="dato"><small>{t}</small><b>{n}</b></div>' for t, n in embudo) + '<p class="sub">La verificación de montajes de contratos es nueva: hoy no queda guardada.</p>', "detalle-del-tablero") + "</div>")
P("detalle", "Indicadores", "Detalle del tablero", f'<div class="contenido">{pest}{detalle}</div>', sec="detalle-del-tablero")

# ── Contratos: guardado y 3D con el proveedor ─────────────────────────────────
c5 = next(c for c in M["contratos"] if c["codigo"] == "PUN-05")
guardado = (cab("Contrato guardado", f'{C("lease", c5["lease_id"], "proveedor", c5["proveedor"])} · {R("PUN-05")} · {fecha(c5["desde"])} → {fecha(c5["hasta"])}', f'<a class="btn" href="nuevo-contrato.html">Contratar otro espacio</a><a class="btn pri" href="ficha-PUN-05.html">Ver la ficha</a>')
            + '<div class="dos">' + tarjeta_sec("Contrato guardado", f'<div class="dato"><small>Canon</small><b>{C("lease", c5["lease_id"], "al_mes", plata(c5["al_mes"]))} al mes · total {C("lease", c5["lease_id"], "total", plata(c5["total"]))}</b></div>'
            + li([f'Confirmación enviada a {escape(c5["proveedor"])}', f'Aviso de montaje: {"enviado (hay planometría)" if c5["planometria"] else "esperando la planometría"}', "Registro del montaje: " + ("hecho por Luis Pérez" if any(r["space_code"] == "CENTRO-PUN-05" for r in M["reportes"]) else "pendiente"), "Verificación: pendiente"]), "contrato-guardado")
            + tarjeta_sec("Línea de tiempo del espacio", f'<div class="gantt">{cab_t}<div class="fila-t"><span>PUN-05</span>{barra_tiempo(UNI["PUN-05"])}</div></div><p class="sub">Vuelve a estar disponible el {fecha((date.fromisoformat(c5["hasta"]) + timedelta(days=1)).isoformat())}.</p>', "contrato-guardado") + "</div>")
P("contrato-guardado", "Contratos", "Contrato guardado", f'<div class="contenido">{guardado}</div>', sec="contrato-guardado")
v3d = (cab(f"Ver en 3D con {escape(c5['proveedor'])}", "Delante del proveedor sólo lo suyo: ni tarifas ni nombres de otros.", f'<a class="btn" href="contrato-{c5["lease_id"]}.html">Volver al contrato</a>')
       + '<div class="editor3d llenar"><div class="escena">' + iso_svg("PUN-05") + '</div>'
       + tarjeta_sec("Ver en 3D con el proveedor", li(['<span class="seg"><span aria-pressed="true">Hoy</span><span>Con ' + escape(c5["proveedor"]) + '</span></span>', "Cambiar de cara · tomas · pantalla completa", "Probar un producto: buscar, elegir, quitar, cambiar de proveedor", "Subir un producto (foto del frente y nombre)", '<span class="btn pri">Bajar la propuesta</span> (lámina antes y después)']), "ver-en-3d-con-el-proveedor", 'style="align-self:start"') + "</div>")
P("ver3d-proveedor", "Contratos", "Ver en 3D con el proveedor", v3d, "editor", sec="ver-en-3d-con-el-proveedor")

# ── Distribución de una cara por participación (GON-03, cara A) ────────────────
cp3 = M["caras_part"]["GON-03"]
piezas3 = "".join(f'<div class="dato"><small>{p["codigo"].replace("CENTRO-", "")} · {p["contratado_pb"] // 100} % · dibujado {p["dibujado_pb"] // 100} %</small><b>{escape((p["terminos"][0].get("proveedor") or {}).get("nombre", "") if p.get("terminos") else "")} · <span class="btn suave">Ubicar</span> <span class="btn suave">⋯</span></b></div>' for p in cp3["participaciones"])
dist = (cab("Distribuir la cara · GON-03 cara A", f'{len(cp3["participaciones"])} participaciones contratadas · nada dibujado todavía (GET /api/participaciones/cara)', '<span class="seg"><span aria-pressed="true">Cara A</span><a href="ficha-GON-03-B.html">Cara B</a></span><a class="btn" href="plano3d.html">Ver en 3D</a><span class="btn pri">Listo, guardar la cara</span>')
        + '<div class="dos llenar">' + tarjeta_sec("La cara", cara_part(UNI["GON-03"], "14rem") + '<div class="acciones" style="margin-top:.75rem"><span class="btn">Franja</span><span class="btn">Estantes</span><span class="btn">A mano</span><span class="btn">Acomodar solas</span><span class="btn">Más ▾</span></div>', "distribucion-de-una-cara-por-participacion")
        + tarjeta_sec("Piezas", piezas3 + li(["Menú de una pieza: achicar a / dejar en X %, primer hueco libre, izquierda / derecha, sacar de la cara", "Renovar el contrato · pasar a contrato · cambiar o cancelar la reserva", "Formulario de participación (reserva provisional o contrato)",
                                              "Más: deshacer, rehacer, copiar de la otra cara, historial, sacar todas, descartar", "Pasar el mueble a participación", "Recuperar lo no guardado · conflicto («Traer lo nuevo / Usar lo mío»)"]), "distribucion-de-una-cara-por-participacion") + "</div>")
P("distribucion-GON-03", "Plano de la sede", "Distribuir GON-03", f'<div class="contenido">{dist}</div>', sec="distribucion-de-una-cara-por-participacion")

# ── Planograma: publicar y guía (GON-12 cara A) ───────────────────────────────
c12 = next(c for c in M["planogramas"] if c["codigo"] == "GON-12" and c["cara"] == "A")
dib12, piezas12 = cara_plan(M["caras_plan"]["GON-12-A"])
nombres12 = M["caras_plan"]["GON-12-A"]["destinos"]
pub = (cab("Publicar versión · GON-12 cara A", f'Vigente: versión {c12["numero"]} desde el {fecha(c12["rige_desde"])}', '<span class="btn pri">Publicar versión 2</span>')
       + '<div class="dos">' + tarjeta_sec("Publicar versión", li([f'Rige desde: {fecha(hoy_iso)} (o una fecha futura) · hasta: opcional, para una promoción', "Qué cambia contra la versión vigente: nada todavía (borrador vacío)", "Una publicada no se cambia: se reemplaza", '<span class="btn">Ver e imprimir la guía</span> <span class="btn">Mandarla a quien corresponde</span>']), "publicar-version")
       + tarjeta_sec("Guía de montaje", f'<p class="sub">CENTRO · GON-12 cara A · versión {c12["numero"]} · vigente desde el {fecha(c12["rige_desde"])}</p>{dib12}'
                     + li(["Paso 1 · Qué cambia contra la versión anterior: es la primera", "Paso 2 · Qué va dónde: " + ", ".join(f'{i + 1} {escape(nombres12.get(str(p["destino_id"]), {}).get("nombre", ""))} {p["pb"] // 100} %' for i, p in enumerate(piezas12)), "Paso 3 · Al terminar: casillas y firma",
                           '<span class="btn">Imprimir (A4, blanco y negro)</span> <span class="btn">Mandarla</span> <span class="btn">Copiar el enlace</span> — sin precios']), "guia-de-montaje") + "</div>")
P("publicar-GON-12-A", "Montajes", "Publicar versión", f'<div class="contenido">{pub}</div>', sec="publicar-version")

# ── Montaje en el teléfono (sin montos) ───────────────────────────────────────
para_hoy = sorted([m for m in M["contratos"] if m["activo"] or m["arranca_en"] <= 7], key=lambda c: c["desde"])[:5]
tel_aviso = telefono(f'<h3>Para montar hoy</h3>' + "".join(f'<div class="dato"><small>{R(c["codigo"])}</small><b>{escape(c["marca"])} · desde el {fecha(c["desde"])}</b></div>' for c in para_hoy)
                     + f'<div class="plano-env mini-plano">{plano(sel="PUN-05", cotas=False, enlaces=False, recorte=True)}</div><p class="sub">PUN-05 · punta de góndola · pasillo frente a la entrada</p>'
                     + '<span class="btn">Ver la planometría</span> <span class="btn suave">Entrar a RECABRA</span>')
P("montaje-telefono", "Montajes", "Aviso de montaje", f'<div class="contenido">{cab("Aviso de montaje en el teléfono", "Lo que abre el enlace del correo: ese espacio directamente, sin montos.", "")}<div class="dos llenar">{tarjeta_sec("Aviso de montaje en el teléfono", tel_aviso)}'
  f'{tarjeta_sec("Registrar montaje", telefono(li(["<span class='btn pri'>Registrar montaje (tomar foto)</span> · cámara o galería", "<span class='seg'><span aria-pressed='true'>Montaje realizado</span><span>No realizado</span></span>", "Motivo si no se pudo: el proveedor no entregó el material · no llegó el producto · el espacio está ocupado · otro (los de mounts.py)", "Quién registra: Luis Pérez · nota opcional", "<span class='btn pri'>Confirmar registro</span> <span class='btn'>Corregir lo que acabo de registrar</span>"])))}</div></div>', sec="aviso-de-montaje-en-el-telefono")
guia_tel = telefono(f'<h3>GON-12 · cara A · versión {c12["numero"]}</h3>' + "".join(f'<div class="dato"><b>{i + 1} · {escape(nombres12.get(str(p["destino_id"]), {}).get("nombre", ""))} · {p["pb"] // 100} %</b><span class="btn suave">Listo</span></div>' for i, p in enumerate(piezas12))
                    + li(["¿Cómo quedó? <span class='btn'>Quedó montada (foto opcional)</span> <span class='btn'>No se pudo (motivo y nota)</span>", "Aviso arriba si hay que corregir («el 2 y el 3 quedaron mal»)", "<span class='btn'>Imprimir la hoja</span>"]))
P("guia-enlace", "Montajes", "Guía por enlace", f'<div class="contenido">{cab("Guía de montaje por enlace", "La guía que recibe el encargado: marca cada número y avisa cómo quedó (POST /api/guia/aviso).", "")}{tarjeta_sec("Guía de montaje por enlace", guia_tel, extra="style='max-width:30rem'")}</div>', sec="guia-de-montaje-por-enlace")

r5 = next(r for r in M["reportes"] if r["space_code"] == "CENTRO-PUN-05")
verif = (cab("Verificar el montaje · PUN-05", f'{C("lease", c5["lease_id"], "proveedor", c5["proveedor"])} · reportó {C("mount_confirmations", r5["id"], "reportado_por", r5["reportado_por"])} el {fecha(r5["confirmado_en"])} a las {r5["confirmado_en"][11:16]}', "")
         + '<div class="dos llenar">' + tarjeta_sec("Verificar el montaje de un contrato", f'<div class="dos"><figure class="foto">Planometría<br><small>{escape(c5["planometria"] or "falta")}</small></figure><figure class="foto">Foto del montaje<br><small>{escape(r5.get("foto_nombre") or "sin foto")}</small></figure></div>'
                         + li(['<span class="btn pri">Coincide</span> <span class="btn peligro">No coincide</span> — con nota de qué corregir y reenviar el aviso', "Queda quién verificó y cuándo (nuevo: hoy no se guarda)"]))
         + tarjeta_sec("Resolver un montaje no realizado", "".join(f'<div class="dato"><small>{R(r["space_code"].replace("CENTRO-", ""))} · {C("mount_confirmations", r["id"], "estado", "No montado")}</small><b>{escape(r["motivo"].replace("_", " "))} · {escape(r["nota"] or "")}</b></div>' for r in M["reportes"] if r["estado"] == "no_montado")
                         + li(['<span class="btn">Reclamar al proveedor</span> <span class="btn">Liberar el espacio ocupado</span> <span class="btn">Reenviar el aviso con nueva fecha</span>', "Vuelve a «sin montar» o se cierra"])) + "</div>")
P("verificar-montaje", "Montajes", "Verificar el montaje", f'<div class="contenido">{verif}</div>', sec="verificar-el-montaje-de-un-contrato")

# ── Ajustes, con las secciones del inventario ─────────────────────────────────
GRUPOS_B = [("Comercial", [f'<a href="tarifas.html">Tarifas</a>: punta {C("tarifa", "punta", "al_mes", plata(M["tarifas"]["default"]["punta"]))} · góndola {C("tarifa", "gondola", "al_mes", plata(M["tarifas"]["default"]["gondola"]))} por cara · se guarda solo', "Temporadas: fechas, días antes y después, «se vende», volver al valor sugerido", "Metas por sede: ocupación y canon ÷ tarifa, con umbrales (nuevo)"]),
            ("Sede y plano", ["Sedes: CENTRO · crear, renombrar, eliminar (con confirmación)", "Nombres de los muebles de este supermercado", "Ordenar códigos: alcance, recalcular, imprimir el informe, aplicar", '<a href="plano2d.html">Catálogo de muebles propios</a> (hoy /taller)']),
            ("Avisos", [f'Recordatorios: <span data-campo="notifications:config:reminder_days">{escape(M["avisos"]["reminder_days"])}</span> días antes del vencimiento · correos: {escape(M["avisos"]["notify_emails"] or "ninguno")}', '<span class="btn">Enviar correo de prueba</span>', "Responsables por sede: comercial, administración y montaje (faltan)"]),
            ("Equipo", [f'Usuarios: {len(M["equipo"]["miembros"])} miembros · {len(M["equipo"]["invitaciones"])} invitaciones · <span class="btn">Invitar</span> con rol (Trabajador, Administrador, Dueño)', "Ver miembros e invitaciones, con último ingreso y vencimiento", "Activar o desactivar un miembro", f'Permisos: quién publica planogramas: {escape(M["planogramas_resumen"]["quien_publica"])}']),
            ("Cuenta", ["Suscripción y facturación", "Copia de seguridad (ZIP de todo)", "Mis datos: descargarlos y solicitar la supresión", "Reporte de transparencia", '<a href="bitacora.html">Bitácora</a>: filtro por acción', '<a href="configuracion-inicial.html">Configuración inicial: volver a mostrarla</a>', "Metas: 90 % de ocupación y 95 % de canon ÷ tarifa", "Nombres del menú: Contratos · Indicadores · Montajes · Plano de la sede", "Importes completos, sin abreviar «M»", "Orden de implementación", "Una persona nueva que pruebe la primera etapa"])]
ajustes = (f'<div class="contenido">{cab("Ajustes", "La configuración, agrupada por tema.", "")}<div class="rejilla-caras llenar">'
           + "".join(f'<section class="tarjeta" id="{slug(t)}" data-sec="{slug(t)}"><header><h2>{t}</h2></header>' + li(xs) + "</section>" for t, xs in GRUPOS_B) + "</div></div>")
P("ajustes", "Ajustes", "Ajustes", ajustes, sec="ajustes")
