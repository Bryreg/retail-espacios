import sys
from datetime import date
exec(open("recorrido.py").read())

TAG = {"E": ("Existe hoy", VERDE, "#E6F2EA"), "C": ("Cambia", AMBAR, "#FFF4D6"), "N": ("Nuevo", "#2F5DA8", "#EAF0FB")}
def chip_tag(k):
    t, c, bg = TAG[k]
    return f'<span style="align-self: start; padding: 3px 9px; border-radius: 999px; background: {bg}; color: {c}; font-size: 12px; font-weight: 700; white-space: nowrap;">{t}</span>'
def flujo(nombre, titulo, sub, pasos, extra=""):
    filas = ""
    for i, (paso, donde, quien, que, queda, k) in enumerate(pasos, 1):
        filas += (f'<div style="display: grid; grid-template-columns: 44px 230px 210px 140px minmax(0, 1fr) 260px 100px; gap: 16px; align-items: start; padding: 14px 18px; border-top: 1px solid #ECEAE4; font-size: 14px; line-height: 1.45;">'
                  f'<span style="width: 30px; height: 30px; border-radius: 999px; background: {TINTA}; color: {BLANCO}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px;">{i}</span>'
                  f'<b>{paso}</b><span style="color: #3D3D3A;">{donde}</span><span style="color: #3D3D3A;">{quien}</span><span>{que}</span><span style="color: {GRIS};">{queda}</span>{chip_tag(k)}</div>')
    cab = f'<div style="display: grid; grid-template-columns: 44px 230px 210px 140px minmax(0, 1fr) 260px 100px; gap: 16px; padding: 10px 18px; background: #F4F2EC; font-size: 11px; font-weight: 700; letter-spacing: .06em; color: {GRIS};"><span></span><span>PASO</span><span>DÓNDE</span><span>QUIÉN</span><span>QUÉ VE Y QUÉ HACE</span><span>QUÉ QUEDA</span><span>HOY</span></div>'
    ley = "".join(f'<span style="display: inline-flex; align-items: center; gap: 6px;">{chip_tag(k)}<span style="font-size: 13px; color: {GRIS};">{d}</span></span>' for k, d in [("E", "funciona así hoy"), ("C", "existe, con otro lugar o nombre"), ("N", "hay que construirlo")])
    alto = 200 + 68 * len(pasos) + (170 if extra else 0)
    cuerpo = f'''<div style="display: flex; flex-direction: column; gap: 16px; padding: 36px 40px;">
<div style="display: flex; align-items: flex-end; gap: 20px;"><span style="display: flex; flex-direction: column; gap: 6px; flex-grow: 1;"><h1 style="margin: 0; font-size: 28px;">{titulo}</h1><span style="font-size: 15px; color: {GRIS}; line-height: 1.5;">{sub}</span></span><div style="display: flex; gap: 14px; flex-wrap: wrap;">{ley}</div></div>
<div style="border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; overflow: hidden;">{cab}{filas}</div>
{extra}
</div>'''
    guardar(nombre, titulo, 1760, alto, cuerpo)
    return alto

ALTOS = {}
# ======================= 1 · CLIENTE NUEVO =======================
ALTOS["F1"] = flujo("F1", "Flujo 1 · Un cliente nuevo", "Un supermercado que nunca usó RECABRA, desde la página pública hasta su primer contrato. Quien lo da de alta queda como dueño.", [
 ("Crear la cuenta", "Página pública → «Crear mi cuenta»", "Dueño", "Ingresa con Google o con correo y contraseña. Verifica el correo.", "Una cuenta personal, todavía sin supermercado.", "E"),
 ("Registrar el supermercado", "Pantalla de ingreso", "Dueño", "«Registrar un supermercado nuevo»: nombre y aceptación de la política de datos. «Crear y entrar».", "El supermercado creado; la persona queda como dueño.", "E"),
 ("Configuración inicial", "Primera pantalla al entrar", "Dueño", "Una lista de 6 pasos con avance y el siguiente marcado. Se puede ocultar y volver.", "Se sabe qué falta para operar.", "N"),
 ("Crear las sedes", "Configuración inicial → Ajustes › Sedes", "Dueño", "Nombre de cada sede (CENTRO, PALMAS).", "Una sede vacía por supermercado físico.", "C"),
 ("Dibujar el plano de cada sede", "Plano de la sede", "Dueño o administrador", "Contorno con medidas; muebles desde el catálogo; para cada uno, si se contrata y cómo (entero, por partes, por participación) o si no se vende. Validación del plano.", "Muebles con código; espacios contratables.", "C"),
 ("Definir tarifas", "Ajustes › Tarifas", "Dueño o administrador", "Canon mensual de referencia por tipo de mueble; general y por sede.", "Contratos comparados contra tarifa.", "C"),
 ("Definir responsables por sede", "Ajustes › Responsables por sede", "Dueño o administrador", "Correo del responsable comercial, de administración y de montaje de cada sede. Correo de prueba.", "Los avisos llegan a quien corresponde.", "C"),
 ("Invitar al equipo", "Ajustes › Usuarios", "Dueño o administrador", "Correo y rol: Trabajador, Administrador o Dueño. La invitación vence; se ve quién no la aceptó.", "El equipo entra a SU supermercado, sin fundar otro.", "E"),
 ("Primer contrato o planilla", "Contratos", "Administrador", "Nuevo contrato a partir de fechas, o «Cargar desde planilla» con los contratos que ya tenían.", "Contratos vigentes; empiezan los avisos de montaje.", "C"),
 ("Suscripción", "Ajustes › Suscripción y facturación", "Dueño", "Plan, próxima cuenta de cobro, datos de facturación, pagos registrados.", "La cuenta al día.", "E"),
])

