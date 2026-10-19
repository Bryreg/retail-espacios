import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, FileText, Image as ImageIcon, MapPin, X } from "lucide-react";
import { describeError } from "../../api/client";
import type { MountConfirmation, MountMotivo } from "../../api/mounts";
import MiniMapa, { describirUbicacion } from "../MiniMapa/MiniMapa";
import { prepararFoto, MAX_SUBIDA } from "../../utils/foto";
import type { UnifiedFixture } from "../../types/fixtures";
import type { DibujoDeMontaje } from "../../api/montaje";
import MiZonaEnLaCara from "./MiZonaEnLaCara";

/**
 * La única pregunta del montaje: ¿lo montaste?
 *
 * Vive acá y no dentro de una pantalla porque hay DOS puertas al mismo acto —el
 * tablero, con sesión, y el enlace firmado que la mercaderista recibe por
 * correo— y las reglas de qué es un reporte válido tienen que ser una sola. Con
 * dos copias, la que se olvide de exigir la foto es justo la que usa quien
 * monta.
 *
 * Lo que cambia entre las dos puertas entra por props: a dónde se manda el
 * reporte, de dónde sale la planometría y si hay una lista a la que volver.
 */

/** El espacio que hay que montar, tal como lo muestra el formulario. */
export interface EspacioAMontar {
  /** `SEDE-CODIGO`: el mismo que viaja en el enlace del correo y el que se
   *  reporta. El nombre corto se repite entre sedes y no sirve de llave. */
  code: string;
  /** Lo que se le muestra a quien monta: `PUN-01`, no `NAVE-PUN-01`. */
  corto: string;
  /** El código del MUEBLE en el plano, sin el sufijo de cara. La cara B se
   *  reporta como `PUN-01-B` pero en el plano no hay dos muebles: hay uno con
   *  dos caras, y es ese el que hay que señalar. */
  fixtureCode: string;
  sede: string;
  label: string;
  marca: string;
  proveedor: string;
  desde: string;
  hasta: string;
  /** Vender por partes: qué parte del mueble es, dicho para quien la arma
   *  («Puerta 2 de 3, contando de izquierda a derecha mirando el frente»).
   *  Sin esto, el mueble o la cara entera. */
  parte?: string | null;
}

/** La planometría, ya resuelta a algo que un `<img>` puede abrir. */
export interface PlanoDelEspacio {
  url: string;
  tipo: string;
}

/** Lo que el formulario reporta. El espacio no va acá a propósito: por el
 *  enlace firmado lo pone el servidor desde el token, no el cliente. */
export interface DatosReporte {
  estado: "montado" | "no_montado";
  motivo?: MountMotivo;
  nota?: string;
  reportadoPor?: string;
  foto: File | null;
}

