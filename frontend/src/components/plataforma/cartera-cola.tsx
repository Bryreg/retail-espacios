/* ============================================================================
   RECABRA · Plataforma — la cola de llamadas (capítulo 1.3 de la cartera)

   Lo único OPERATIVO de la cartera, y la respuesta a la mitad de la pregunta
   con la que abre la pantalla: «¿a quién llamo primero?».

   Cada fila es una llamada, no un registro:

     puesto · quién es · la señal (palabra) · la razón en UNA línea ·
     la plata · la acción.

   Tres reglas que no son de estilo:

   1. **La regla de orden se escribe arriba de la lista.** Un orden que no se
      explica es magia, y con magia el operador no puede estar en desacuerdo.
      El otro orden —por plata— está a un clic, porque el número más grande
      casi nunca es la llamada más urgente y el dueño tiene derecho a esa
      lectura.
   2. **La señal es una palabra en tinta gris**, con el peso y el borde como
      jerarquía. Ni rojo ni ámbar: esos dos codifican estado de ESPACIO
      (`libre / se libera / ocupado`) y nada más. Un chip `FANTASMA` en rojo
      le enseña al ojo que rojo = malo, y dos renglones más abajo rojo =
      ocupado = plata entrando.
   3. **Un solo amarillo por pantalla**, y es el botón de la llamada #1. El
      resto de las filas llevan el mismo botón en tinta neutra.
   ========================================================================== */

import type { FilaCola, OrdenCola } from "./cartera-datos";
import { ESTADO_CUENTA_TXT, diasSinAcceso, fechaCorta, num, pct } from "./formato";

function Sub({ fila }: { fila: FilaCola }) {
  const m = fila.cliente.metricas;
  const a = fila.adopcion;
  const linea1 = m
    ? `${m.sedes_con_plano === 1 ? "1 sede" : `${m.sedes_con_plano} sedes`} · ${num(m.espacios_comercializables)} espacios · ${pct(m.ocupacion_pct)}`
    : "sin lectura este periodo";
  /* Los días Y la fecha: «130 días sin acceso» no dice cuándo fue la última
     vez, y la fecha sola obliga a hacer la resta. `ultimo_acceso: null` es
     «nunca entró nadie», que no es lo mismo que cero días — por eso no se
     escribe una fecha inventada en su lugar. */
  const linea2 =
    `cuenta ${ESTADO_CUENTA_TXT[fila.cliente.estado_cuenta] ?? fila.cliente.estado_cuenta}` +
    (a ? ` · ${diasSinAcceso(a.dias_sin_acceso)}` : "") +
    (m?.ultimo_acceso ? ` (últ. ${fechaCorta(m.ultimo_acceso.slice(0, 10))})` : "") +
    (a ? ` · alta ${a.cohorte ?? "sin fecha"}` : "");
  return (
    <>
      <div className="sub">{linea1}</div>
      <div className="sub">{linea2}</div>
    </>
  );
}

export function ColaLlamadas({
  filas,
  orden,
  onOrden,
  onAbrirSesion,
  onRevisarConexion,
}: {
  filas: FilaCola[];
  orden: OrdenCola;
  onOrden: (o: OrdenCola) => void;
  onAbrirSesion: (slug: string) => void;
  onRevisarConexion: (slug: string) => void;
}) {
  return (
    <>
      <div className="plat-regla">
        <span>
          Orden:{" "}
          <b>
            primero lo que no se puede ver, después la plata que se puede ir este mes, después la plata
            que no está entrando.
          </b>
        </span>
        <span className="plat-orden" role="group" aria-label="Orden de la cola de llamadas">
          <button type="button" aria-pressed={orden === "riesgo"} onClick={() => onOrden("riesgo")}>
            por riesgo
          </button>
          <button type="button" aria-pressed={orden === "plata"} onClick={() => onOrden("plata")}>
            por plata
          </button>
        </span>
      </div>

      {filas.length === 0 ? (
        <p className="plat-nota">No hay clientes en el registro para este periodo.</p>
      ) : (
        /* Las filas van en su propio contenedor y no sueltas junto a la regla
           de orden: `:first-of-type` cuenta hermanos del mismo tag, así que
           con la regla al lado la primera fila se quedaba sin su filete de
           arriba. */
        <div className="plat-cola">
        {filas.map((f, idx) => (
          <div key={f.slug} className={"plat-fila-cli" + (idx === 0 ? " top" : "")}>
            <div className="puesto">{idx + 1}</div>
            <div>
              <div className="nom">{f.nombre}</div>
              <Sub fila={f} />
            </div>
            <div>
              <span className={`plat-chip plat-chip--${f.enfasis}`}>{f.palabra}</span>
            </div>
            <div className="razon">{f.razon}</div>
            <div className="plata">
              {f.plata.texto}
              <small>{f.plata.sub}</small>
            </div>
            <div className="acc">
              <button
                type="button"
                className={"plat-btn mini" + (idx === 0 ? " btn-principal" : "")}
                onClick={() => (f.accion === "conexion" ? onRevisarConexion(f.slug) : onAbrirSesion(f.slug))}
                title={
                  f.accion === "conexion"
                    ? "La base de este cliente no se dejó leer: no hay sesión que abrir. Se revisa el estado de la cuenta en «Lo operativo»."
                    : `Abrir la sesión de asesoría de ${f.nombre}`
                }
              >
                {f.accion === "conexion" ? "Revisar la conexión" : "Abrir la sesión"}
              </button>
            </div>
          </div>
        ))}
        </div>
      )}
    </>
  );
}