# --- C1 · configuración inicial de 6 pasos
c1 = encabezado("—", pendientes=0) + f'''
<main style="display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 28px; padding: 28px; flex-grow: 1;">
<section style="display: flex; flex-direction: column; gap: 14px; min-width: 0;">
<div style="display: flex; flex-direction: column; gap: 6px;"><h1 style="margin: 0; font-size: 26px;">Configuración inicial · Supermercado La Esquina</h1><p style="margin: 0; font-size: 15px; color: {GRIS};">Seis pasos para operar. El orden es sugerido; el avance queda guardado.</p></div>
<div style="display: flex; align-items: center; gap: 12px;"><div style="flex-grow: 1; height: 8px; border-radius: 999px; background: #DEDBD3; overflow: hidden;"><div style="width: 50%; height: 8px; background: {VERDE};"></div></div><b style="font-size: 14px;">3 de 6</b></div>
{tarjeta(check_item("Crear las sedes", "CENTRO y PALMAS", "ok") + check_item("Dibujar el plano", "CENTRO: 16 muebles, 22 espacios contratables · PALMAS: 12 muebles, 15 espacios", "ok") + check_item("Definir tarifas", "4 tipos de mueble con tarifa general", "ok") + check_item("Definir responsables por sede", "Falta el responsable de montaje de PALMAS. Sin él, los avisos de montaje de PALMAS no salen.", "act") + '<div style="padding: 0 0 8px 36px;">' + boton("Completar responsables", "pri") + "</div>" + check_item("Invitar al equipo", "Correo y rol de cada persona.", "no") + check_item("Registrar el primer contrato", "O cargar los existentes desde una planilla.", "no"), "gap: 0; padding: 6px 18px;")}
<a href="#" style="font-size: 13px; color: {GRIS};">Ocultar la configuración inicial</a>
</section>
{tarjeta(f'<b style="font-size: 16px;">Por qué este orden</b><span style="font-size: 14px; color: #3D3D3A; line-height: 1.55;">Sin plano no hay espacios para contratar; sin tarifas no se sabe si un canon queda bajo; sin responsables, los avisos de montaje no tienen a quién llegar. Invitar al equipo y el primer contrato pueden ir en cualquier momento.</span>', "align-self: start;")}
</main>''' + nota("Configuración inicial para un cliente nuevo: seis pasos, cada uno con lo que falta escrito y una sola acción principal.")
guardar("C1", "Cliente nuevo: configuración inicial", 1280, 820, c1)

# --- C2 · invitar al equipo
fila_u = lambda n, c, r, e, ult: f'<div style="display: grid; grid-template-columns: 1.3fr 1.6fr 1fr 1.1fr 1fr; gap: 12px; align-items: center; padding: 11px 16px; border-top: 1px solid #ECEAE4; font-size: 14px;"><b>{n}</b><span style="color: {GRIS};">{c}</span><span>{r}</span><span>{e}</span><span style="color: {GRIS};">{ult}</span></div>'
c2 = encabezado("—", pendientes=0).replace('aria-label="Ajustes" style="width: 40px; height: 40px; flex-shrink: 0; border-radius: 10px; border: 1px solid #DEDBD3; background: #FFFFFF;', 'aria-label="Ajustes" style="width: 40px; height: 40px; flex-shrink: 0; border-radius: 10px; border: 0; background: #141413;').replace(ico("ajustes"), ico("ajustes", color=BLANCO)) + f'''
<main style="display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 16px; padding: 16px 24px; flex-grow: 1; min-height: 0;">
<nav aria-label="Ajustes" style="display: flex; flex-direction: column; padding: 4px 8px 12px; border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE};">{nav_aj(GR, "Usuarios")}</nav>
<section style="display: flex; flex-direction: column; gap: 14px; min-width: 0;">
<div style="display: flex; flex-direction: column; gap: 4px;"><h1 style="margin: 0; font-size: 22px;">Usuarios</h1><span style="font-size: 14px; color: {GRIS};">Quién entra a Supermercado La Esquina y con qué rol.</span></div>
{tarjeta(f'<b style="font-size: 15px;">Invitar a una persona</b><div style="display: grid; grid-template-columns: 1.6fr 1.4fr auto; gap: 10px; align-items: end;">{campo("Correo", inp2("luis.perez@laesquina.co"))}{campo("Rol", '<div style="display: flex; gap: 6px;">' + opcion("Trabajador", True) + opcion("Administrador", False) + opcion("Dueño", False) + "</div>")}{boton("Invitar", "pri", h=42)}</div><span style="font-size: 12px; color: {GRIS}; line-height: 1.5;"><b>Trabajador</b>: Montajes e Indicadores sin importes. <b>Administrador</b>: todo, menos la suscripción, la copia de seguridad y los datos de la cuenta. <b>Dueño</b>: todo. La invitación vence a los 7 días y se acepta con ese mismo correo.</span>')}
<div style="border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; overflow: hidden;">
<div style="display: grid; grid-template-columns: 1.3fr 1.6fr 1fr 1.1fr 1fr; gap: 12px; padding: 10px 16px; background: #F4F2EC; font-size: 11px; font-weight: 700; letter-spacing: .06em; color: {GRIS};"><span>PERSONA</span><span>CORREO</span><span>ROL</span><span>ESTADO</span><span>ÚLTIMO INGRESO</span></div>
{fila_u("Ana Gómez", "ana@laesquina.co", "Dueño", "Activa", "hoy")}
{fila_u("Marta Ruiz", "marta.ruiz@laesquina.co", "Administrador", "Activa", "24/10/2026")}
{fila_u("Luis Pérez", "luis.perez@laesquina.co", "Trabajador", f'<span style="color: {AMBAR}; font-weight: 600;">Invitado · vence 02/11/2026</span>', "—")}
</div>
</section>
</main>''' + nota("Invitar al equipo: correo y rol, con lo que puede hacer cada rol escrito al lado. La invitación suma a la persona a ESTE supermercado; nunca crea otro.")
guardar("C2", "Cliente nuevo: invitar al equipo", 1280, 820, c2)

