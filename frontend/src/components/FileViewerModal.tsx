import { useEffect, useState } from "react";
import { X, Download, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import { fileUrl, fetchFileBlob, type SpaceFileMeta } from "../api/files";

// ─── File kind detection ─────────────────────────────────────────────────────

type FileKind = "pdf" | "excel" | "csv" | "image" | "other";

function kindOf(file: SpaceFileMeta): FileKind {
  const name = file.filename.toLowerCase();
  if (name.endsWith(".pdf") || file.content_type === "application/pdf") return "pdf";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "excel";
  if (name.endsWith(".csv")) return "csv";
  if (file.content_type.startsWith("image/")) return "image";
  return "other";
}

// ─── Minimal CSV parser (handles quoted cells, auto delimiter , / ;) ─────────

function parseCsv(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  const delim = semis > commas ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(cell); cell = "";
    } else if (c === "\n") {
      row.push(cell); rows.push(row);
      row = []; cell = "";
    } else if (c !== "\r") {
      cell += c;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ─── Tabular preview ─────────────────────────────────────────────────────────

const MAX_ROWS = 500;

function looksNumeric(v: unknown): boolean {
  if (typeof v === "number") return true;
  if (typeof v !== "string") return false;
  const t = v.trim();
  return t !== "" && /^-?[$\d.,\s%]+$/.test(t) && /\d/.test(t);
}

function DataTable({ rows, total }: { rows: unknown[][]; total: number }) {
  if (rows.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", fontSize: 12.5, color: "var(--ink-3)" }}>
        El archivo no contiene datos.
      </div>
    );
  }
  const [header, ...body] = rows;
  const truncated = total > body.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 11.5, minWidth: "100%" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
            <tr style={{ background: "var(--surface-2)" }}>
              {header.map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: "8px 12px", textAlign: "left",
                    fontSize: 10, fontWeight: 700,
                    color: "var(--ink-3)",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    borderBottom: "1px solid var(--line)",
                    borderRight: "1px solid var(--line-soft)",
                    whiteSpace: "nowrap",
                    background: "var(--surface-2)",
                  }}
                >
                  {String(h ?? "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, ri) => (
              <tr key={ri} style={{ borderBottom: "1px solid var(--line-soft)" }}>
                {header.map((_, ci) => {
                  const v = r[ci];
                  const num = looksNumeric(v);
                  return (
                    <td
                      key={ci}
                      style={{
                        padding: "6px 12px",
                        borderRight: "1px solid var(--line-soft)",
                        color: "var(--ink-2)",
                        textAlign: num ? "right" : "left",
                        fontFamily: num ? "var(--font-mono)" : "inherit",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {v === null || v === undefined ? "" : String(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncated && (
        <div
          style={{
            padding: "8px 14px", flexShrink: 0,
            fontSize: 11, color: "var(--ink-3)",
            background: "var(--surface-2)",
            borderTop: "1px solid var(--line)",
          }}
        >
          Mostrando {body.length} de {total} filas
        </div>
      )}
    </div>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

interface FileViewerModalProps {
  file: SpaceFileMeta;
  onClose: () => void;
}

export default function FileViewerModal({ file, onClose }: FileViewerModalProps) {
  const kind = kindOf(file);
  const [rows, setRows] = useState<unknown[][] | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(kind === "excel" || kind === "csv");
  const [error, setError] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  // Reset image state when the viewed file changes (modal instance may be reused)
  useEffect(() => {
    setImgLoading(true);
    setImgError(false);
  }, [file.id]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Load + parse tabular files
  useEffect(() => {
    if (kind !== "excel" && kind !== "csv") return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    setRows(null);

    const load = async () => {
      const blob = await fetchFileBlob(file.id);
      let all: unknown[][];
      if (kind === "excel") {
        const buf = await blob.arrayBuffer();
        const wb = XLSX.read(buf);
        const ws = wb.Sheets[wb.SheetNames[0]];
        all = ws
          ? (XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][])
          : [];
      } else {
        all = parseCsv(await blob.text());
      }
      if (cancelled) return;
      const bodyCount = Math.max(all.length - 1, 0);
      setTotalRows(bodyCount);
      setRows(all.slice(0, MAX_ROWS + 1)); // header + up to MAX_ROWS body rows
      setLoading(false);
    };

    load().catch(() => {
      if (!cancelled) {
        setError(true);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [file.id, kind]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "90vw", height: "88vh",
          background: "var(--surface)",
          borderRadius: "var(--r-xl)",
          boxShadow: "var(--shadow-lg)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px", flexShrink: 0,
            borderBottom: "1px solid var(--line)",
          }}
        >
          <FileText size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />
          <span
            style={{
              flex: 1, minWidth: 0,
              fontSize: 13, fontWeight: 600, color: "var(--ink-1)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
          >
            {file.filename}
          </span>
          <a
            href={fileUrl(file.id)}
            download={file.filename}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              height: 28, padding: "0 10px",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--line)",
              background: "var(--surface-2)",
              color: "var(--ink-2)",
              fontSize: 11.5, fontWeight: 500,
              textDecoration: "none", flexShrink: 0,
            }}
          >
            <Download size={12} /> Descargar
          </a>
          <button
            onClick={onClose}
            title="Cerrar"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: "var(--r-md)",
              background: "transparent", border: "none",
              color: "var(--ink-2)", cursor: "pointer", flexShrink: 0,
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, background: "var(--surface)" }}>
          {kind === "pdf" ? (
            <iframe
              src={fileUrl(file.id)}
              title={file.filename}
              style={{ width: "100%", height: "100%", border: "none", display: "block" }}
            />
          ) : kind === "image" ? (
            <div
              style={{
                height: "100%",
                display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden", position: "relative",
                // Dark checkerboard so transparent PNG/WebP areas stay readable
                backgroundColor: "#1b1c1f",
                backgroundImage:
                  "linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%)," +
                  "linear-gradient(-45deg, rgba(255,255,255,0.05) 25%, transparent 25%)," +
                  "linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.05) 75%)," +
                  "linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.05) 75%)",
                backgroundSize: "24px 24px",
                backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0",
              }}
            >
              {imgError ? (
                <span style={{ fontSize: 12.5, color: "var(--danger)" }}>
                  No se pudo cargar la imagen.
                </span>
              ) : (
                <>
                  {imgLoading && (
                    <span
                      style={{
                        position: "absolute", inset: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12.5, color: "rgba(255,255,255,0.55)",
                      }}
                    >
                      Cargando imagen…
                    </span>
                  )}
                  <img
                    key={file.id}
                    src={fileUrl(file.id)}
                    alt={file.filename}
                    onLoad={() => { setImgLoading(false); setImgError(false); }}
                    onError={() => { setImgLoading(false); setImgError(true); }}
                    style={{
                      maxWidth: "100%", maxHeight: "100%",
                      objectFit: "contain", display: "block",
                      opacity: imgLoading ? 0 : 1,
                      transition: "opacity 0.15s ease",
                    }}
                  />
                </>
              )}
            </div>
          ) : kind === "excel" || kind === "csv" ? (
            loading ? (
              <div style={{ padding: 40, textAlign: "center", fontSize: 12.5, color: "var(--ink-3)" }}>
                Cargando archivo…
              </div>
            ) : error ? (
              <div style={{ padding: 40, textAlign: "center", fontSize: 12.5, color: "var(--danger)" }}>
                No se pudo cargar el archivo.
              </div>
            ) : (
              <DataTable rows={rows ?? []} total={totalRows} />
            )
          ) : (
            <div
              style={{
                height: "100%", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 10,
                color: "var(--ink-3)", fontSize: 12.5,
              }}
            >
              <FileText size={32} strokeWidth={1.2} />
              Vista previa no disponible para este tipo de archivo.
              <a
                href={fileUrl(file.id)}
                download={file.filename}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}
              >
                Descargar archivo
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