const MOTIVOS: { id: MountMotivo; label: string }[] = [
  { id: "sin_material", label: "El proveedor no entregó el material" },
  { id: "sin_producto", label: "No llegó el producto" },
  { id: "espacio_ocupado", label: "El espacio está ocupado por otra cosa" },
  { id: "otro", label: "Otro motivo" },
];

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fecha(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d} ${MESES[m - 1]}` : iso;
}


export default function FormularioMontaje({
  item, vecinos, plano, dibujo, donde: dondeDelServidor, quienReporta, onEnviar, onCancel, onSaved,
}: {
  item: EspacioAMontar;
  /** Todos los muebles de la sede: el plano necesita el contexto, no solo el destino. */
  vecinos: UnifiedFixture[];
  /** Cómo debe quedar armada la exhibición, si el proveedor la mandó.
   *
   *  Llega resuelta como URL y no como id: los dos caminos la sirven desde
   *  endpoints distintos —el tablero por contrato, el enlace firmado por su
   *  propio token— y el formulario no tiene por qué saber cuál de los dos lo
   *  está usando. */
  plano?: PlanoDelEspacio | null;
  /** Una participación de cara con la distribución confirmada: SU zona sobre
   *  la cara, ya filtrada por el servidor (fase 2 · G1). Sólo la pasa la
   *  pantalla del enlace (`pages/Montaje.tsx`); el tablero no, y sin esto la
   *  tarjeta no sale. */
  dibujo?: DibujoDeMontaje | null;
  /** La frase de ubicación del servidor. Sólo se usa si el plano no se puede
   *  dibujar: cuando sí, la calcula MiniMapa con la misma regla. */
  donde?: string | null;
  /** Quién reporta, cuando hay sesión con cuenta propia: el servidor guarda
   *  esa cuenta y no hace falta escribir el nombre (2026-10-02). Sin cuenta
   *  —el enlace del correo— se sigue pidiendo «Tu nombre». */
  quienReporta?: string | null;
  /** Quién guarda el reporte. El tablero manda el suyo con sesión; el enlace
   *  del correo, con su token. Las reglas de qué es un reporte válido son las
   *  mismas y viven acá; a dónde va, no. */
  onEnviar: (datos: DatosReporte) => Promise<MountConfirmation>;
  onCancel?: () => void;
  onSaved: (m: MountConfirmation) => void;
}) {
  const [foto, setFoto] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [quien, setQuien] = useState("");
  const [motivo, setMotivo] = useState<MountMotivo | null>(null);
  const [nota, setNota] = useState("");
  const [modo, setModo] = useState<"montado" | "no_montado" | null>(null);
  /** La foto se está achicando. Dura menos de un segundo, pero enviar en ese
   *  hueco subiría el archivo sin reducir. */
  const [preparando, setPreparando] = useState(false);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const enviandoRef = useRef(false);

  // El mueble puede no estar en el layout: un contrato guardado sobre un
  // espacio que después se borró del plano deja el reporte válido pero sin
  // dónde dibujarlo. Mejor omitir el mapa que mostrar uno que no señala nada.
  const tieneMapa = useMemo(
    () => vecinos.some((f) => f.code.toUpperCase() === item.fixtureCode.trim().toUpperCase()),
    [vecinos, item.fixtureCode],
  );
  // El mueble de la zona, para las guías de sus entrepaños (sólo geometría:
  // los vecinos llegan sin nada comercial). Sin él, el dibujo va sin guías.
  const muebleDeLaZona = useMemo(
    () => (dibujo ? vecinos.find((f) => f.code.toUpperCase() === item.fixtureCode.trim().toUpperCase()) ?? null : null),
    [dibujo, vecinos, item.fixtureCode],
  );
  const ubicacion = useMemo(
    () => (tieneMapa ? describirUbicacion(vecinos, item.fixtureCode) : null) ?? dondeDelServidor ?? null,
    [tieneMapa, vecinos, item.fixtureCode, dondeDelServidor],
  );
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (vista) URL.revokeObjectURL(vista); }, [vista]);

  async function elegirFoto(f: File | null) {
    if (vista) URL.revokeObjectURL(vista);
    if (!f) {
      setFoto(null);
      setVista(null);
      return;
    }
    // Se muestra la vista previa del archivo ORIGINAL: es instantánea y es lo
    // que la persona acaba de ver por la cámara. La reducción corre detrás.
    const vistaNueva = URL.createObjectURL(f);
    setVista(vistaNueva);
    setPreparando(true);
    setError("");
    try {
      const lista = await prepararFoto(f);
      if (lista.size > MAX_SUBIDA) {
        // Se limpia también la vista previa. Dejarla puesta mostraba la foto en
        // pantalla mientras la app insistía en que faltaba: parece un error de
        // la aplicación y no hay forma de darse cuenta de qué pasó.
        URL.revokeObjectURL(vistaNueva);
        setFoto(null);
        setVista(null);
        setError(
          "El teléfono no pudo achicar esta foto y pesa más de lo que el servidor acepta. " +
          "Tomala otra vez desde la app en vez de elegirla de la galería.",
        );
        return;
      }
      setFoto(lista);
    } finally {
      setPreparando(false);
    }
  }

  async function enviar() {
    if (!modo) return;
    // Ref y no estado: `enviando` es el MISMO valor de closure con el que se
    // calculó `disabled` en el render, así que dos toques seguidos antes del
    // siguiente render pasaban los dos, subían la foto dos veces por datos
    // móviles y creaban dos reportes del mismo montaje.
    if (enviandoRef.current) return;
    if (modo === "no_montado" && !motivo) {
      setError("Elegí el motivo para que quede claro a quién reclamarle.");
      return;
    }
    // El servidor también lo exige. Acá se repite para no gastarle al
    // mercaderista una subida y una espera para decirle que falta la foto.
    if (preparando) {
      setError("La foto se está preparando, un segundo.");
      return;
    }
    if (modo === "montado" && !foto) {
      setError("Falta la foto. Es la prueba de que la exhibición quedó armada.");
      return;
    }
    enviandoRef.current = true;
    setEnviando(true);
    setError("");
    try {
      const saved = await onEnviar({
        estado: modo,
        motivo: modo === "no_montado" ? motivo! : undefined,
        nota: nota.trim() || undefined,
        reportadoPor: quienReporta ? undefined : quien.trim() || undefined,
        foto,
      });
      onSaved(saved);
    } catch (e: any) {
      // Un tiempo agotado no trae `detail`, y "No se pudo completar la
      // operación" no le dice a nadie qué hacer. Acá sí: reintentar sirve,
      // y el formulario quedó lleno.
      const timeout = e?.code === "ECONNABORTED" || /timeout/i.test(e?.message ?? "");
      setError(
        timeout
          ? "La subida tardó demasiado. Buscá mejor señal y volvé a intentar: no se perdió nada."
          : describeError(e),
      );
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  const campo: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: "var(--r-md)",
    border: "1px solid var(--line)", background: "var(--surface-2)",
    color: "var(--ink-1)", fontSize: 15, fontFamily: "inherit", outline: "none",
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg)", padding: "12px 14px 44px" }}>
      {/* Sólo cuando hay a dónde volver. Por el enlace del correo se entra
          directo a este espacio: un "Volver" ahí no lleva a ninguna parte. */}
      {onCancel && (
        <button
          onClick={onCancel}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12,
            background: "none", border: "none", color: "var(--ink-2)",
            fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", padding: 0,
          }}
        >
          <ChevronLeft size={15} /> Volver
        </button>
      )}

      <div
        style={{
          padding: "14px", borderRadius: "var(--r-lg)", background: "var(--surface)",
          border: "1px solid var(--line)", marginBottom: 16,
        }}
      >
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-3)" }}>
          {item.sede} · {item.corto}
        </div>
        {/* Cuál puerta, contada desde dónde: con tres puertas iguales, es lo
            único que evita armar la exhibición en la equivocada. */}
        {item.parte && (
          <div data-parte-a-montar style={{ fontSize: 13.5, fontWeight: 700, color: "var(--accent-700)", marginTop: 4 }}>
            {item.parte}
          </div>
        )}
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, letterSpacing: "-0.02em" }}>
          {item.proveedor || "Sin proveedor"}
        </div>
        <div style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 2 }}>
          {item.marca && <>{item.marca} · </>}{item.label}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 6 }}>
          Del {fecha(item.desde)} al {fecha(item.hasta)}
        </div>
      </div>

      {/* Dónde queda. Va antes de la pregunta a propósito: primero se camina
          hasta el mueble, después se responde. El plano se dibuja con los
          muebles de la sede, y si el destino no aparece en el layout se omite
          entero en vez de mostrar un plano sin señalar nada. */}
      {/* Cómo debe quedar. Va ARRIBA del mapa y de la cámara: es lo que hay que
          mirar antes de armar, no después. */}
      {plano && (
        <a
          href={plano.url}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "block", textDecoration: "none", marginBottom: 16,
            padding: "12px 12px 10px", borderRadius: "var(--r-lg)",
            background: "var(--surface)", border: "1px solid var(--accent-200)",
          }}
        >
          <div
            style={{
              display: "flex", alignItems: "center", gap: 5, marginBottom: 8,
              fontSize: 11.5, fontWeight: 700, color: "var(--accent-700)",
              letterSpacing: "0.03em", textTransform: "uppercase",
            }}
          >
            <ImageIcon size={12} /> Así debe quedar
          </div>
          {plano.tipo === "application/pdf" ? (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 9, padding: "12px 11px",
                borderRadius: "var(--r-md)", background: "var(--accent-50)",
                color: "var(--accent-700)", fontSize: 13, fontWeight: 600,
              }}
            >
              <FileText size={17} />
              Abrir la planometría (PDF)
            </div>
          ) : (
            <img
              src={plano.url}
              alt="Cómo debe quedar la exhibición"
              style={{
                display: "block", width: "100%", maxHeight: 260, objectFit: "contain",
                borderRadius: "var(--r-md)", background: "var(--surface-2)",
              }}
            />
          )}
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 8, textAlign: "center" }}>
            Tocá para verla en grande
          </div>
        </a>
      )}

      {/* Tu zona en la cara (fase 2 · G1): entre «Así debe quedar» y «Dónde
          queda». Sólo la de quien monta, en gris lo demás; sin distribución
          confirmada no llega `dibujo` y no sale nada. */}
      {dibujo && <MiZonaEnLaCara dibujo={dibujo} mueble={muebleDeLaZona} />}

      {tieneMapa && (
        <div
          style={{
            padding: "12px 12px 10px", borderRadius: "var(--r-lg)",
            background: "var(--surface)", border: "1px solid var(--line)",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex", alignItems: "center", gap: 5, marginBottom: 8,
              fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)",
              letterSpacing: "0.03em", textTransform: "uppercase",
            }}
          >
            <MapPin size={12} /> Dónde queda
          </div>
          <MiniMapa fixtures={vecinos} targetCode={item.fixtureCode} />
          {ubicacion && (
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 8, textAlign: "center" }}>
              {ubicacion}
            </div>
          )}
        </div>
      )}

      {/* La pregunta, en botones grandes para el pulgar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {([
          { id: "montado" as const, label: "Lo monté", icon: <Check size={17} />, color: "var(--success)" },
          { id: "no_montado" as const, label: "No pude", icon: <X size={17} />, color: "var(--warning)" },
        ]).map((b) => (
          <button
            key={b.id}
            onClick={() => { setModo(b.id); setError(""); }}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              minHeight: 52, borderRadius: "var(--r-lg)",
              fontSize: 15.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
              border: `1.5px solid ${modo === b.id ? b.color : "var(--line)"}`,
              background: modo === b.id ? b.color : "var(--surface)",
              color: modo === b.id ? "#fff" : "var(--ink-2)",
            }}
          >
            {b.icon} {b.label}
          </button>
        ))}
      </div>

      {modo === "no_montado" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 7 }}>
            ¿Qué pasó?
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {MOTIVOS.map((m) => (
              <button
                key={m.id}
                onClick={() => { setMotivo(m.id); setError(""); }}
                style={{
                  textAlign: "left", padding: "11px 12px", borderRadius: "var(--r-md)",
                  fontSize: 14, fontFamily: "inherit", cursor: "pointer",
                  border: `1px solid ${motivo === m.id ? "var(--accent)" : "var(--line)"}`,
                  background: motivo === m.id ? "var(--accent-50)" : "var(--surface)",
                  color: motivo === m.id ? "var(--accent-700)" : "var(--ink-1)",
                  fontWeight: motivo === m.id ? 600 : 400,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {modo && (
        <>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 7 }}>
              Foto {modo === "montado" ? "del espacio armado" : "de cómo quedó"}
              <span style={{ fontWeight: 400, color: modo === "montado" ? "var(--accent-700)" : "var(--ink-3)" }}>
                {modo === "montado" ? " · obligatoria" : " · opcional"}
              </span>
            </div>
            {/* Dos entradas separadas a propósito. `capture` manda a la
                cámara de una, que es el camino rápido; pero en Android saca la
                opción de galería, y con la foto obligatoria eso deja atrapado
                a quien ya la tomó antes — por ejemplo cuando montó sin señal y
                volvió a reportar más tarde. */}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => elegirFoto(e.target.files?.[0] ?? null)}
            />
            <input
              ref={galeriaRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => elegirFoto(e.target.files?.[0] ?? null)}
            />
            {vista ? (
              <div style={{ position: "relative" }}>
                <img
                  src={vista}
                  alt="Foto del montaje"
                  style={{
                    width: "100%", maxHeight: 260, objectFit: "cover",
                    borderRadius: "var(--r-lg)", border: "1px solid var(--line)", display: "block",
                  }}
                />
                <button
                  onClick={() => elegirFoto(null)}
                  aria-label="Quitar foto"
                  style={{
                    position: "absolute", top: 8, right: 8,
                    width: 30, height: 30, borderRadius: 99,
                    background: "rgba(20,19,15,.7)", border: "none",
                    color: "#fff", cursor: "pointer",
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => inputRef.current?.click()}
                style={{
                  width: "100%", minHeight: 92, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 6,
                  borderRadius: "var(--r-lg)",
                  border: `1.5px dashed ${modo === "montado" ? "var(--accent-200)" : "var(--line-strong)"}`,
                  background: modo === "montado" ? "var(--accent-50)" : "var(--surface-2)",
                  color: modo === "montado" ? "var(--accent-700)" : "var(--ink-2)",
                  fontSize: 14, fontFamily: "inherit", cursor: "pointer",
                }}
              >
                <Camera size={22} />
                {preparando ? "Preparando…" : "Tomar foto"}
              </button>
            )}
            <button
              onClick={() => galeriaRef.current?.click()}
              style={{
                width: "100%", marginTop: 8, padding: "9px 0",
                background: "none", border: "none", color: "var(--ink-3)",
                fontSize: 13, fontFamily: "inherit", cursor: "pointer",
              }}
            >
              {vista ? "Cambiar por otra de la galería" : "o elegir una de la galería"}
            </button>
          </div>

          {quienReporta ? (
            <div style={{ marginBottom: 12, fontSize: 12.5, color: "var(--ink-3)" }}>
              Reporta <span style={{ fontWeight: 600, color: "var(--ink-2)" }}>{quienReporta}</span>
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
                Tu nombre
              </div>
              <input
                type="text"
                value={quien}
                onChange={(e) => setQuien(e.target.value)}
                placeholder="Quién reporta"
                style={campo}
              />
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
              Nota <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>· opcional</span>
            </div>
            <textarea
              rows={2}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Algo que haya que saber"
              style={{ ...campo, resize: "none" }}
            />
          </div>

          {error && (
            <div style={{ marginBottom: 10, fontSize: 13, color: "var(--danger)" }}>{error}</div>
          )}

          {/* EL botón principal de la pantalla de montaje. «Lo monté» / «No
              pude» de más arriba NO son la acción: son una elección, y siguen
              en tinta con el color del estado en el ícono. La acción que
              cierra el trabajo es ésta. */}
          <button
            className="btn-principal"
            onClick={enviar}
            disabled={enviando}
            style={{
              width: "100%", minHeight: 50, borderRadius: "var(--r-lg)",
              fontSize: 16, fontFamily: "inherit",
            }}
          >
            {enviando ? "Enviando…" : "Confirmar"}
          </button>
          <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--ink-3)", textAlign: "center" }}>
            La fecha y la hora las pone el sistema al recibir el reporte.
          </p>
        </>
      )}
    </div>
  );
}