# ======================= 2 · PLANOGRAMA DE UN MUEBLE QUE NO SE VENDE =======================
ALTOS["F2"] = flujo("F2", "Flujo 2 · Planograma de un mueble que no se vende", "Un mueble interno (por ejemplo, la góndola de granos de marca propia): se decide qué va en cada lugar, se publica, se monta y se verifica. No tiene contrato, proveedor ni precio.", [
 ("Marcarlo como no contratable", "Plano de la sede → ficha del mueble → Contratación", "Administrador", "«¿Se puede contratar? No». El mueble queda fuera de Contratos, de la ocupación y del canon.", "GON-05 · mueble interno.", "E"),
 ("Abrir el planograma de la cara", "Ficha del mueble → «Planograma de la cara A»", "Administrador (o el equipo, si está habilitado)", "Se abre «Planificar la cara» encima de todo, con la cara a escala.", "Un borrador por cara, que se guarda solo.", "E"),
 ("Agregar destinos", "Planificar la cara → «Agregar destino»", "Administrador", "Nombre, tipo (marca propia, categoría, producto o grupo, promoción, otro), % de la cara, cómo se monta, código en tu sistema.", "Destinos reutilizables en la sede.", "E"),
 ("Ubicarlos en la cara", "Planificar la cara", "Administrador", "Arrastrar cada destino; forma Franja, Estantes o A mano. El % no cambia al estirar. Lo que falta ubicar se ve.", "100 % de la cara asignado, sin superposiciones.", "E"),
 ("Publicar la versión", "«Publicar versión 1»", "Administrador", "Rige desde (≥ hoy), hasta opcional (una promoción), qué cambia contra la anterior.", "Versión 1 vigente; no se edita: se reemplaza con la 2.", "E"),
 ("Mandar la guía de montaje", "Aviso de «Listo» → «Mandarla a quien corresponde»", "Administrador", "Hoja con cada destino numerado, estantes contados desde arriba y medidas en cm. Imprimir, enviar o copiar el enlace.", "El responsable de montaje recibe el enlace.", "E"),
 ("Montar y avisar", "Enlace de la guía, en el teléfono", "Responsable de montaje", "Marca cada número, «Quedó montada» (foto opcional) o «No se pudo» con motivo y nota.", "Versión «montada, falta revisar» o «no se pudo».", "E"),
 ("Verificar", "Pendientes → «Planograma montado por revisar»", "Administrador", "La guía numerada al lado de las fotos: «Sí, coincide» o «No coincide» marcando los números mal y reenviando la guía.", "Versión «coincide» o «no coincide».", "C"),
 ("Cambiarlo después", "Planificar la cara → «Versiones»", "Administrador", "Nueva versión (por ejemplo, la promoción de diciembre con fin). Al vencer, sigue vigente la última.", "Historia de versiones, cada una con su montaje.", "E"),
])

# --- P1 · Planificar la cara
DEST = [("1", "Arroz La Esquina", "Marca propia", 30, "#E8D9B5", "#8A6A1E"), ("2", "Aceites", "Categoría", 25, "#CFE0F2", "#2F5DA8"), ("3", "Pastas", "Categoría", 25, "#D9EAD3", "#1F7A4D"), ("4", "2x1 granos", "Promoción", 20, "#F2D4E4", "#9B2C6B")]
lista_d = "".join(f'<div style="display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 0; border-top: 1px solid #F0EEE8;"><span style="width: 24px; height: 24px; border-radius: 6px; background: {bg}; border: 2px solid {bc}; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">{n}</span><span style="display: flex; flex-direction: column;"><b style="font-size: 14px;">{t}</b><span style="font-size: 12px; color: {GRIS};">{k}</span></span><b style="font-size: 14px;">{p} %</b></div>' for n, t, k, p, bg, bc in DEST)
def estante(cols):
    return '<div style="display: flex; gap: 4px; height: 70px;">' + "".join(f'<span style="flex: {w}; background: {bg}; border: 2px solid {bc}; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px;">{n}</span>' for n, w, bg, bc in cols) + "</div>"
d = {n: (bg, bc) for n, _, _, _, bg, bc in DEST}
cara = (f'<div style="display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 6px; background: #EDE9E0; border: 3px solid #8A867C;">'
        + estante([("4", 100, *d["4"])]) + estante([("2", 50, *d["2"]), ("3", 50, *d["3"])]) + estante([("2", 50, *d["2"]), ("3", 50, *d["3"])]) + estante([("1", 100, *d["1"])]) + estante([("1", 100, *d["1"])])
        + "</div>")
p1 = f'''<div style="display: flex; align-items: center; gap: 12px; height: 60px; padding: 0 24px; background: {BLANCO}; border-bottom: 1px solid {BORDE}; flex-shrink: 0;"><b style="font-size: 17px;">Planificar la cara · GON-05 · Góndola 5, cara A</b><span style="font-size: 13px; color: {GRIS};">Mueble interno · 2,00 m × 1,80 m · 5 estantes</span><span style="flex-grow: 1;"></span><span style="display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: {VERDE};"><span style="width: 8px; height: 8px; border-radius: 999px; background: {VERDE};"></span>Borrador guardado</span>{boton("Versiones")}{boton("Salir")}{boton("Publicar versión 1", "pri")}</div>
<main style="display: grid; grid-template-columns: 300px minmax(0, 1fr) 300px; gap: 16px; padding: 16px 24px; flex-grow: 1; min-height: 0;">
{tarjeta(f'<b style="font-size: 15px;">Destinos de esta cara</b>{lista_d}<div style="padding-top: 8px;">{boton("Agregar destino", icono="mas2")}</div>')}
{tarjeta(f'<div style="display: flex; align-items: center; gap: 10px;"><b style="font-size: 15px; flex-grow: 1;">Cara A, de frente</b>{lente(["Franja", "Estantes", "A mano"], "Estantes")}</div><div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; padding: 20px; border-radius: 12px; background: #F6F5F1;"><div style="width: 520px;">{cara}<div style="display: flex; justify-content: space-between; font-size: 11px; color: {GRIS}; padding-top: 6px;"><span>0 cm</span><span>100 cm</span><span>200 cm</span></div></div></div><span style="font-size: 13px; color: {GRIS};">Arrastrá un destino desde la izquierda. Al estirar una pieza su % no cambia.</span>', "flex-grow: 1;")}
{tarjeta(f"""<b style="font-size: 15px;">Revisión antes de publicar</b>
{check_item("100 % de la cara asignado", "30 + 25 + 25 + 20 %", "ok")}
{check_item("Sin superposiciones", "Ningún destino pisa a otro", "ok")}
{check_item("Cada destino con su % exacto", "Dibujado = pedido", "ok")}
<span style="font-size: 12px; color: {GRIS}; line-height: 1.5; margin-top: auto;">Un mueble que no se vende no tiene contratos, proveedor ni precio: sólo destinos.</span>""")}
</main>''' + nota("Planificar la cara de un mueble interno: los destinos a la izquierda, la cara a escala en el medio y la revisión que habilita «Publicar versión 1».")
guardar("P1", "Planograma: planificar la cara", 1280, 820, p1)

# --- P2 · publicar y mandar la guía
p2 = p1[:p1.rfind('<div style="flex-shrink: 0; display: flex; align-items: center; gap: 10px; height: 44px;')] + velo() + f'''
<div role="dialog" aria-label="Publicar versión 1" style="position: absolute; left: 50%; top: 110px; width: 600px; margin-left: -300px; display: flex; flex-direction: column; border-radius: 18px; background: {BLANCO}; box-shadow: 0 24px 60px rgba(20,20,19,.3); overflow: hidden;">
<div style="display: flex; flex-direction: column; gap: 4px; padding: 20px 22px 8px;"><b style="font-size: 20px;">Publicar versión 1 · GON-05, cara A</b><span style="font-size: 13px; color: {GRIS};">Una versión publicada no se cambia: se reemplaza con la siguiente.</span></div>
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 12px 22px;">{campo("Rige desde", inp2("02/11/2026"), "Hoy o una fecha futura")}{campo("Hasta (opcional)", inp2("sin fin"), "Ponela si es una promoción")}</div>
<div style="padding: 4px 22px 14px; font-size: 14px; line-height: 1.5;"><b>Qué cambia:</b> primera versión de esta cara.</div>
<div style="display: flex; flex-direction: column; gap: 8px; padding: 14px 22px; background: #F4F2EC; font-size: 14px; line-height: 1.5;"><b>Después de publicar</b><span>La guía de montaje queda lista: la hoja con cada destino numerado (1 a 4), los estantes contados desde arriba y las medidas en cm.</span><div style="display: flex; gap: 8px;">{boton("Ver e imprimir la guía")}{boton("Mandarla a quien corresponde")}</div><span style="font-size: 12px; color: {GRIS};">Quien corresponde: el responsable de montaje de CENTRO (Luis Pérez). La guía no lleva precios.</span></div>
<div style="display: flex; gap: 8px; padding: 14px 22px; border-top: 1px solid #ECEAE4;"><span style="flex-grow: 1;"></span>{boton("Volver")}{boton("Publicar versión 1", "pri")}</div>
</div>''' + nota("Publicar: desde cuándo rige y hasta cuándo, si es una promoción. Al publicar, la guía de montaje se imprime o se manda; no sale sola.")
guardar("P2", "Planograma: publicar y mandar la guía", 1280, 820, p2)

# ======================= 3 · VENDER ENTERO, POR ENTREPAÑO O POR PORCENTAJE =======================
ALTOS["F3"] = flujo("F3", "Flujo 3 · Contratar un mueble entero, por entrepaño o por porcentaje", "Los tres empiezan igual (las fechas) y terminan igual (proveedor, canon, confirmación). Cambia sólo el paso «Qué se contrata», que depende de cómo se configuró el mueble en el Plano de la sede.", [
 ("Configurar cómo se contrata", "Plano de la sede → ficha del mueble → Contratación", "Administrador", "Entera · Por partes (entrepaños, tramos o puertas, según el tipo de mueble) · Por participación. Una sola forma por mueble.", "PUN-08 entera · PUN-02 por 5 entrepaños · GON-03 por participación.", "E"),
 ("¿Para qué fechas?", "Contratos, primera línea", "Administrador", "Del / al, o un atajo (1, 3, 6 meses, temporadas).", "El plano y la lista responden por esas fechas.", "N"),
 ("Elegir el espacio", "Contratos → plano o lista", "Administrador", "Entera: el mueble. Por partes: el mueble muestra sus partes (EN1 a EN5), cada una con su disponibilidad. Por participación: «queda 20 % de la cara A».", "Lo que se contrata, con sus códigos.", "C"),
 ("Qué se contrata", "Paso 1 del contrato", "Administrador", "Entera: nada que elegir. Por partes: marcar entrepaños disponibles. Por participación: el % (como máximo lo que queda).", "PUN-08 · PUN-02-EN2 y EN3 · GON-03-A 20 %.", "C"),
 ("Proveedor y vigencia", "Paso 2", "Administrador", "Proveedor (autocompleta), marca, fechas ya puestas desde la pregunta inicial.", "—", "C"),
 ("Canon", "Paso 3", "Administrador", "Canon mensual o valor total; tarifa al lado: de la clase o de la cara ÷ partes; para un %, la proporción de la cara.", "Canon comparado con la tarifa.", "E"),
 ("Confirmación", "Paso 4", "Administrador", "Resumen en una frase, planometría, a quién se avisa. Guardar contrato o reservar provisionalmente.", "Contrato vigente o reserva con caducidad.", "E"),
 ("Sólo por participación: ubicarla", "Pendientes → «Falta ubicar» → Distribución", "Administrador", "Dibujar la zona de la marca en la cara. El dibujo no cambia el %. Confirmar la cara.", "Zona confirmada: recién ahí sale el aviso de montaje.", "E"),
 ("Aviso de montaje", "Automático", "—", "Con planometría (y zona confirmada si es %), al responsable de montaje, sin montos.", "El montaje queda pendiente para la fecha de inicio.", "E"),
])

# --- V1 · «Qué se contrata» en los tres casos
def panel(titulo, sub, cuerpo, pie):
    return f'''<section style="display: flex; flex-direction: column; border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; overflow: hidden;">
<div style="display: flex; flex-direction: column; gap: 3px; padding: 16px 18px; border-bottom: 1px solid #ECEAE4;"><span style="font-size: 12px; font-weight: 700; letter-spacing: .06em; color: {GRIS};">{sub}</span><b style="font-size: 18px;">{titulo}</b></div>
<div style="display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; flex-grow: 1;">{cuerpo}</div>
<div style="padding: 14px 18px; border-top: 1px solid #ECEAE4; background: #FAF9F6;">{pie}</div></section>'''
ENT = [("EN5", "c", "Contratado · Lácteos Andinos hasta 31/03/2027", False), ("EN4", "p", "Disponible desde el 01/12/2026", False), ("EN3", "d", "Disponible todas las fechas", True), ("EN2", "d", "Disponible todas las fechas", True), ("EN1", "d", "Disponible todas las fechas · base", False)]
entrepanos = '<div style="display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 6px; background: #EDE9E0; border: 3px solid #8A867C;">' + "".join(
    f'<div style="display: grid; grid-template-columns: 22px 46px minmax(0, 1fr); gap: 8px; align-items: center; height: 46px; padding: 0 10px; border-radius: 4px; background: {EST[e][0]}; border: 2px {EST[e][2]} {EST[e][1]}; {"box-shadow: 0 0 0 3px " + TINTA + ";" if on else ""}">{casilla(on) if e != "c" else "<span></span>"}<b style="font-family: ui-monospace, Menlo, monospace; font-size: 13px;">{c}</b><span style="font-size: 12px;">{t}</span></div>' for c, e, t, on in ENT) + "</div>"
barra_pc = (f'<div style="display: flex; height: 40px; border-radius: 8px; overflow: hidden; border: 2px solid #8A867C;">'
            f'<span style="flex: 50; background: #F5D0CC; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600;">Contratado 50 %</span>'
            f'<span style="flex: 30; background: #F5D0CC; border-left: 2px solid {BLANCO}; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600;">Contratado 30 %</span>'
            f'<span style="flex: 20; background: #FFF4D6; border-left: 2px dashed {AMARILLO}; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">Disponible 20 %</span></div>')
v1 = f'''<div style="display: flex; flex-direction: column; gap: 16px; padding: 32px 40px; flex-grow: 1;">
<div style="display: flex; flex-direction: column; gap: 6px;"><h1 style="margin: 0; font-size: 26px;">Paso 1 · «Qué se contrata», según cómo se contrata el mueble</h1><span style="font-size: 15px; color: {GRIS};">Las fechas ya están elegidas: del 01/11/2026 al 31/01/2027 (92 días). Lo demás del contrato es igual en los tres casos.</span></div>
<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; flex-grow: 1;">
{panel("PUN-08 · Punta de góndola 8", "ENTERA", f'<div style="height: 260px; border-radius: 8px; background: #CDE7D6; border: 2px solid {VERDE}; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 6px;"><b style="font-family: ui-monospace, Menlo, monospace; font-size: 18px;">PUN-08</b><span style="font-size: 13px;">Disponible todas las fechas</span></div>{fila_res("Se contrata", "El mueble completo")}{fila_res("Tarifa", "$ 600.000 /mes")}', boton("Siguiente: proveedor y vigencia", "pri", "width: 100%;"))}
{panel("PUN-02 · Punta de góndola 2", "POR ENTREPAÑOS · 5", f'{entrepanos}<span style="font-size: 12px; color: {GRIS}; line-height: 1.45;">Entrepaños contados desde la base (EN1). Se pueden contratar varios a la vez; el mueble entero no se contrata mientras haya un entrepaño contratado en esas fechas.</span>{fila_res("Se contrata", "PUN-02-EN2 y PUN-02-EN3")}{fila_res("Tarifa", "$ 120.000 /mes cada uno · $ 240.000 /mes")}', boton("Siguiente: proveedor y vigencia", "pri", "width: 100%;"))}
{panel("GON-03 · Góndola 3, cara A", "POR PARTICIPACIÓN", f'{barra_pc}<span style="font-size: 13px; color: #3D3D3A;">En tus fechas queda <b>20 % de la cara A</b>. Sin nombres de otros proveedores.</span>{campo("Porcentaje a contratar", inp2("20 %", True), "Como máximo 20 %")}{fila_res("Tarifa", "$ 450.000 /mes la cara · 20 % = $ 90.000 /mes")}<span style="font-size: 12px; color: {GRIS}; line-height: 1.45;">Después de guardar, falta ubicar la zona en la cara (Distribución). El aviso de montaje sale con la zona confirmada.</span>', boton("Siguiente: proveedor y vigencia", "pri", "width: 100%;"))}
</div>
</div>'''
guardar("V1", "Contratar: entero, por entrepaño o por porcentaje", 1760, 860, v1)

# ======================= 4 · REVISAR LOS MONTAJES =======================
ALTOS["F4"] = flujo("F4", "Flujo 4 · Revisar los montajes", "Hay dos clases de montaje: el de un contrato (el material del proveedor en su espacio) y el de un planograma (la versión publicada de una cara). Los dos terminan en el módulo Montajes y en Pendientes.", [
 ("Sale el aviso", "Automático (contrato) o «Mandar la guía» (planograma)", "—", "Contrato: correo sin montos, con enlace, cuando hay planometría (y zona, si es %). Planograma: la guía de la versión.", "Montaje «sin montar», con fecha de inicio.", "E"),
 ("Ver qué hay que montar", "Montajes", "Responsable de montaje", "Lista ordenada por fecha de inicio: lo que ya empezó primero. Mapa de la sede con el mueble señalado y la ubicación escrita.", "—", "E"),
 ("Registrar el montaje", "Teléfono, desde el enlace o desde Montajes", "Responsable de montaje", "«Lo monté» con foto, o «No pude» con motivo: no llegó el material, no llegó el producto, el espacio está ocupado, otro. Nota opcional.", "Montado (con foto) o no realizado (con motivo).", "E"),
 ("Ver lo que necesita atención", "Pendientes, por fecha límite", "Administrador", "No realizado (con motivo y foto) · Contratado sin montar (ya empezó y no hay registro) · Planograma montado por revisar · Falta planometría.", "Cada fila con su acción.", "C"),
 ("Verificar un planograma", "Pendientes → ficha de la versión", "Administrador", "La guía numerada al lado de las fotos: «Sí, coincide» (o «Lo vi en la tienda») / «No coincide», marcando números y reenviando la guía.", "Coincide o no coincide, con quién y cuándo.", "E"),
 ("Verificar un contrato", "Pendientes → «Montado, sin verificar»", "Administrador", "La planometría al lado de la foto: «Coincide» / «No coincide» con nota y reenvío del aviso. Hoy el montaje de un contrato se registra pero no se verifica.", "El montaje del contrato queda verificado.", "N"),
 ("Resolver un no realizado", "Pendientes → «No se pudo montar»", "Administrador", "Según el motivo: reclamar al proveedor, liberar el espacio ocupado, o reenviar el aviso con nueva fecha.", "Vuelve a «sin montar» o se cierra.", "C"),
 ("Ver el historial", "Ficha del espacio o Versiones", "Administrador", "Cada montaje con su foto, quién lo registró, cuándo y su verificación.", "Trazabilidad por espacio y por versión.", "C"),
])

# --- M1 · módulo Montajes (administrador)
def fila_m(cod, clase, quien, inicio, estado, ecol, accion, pri=False):
    return (f'<div style="display: grid; grid-template-columns: 1.6fr 1fr 1.2fr .9fr 1.3fr 170px; gap: 12px; align-items: center; padding: 12px 16px; border-top: 1px solid #ECEAE4; font-size: 14px;">'
            f'<b>{cod}</b><span style="color: {GRIS};">{clase}</span><span>{quien}</span><span>{inicio}</span><span style="color: {ecol}; font-weight: 600;">{estado}</span>{boton(accion, "pri" if pri else "sec", h=34, extra="font-size: 13px; width: 100%;")}</div>')
filtros_m = '<div style="display: flex; gap: 6px; flex-wrap: wrap;">' + "".join(f'<span style="padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; {"background: " + TINTA + "; color: " + BLANCO + ";" if i == 0 else "border: 1px solid #DEDBD3; background: " + BLANCO + ";"}">{t}</span>' for i, t in enumerate(["Todos · 9", "Sin montar · 3", "Montado, sin verificar · 2", "No realizado · 1", "Verificado · 3"])) + "</div>"
m1 = encabezado("Montajes", pendientes=3) + barra_modulo("Montajes", lente(["Lista", "En el plano"], "Lista"), "Sede CENTRO · por fecha de inicio") + f'''
<main style="display: flex; flex-direction: column; gap: 12px; padding: 14px 24px 16px; flex-grow: 1; min-height: 0;">
{filtros_m}
<div style="border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; overflow: hidden;">
<div style="display: grid; grid-template-columns: 1.6fr 1fr 1.2fr .9fr 1.3fr 170px; gap: 12px; padding: 10px 16px; background: #F4F2EC; font-size: 11px; font-weight: 700; letter-spacing: .06em; color: {GRIS};"><span>ESPACIO O CARA</span><span>CLASE</span><span>PROVEEDOR O VERSIÓN</span><span>INICIO</span><span>ESTADO</span><span>ACCIÓN</span></div>
{fila_m("PUN-03 · Punta de góndola 3", "Contrato", "Café Montaña", "26/10/2026", "No realizado · sin material", ROJO, "Ver registro y foto", True)}
{fila_m("PUN-08 · Punta de góndola 8", "Contrato", "Galletas Sol", "01/11/2026", "Montado, sin verificar", AMBAR, "Verificar montaje")}
{fila_m("GON-05 · cara A", "Planograma", "Versión 1", "02/11/2026", "Montado, sin verificar", AMBAR, "Verificar montaje")}
{fila_m("GON-03 · cara A · 20 %", "Contrato", "Bebidas del Valle", "01/11/2026", "Sin montar · falta zona", GRIS, "Ubicar la zona")}
{fila_m("GON-02 · cara A", "Contrato", "Aseo Total", "27/10/2026", "Sin montar · falta planometría", GRIS, "Adjuntar planometría")}
{fila_m("PUN-02 · EN2 y EN3", "Contrato", "Snacks Andes", "15/11/2026", "Sin montar · aviso enviado", GRIS, "Ver aviso")}
{fila_m("PUN-07 · Punta de góndola 7", "Contrato", "Galletas Sol", "01/05/2026", "Verificado: coincide", VERDE, "Ver historial")}
</div>
<span style="font-size: 13px; color: {GRIS};">El responsable de montaje ve esta misma lista sin importes y con «Registrar montaje» como acción; el administrador, con «Verificar».</span>
</main>''' + nota("Montajes para el administrador: contratos y planogramas en una sola lista, por fecha de inicio, con el estado preciso y la acción que corresponde a cada uno.")
guardar("M1", "Montajes: la lista del administrador", 1280, 820, m1)

# ======================= 5 · EL TABLERO DIARIO =======================
def kpi3(t, v, s, c=TINTA, link=""):
    l = f'<a href="#" style="font-size: 12px; font-weight: 600;">{link}</a>' if link else ""
    return f'<div style="display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 14px; background: {BLANCO}; border: 1px solid {BORDE};"><span style="font-size: 13px; color: {GRIS};">{t}</span><b style="font-size: 22px; color: {c}; white-space: nowrap;">{v}</b><span style="font-size: 12.5px; color: #3D3D3A;">{s}</span>{l}</div>'
hoy_items = "".join(f'<div style="display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 0; border-top: 1px solid #F0EEE8;"><span style="display: flex; flex-direction: column; gap: 1px;"><b style="font-size: 14px;">{t}</b><span style="font-size: 12.5px; color: {GRIS};">{d}</span></span>{boton(a, h=32, extra="font-size: 13px;")}</div>' for t, d, a in [
    ("PUN-03: montaje no realizado", "Motivo: el proveedor no entregó el material", "Ver registro"),
    ("PUN-07: el contrato vence el 30/10/2026", "Galletas Sol · $ 600.000 /mes", "Renovar contrato"),
    ("GON-13: la reserva provisional caduca hoy", "Lácteos Andinos · 01/11/2026 – 31/01/2027", "Confirmar o cancelar")])
escalera = '<div style="display: flex; align-items: flex-end; gap: 3px; height: 92px; padding: 0 4px; border-bottom: 2px solid #C9C6BE;">' + "".join(f'<span style="flex: 1; height: {h}%; background: {VERDE}; opacity: .75; border-radius: 3px 3px 0 0;"></span>' for h in [18, 18, 18, 18, 22, 22, 22, 30, 30, 30, 30, 35, 35, 35, 48, 48, 48, 48, 55, 55, 62, 62, 62, 62, 70, 70, 70, 78, 78, 78]) + "</div>"
mont = "".join(f'<div style="display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid #F0EEE8; font-size: 14px;"><b style="font-size: 20px; width: 34px; color: {c};">{n}</b><span>{t}</span></div>' for n, t, c in [("3", "Sin montar (1 ya empezó)", TINTA), ("2", "Montados, sin verificar", AMBAR), ("1", "No realizado", ROJO)])
d1 = encabezado("Indicadores", pendientes=14) + barra_modulo("Indicadores", IMPORTES, "Sede CENTRO · lunes 26/10/2026") + f'''
<main style="display: grid; grid-template-columns: 380px minmax(0, 1fr); gap: 14px; padding: 14px 24px 16px; flex-grow: 1; min-height: 0;">
<div style="display: flex; flex-direction: column; gap: 14px; min-height: 0;">
{tarjeta(f'<div style="display: flex; align-items: baseline; gap: 8px;"><b style="font-size: 16px; flex-grow: 1;">Hoy</b><a href="#" style="font-size: 13px; font-weight: 600;">Ver los 14 pendientes</a></div><span style="font-size: 12.5px; color: {GRIS};">Pendientes con fecha límite hoy</span>{hoy_items}')}
{tarjeta(f'<b style="font-size: 16px;">Montajes</b>{mont}<a href="#" style="font-size: 13px; font-weight: 600;">Ir a Montajes</a>')}
</div>
<div style="display: flex; flex-direction: column; gap: 14px; min-width: 0;">
<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px;">
{kpi3("Canon mensual contratado", "$ 2.552.814 /mes", "+ $ 180.000 /mes respecto de septiembre 2026")}
{kpi3("Ocupación hoy", "86 %", "19 de 22 espacios contratables")}
{kpi3("Espacios disponibles hoy", "3 espacios", "sin facturar en octubre: $&nbsp;1.093.332 a tarifa", ROJO)}
{kpi3("Vencen en 30 días", "1 contrato", "PUN-07 · $ 600.000 /mes · 30/10/2026")}
</div>
{tarjeta(f'<div style="display: flex; align-items: baseline; gap: 10px;"><b style="font-size: 16px; flex-grow: 1;">Cuándo se libera cada espacio · próximos 90 días</b><span style="font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: {GRIS};">si arrancás el 01/12/2026 → 8 disponibles</span></div>{escalera}<div style="display: flex; justify-content: space-between; font-size: 11px; color: {GRIS};"><span>26/10/2026</span><span>noviembre</span><span>diciembre</span><span>enero 2027</span><span>24/01/2027</span></div><span style="font-size: 12.5px; color: {GRIS};">Altura: espacios disponibles cada día. Sirve para contestar «¿qué tenés libre desde tal fecha?».</span>')}
{tarjeta(f'<div style="display: flex; align-items: center; gap: 10px;"><b style="font-size: 16px; flex-grow: 1;">Disponibilidad hoy</b>{clave()}</div><div style="display: flex; flex-direction: column; gap: 14px; padding: 16px; border-radius: 12px; background: #F6F5F1;">{plano(marca=("PUN-03", "PUN-07", "GON-13"), fs=10, h1=40, h2=34)}</div>', "flex-grow: 1;")}
</div>
</main>''' + nota("El tablero diario del administrador: a la izquierda lo que hay que hacer hoy; a la derecha cómo está la sede (canon, ocupación, disponibilidad y cuándo se libera cada espacio).")
guardar("D1", "El tablero diario del administrador", 1280, 860, d1)

# --- D2 · qué información y por qué
INFO = [
 ("Pendientes con fecha límite hoy", "¿Qué tengo que resolver hoy?", "Cada día, al entrar", "Bandeja de Pendientes y tablero", "C"),
 ("Montajes: sin montar, sin verificar, no realizados", "¿Se está montando lo que se contrató?", "Cada día", "Montajes y tablero", "C"),
 ("Canon mensual contratado", "¿Cuánto factura la sede este mes?", "Cada día; comparar con el mes anterior", "Tablero", "E"),
 ("Ocupación hoy", "¿Qué parte de lo contratable está contratada?", "Cada día", "Tablero", "E"),
 ("Espacios disponibles y lo no facturado", "¿Cuánto se pierde por lo que está vacío?", "Cada día", "Tablero", "C"),
 ("Vencimientos en 30 días", "¿Qué hay que renovar o volver a contratar?", "Cada semana", "Tablero y Pendientes", "E"),
 ("Cuándo se libera cada espacio", "¿Qué puedo ofrecer y desde cuándo?", "Al negociar", "Tablero y Contratos", "E"),
 ("Línea de tiempo de la sede", "¿Cuánto dura cada contrato y dónde hay huecos?", "Al negociar", "Contratos", "N"),
 ("Canon bajo la tarifa", "¿Qué contratos se vendieron barato?", "Cada mes, antes de renovar", "Pendientes (inconsistencias)", "E"),
 ("Quién paga el canon", "¿De qué proveedores depende la sede?", "Cada mes", "Indicadores › pestaña", "E"),
 ("Participaciones de cara", "¿Cómo está repartida cada cara por porcentaje?", "Cada mes", "Indicadores › pestaña", "E"),
]
fila_i = lambda a, b, c, dd, k: f'<div style="display: grid; grid-template-columns: 1.4fr 1.6fr 1.1fr 1.2fr 100px; gap: 16px; padding: 12px 18px; border-top: 1px solid #ECEAE4; font-size: 14px; line-height: 1.45;"><b>{a}</b><span>{b}</span><span style="color: #3D3D3A;">{c}</span><span style="color: {GRIS};">{dd}</span>{chip_tag(k)}</div>'
d2 = f'''<div style="display: flex; flex-direction: column; gap: 16px; padding: 36px 40px;">
<div style="display: flex; flex-direction: column; gap: 6px;"><h1 style="margin: 0; font-size: 28px;">Qué tiene que ver el administrador, y para qué</h1><span style="font-size: 15px; color: {GRIS};">Cada dato del tablero contesta una pregunta concreta. Lo que no contesta ninguna pregunta del día a día no va en el tablero: queda en su pestaña.</span></div>
<div style="border-radius: 16px; background: {BLANCO}; border: 1px solid {BORDE}; overflow: hidden;"><div style="display: grid; grid-template-columns: 1.4fr 1.6fr 1.1fr 1.2fr 100px; gap: 16px; padding: 10px 18px; background: #F4F2EC; font-size: 11px; font-weight: 700; letter-spacing: .06em; color: {GRIS};"><span>INFORMACIÓN</span><span>PREGUNTA QUE CONTESTA</span><span>CADA CUÁNTO</span><span>DÓNDE</span><span>HOY</span></div>{"".join(fila_i(*x) for x in INFO)}</div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px;">
{tarjeta(f'<b style="font-size: 15px;">El trabajador ve otro tablero</b><span style="font-size: 14px; line-height: 1.5; color: #3D3D3A;">Sin importes: sus montajes de hoy, los espacios disponibles y lo que vence. Así es hoy y se mantiene.</span>')}
{tarjeta(f'<b style="font-size: 15px;">Al entrar cada día</b><span style="font-size: 14px; line-height: 1.5; color: #3D3D3A;">El administrador entra al tablero (Indicadores). Si hay pendientes con fecha límite hoy, se ven arriba a la izquierda, antes que cualquier cifra.</span>')}
</div>
</div>'''
guardar("D2", "Qué información ve el administrador", 1760, 980, d2)
print("flujos ok", ALTOS)
