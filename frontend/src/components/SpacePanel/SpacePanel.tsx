import { useEffect, useState, type ReactNode } from "react";
import {
  X, MapPin, Package, Calendar, DollarSign, User,
  AlertCircle, PlusCircle, Tag, Building2, Clock,
} from "lucide-react";
import type { Space, SpaceStatus, Supplier, ZoneDef, ZoneType } from "../../types";
import {
  getSpaceBySvgId, createSpace, updateSpaceStatus,
  createLease, cancelLease, getSuppliers, createSupplier,
} from "../../api/spaces";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  svgId: string | null;
  zoneDef?: ZoneDef | null;
  onClose: () => void;
  onRefresh: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<SpaceStatus, string> = {
  free:        "Libre",
  occupied:    "Ocupado",
  reserved:    "Reservado",
  maintenance: "Mantenimiento",
};


// Display status (derived from lease dates)
type DisplayStatus = "disponible" | "vigente" | "por_vencer" | "vencido";

const DISPLAY_STATUS_STYLES: Record<DisplayStatus, string> = {
  disponible: "bg-emerald-950 text-emerald-400 border border-emerald-800",
  vigente:    "bg-blue-950 text-blue-400 border border-blue-800",
  por_vencer: "bg-amber-950 text-amber-400 border border-amber-800",
  vencido:    "bg-red-950 text-red-400 border border-red-800",
};

const DISPLAY_STATUS_LABELS: Record<DisplayStatus, string> = {
  disponible: "Disponible",
  vigente:    "Vigente",
  por_vencer: "Por vencer",
  vencido:    "Vencido",
};

// Nomenclature abbreviations per zone type
const TYPE_ABBR: Record<ZoneType, string> = {
  gondola:        "GND",
  punta_gondola:  "PG",
  robatope:       "RT",
  ristra:         "RIS",
  cross:          "CRO",
  metro_cuadrado: "M2",
  mueble:         "MUE",
  promo:          "PRO",
  refrigerator:   "REF",
  register:       "REG",
  specialty:      "ESP",
  infrastructure: "INF",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDisplayStatus(lease: Space["active_lease"]): DisplayStatus {
  if (!lease) return "disponible";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(lease.end_date);
  const diffMs = end.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / 86_400_000);
  if (diffDays < 0)  return "vencido";
  if (diffDays <= 30) return "por_vencer";
  return "vigente";
}

function getDaysLeft(endDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  return Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
}

function suggestCode(sede: string, type: ZoneType | string): string {
  const sedePart = sede.toUpperCase().replace(/\s+/g, "").slice(0, 8);
  const typePart = TYPE_ABBR[type as ZoneType] ?? type.toUpperCase().slice(0, 3);
  return sedePart ? `${sedePart}-${typePart}-001` : `${typePart}-001`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SpacePanel({ svgId, zoneDef, onClose, onRefresh }: Props) {
  const [space, setSpace]     = useState<Space | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [view, setView]       = useState<"detail" | "assign" | "new-supplier" | "register">("detail");
  const [error, setError]     = useState<string | null>(null);

  // Register form
  const [regForm, setRegForm] = useState({ name: "", code: "", zone: "", sede: "", area_m2: "" });

  // Lease form
  const [leaseForm, setLeaseForm] = useState({
    supplier_id: "", marca: "", start_date: "", end_date: "", monthly_rent: "", notes: "",
  });

  // New supplier form
  const [supplierForm, setSupplierForm] = useState({
    name: "", contact_name: "", phone: "", email: "",
  });

  // ── Auto-update code suggestion when sede changes in register form ──────────
  useEffect(() => {
    if (view !== "register") return;
    const type = zoneDef?.type ?? regForm.zone;
    if (regForm.sede) {
      setRegForm((f) => ({ ...f, code: suggestCode(f.sede, type) }));
    }
  }, [regForm.sede]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load space + suppliers on svgId change ──────────────────────────────────
  useEffect(() => {
    if (!svgId) { setSpace(null); return; }
    setLoading(true);
    setError(null);
    setView("detail");
    Promise.all([getSpaceBySvgId(svgId), getSuppliers()])
      .then(([s, sups]) => { setSpace(s); setSuppliers(sups); })
      .catch(() => {
        const type = zoneDef?.type ?? "";
        setRegForm({
          name:    zoneDef?.label ?? svgId,
          code:    suggestCode("", type),
          zone:    type,
          sede:    "",
          area_m2: "",
        });
        setView("register");
        getSuppliers().then(setSuppliers).catch(() => {});
      })
      .finally(() => setLoading(false));
  }, [svgId]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleRegister() {
    if (!svgId || !regForm.name || !regForm.code || !regForm.zone || !regForm.area_m2) return;
    setSaving(true);
    try {
      const s = await createSpace({
        svg_id:  svgId,
        code:    regForm.code,
        name:    regForm.name,
        zone:    regForm.zone,
        sede:    regForm.sede || undefined,
        area_m2: Number(regForm.area_m2),
      });
      setSpace(s);
      setView("detail");
      onRefresh();
    } catch {
      setError("No se pudo registrar el espacio. Verificá que el código no esté duplicado.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(status: SpaceStatus) {
    if (!space) return;
    const updated = await updateSpaceStatus(space.id, status);
    setSpace(updated);
    onRefresh();
  }

  async function handleAssign() {
    if (!space || !leaseForm.supplier_id) return;
    await createLease(space.id, {
      supplier_id:  Number(leaseForm.supplier_id),
      marca:        leaseForm.marca || undefined,
      start_date:   leaseForm.start_date,
      end_date:     leaseForm.end_date,
      monthly_rent: Number(leaseForm.monthly_rent),
      notes:        leaseForm.notes || undefined,
    });
    const updated = await getSpaceBySvgId(space.svg_id);
    setSpace(updated);
    setView("detail");
    onRefresh();
  }

  async function handleCancelLease() {
    if (!space?.active_lease) return;
    await cancelLease(space.id, space.active_lease.id);
    const updated = await getSpaceBySvgId(space.svg_id);
    setSpace(updated);
    onRefresh();
  }

  async function handleCreateSupplier() {
    const s = await createSupplier({ ...supplierForm, notes: null });
    setSuppliers((prev) => [...prev, s]);
    setLeaseForm((f) => ({ ...f, supplier_id: String(s.id) }));
    setView("assign");
  }

  if (!svgId) return null;

  // Derived display status
  const displayStatus  = space ? getDisplayStatus(space.active_lease) : null;
  const daysLeft       = space?.active_lease ? getDaysLeft(space.active_lease.end_date) : null;

  // ── Render ──────────────────────────────────────────────────────────────────

  // Determine border color for the panel based on display status
  const panelBorderColor =
    displayStatus === "disponible" ? "#22c55e" :
    displayStatus === "vigente"    ? "#3b82f6" :
    displayStatus === "por_vencer" ? "#f59e0b" :
    displayStatus === "vencido"    ? "#ef4444" :
    "#e2e8f0";

  return (
    <div
      className="flex h-full flex-col border-l border-slate-200 bg-white shadow-lg"
      style={{
        width: "clamp(260px, 28vw, 320px)",
        borderLeftWidth: "4px",
        borderLeftColor: space ? panelBorderColor : "#e2e8f0",
        flexShrink: 0,
      }}
    >

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-800">
            {loading ? "Cargando..." : (space?.name ?? (regForm.name || "Nuevo espacio"))}
          </h2>
          <div className="flex items-center gap-2 mt-0.5">
            {space?.code && (
              <span className="text-[10px] font-mono text-slate-400">{space.code}</span>
            )}
            {svgId && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-mono text-slate-400">{svgId}</span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="ml-2 shrink-0 rounded p-1 hover:bg-slate-100">
          <X size={16} />
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-1 items-center justify-center text-slate-400 text-sm">
          Cargando...
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertCircle size={32} className="text-red-400" />
          <p className="text-sm text-slate-600">{error}</p>
        </div>
      )}

      {/* ── Register form ──────────────────────────────────────────────────── */}
      {!loading && !error && view === "register" && (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>Este espacio aún no está registrado. Completá los datos para habilitarlo.</span>
          </div>

          <Field label="Nombre del espacio *" type="text" value={regForm.name}
            onChange={(v) => setRegForm((f) => ({ ...f, name: v }))} />

          <Field label="Sede *" type="text" value={regForm.sede}
            onChange={(v) => setRegForm((f) => ({ ...f, sede: v }))}
            placeholder="ej: TERRON, VDM, CJ" />

          <div>
            <Field label="Código único *" type="text" value={regForm.code}
              onChange={(v) => setRegForm((f) => ({ ...f, code: v }))} />
            <p className="mt-0.5 text-[10px] text-slate-400">
              Formato sugerido: SEDE-TIPO-NRO · ej: TERRON-PG-001
            </p>
          </div>

          <Field label="Tipo / Categoría *" type="text" value={regForm.zone}
            onChange={(v) => setRegForm((f) => ({ ...f, zone: v }))} />

          <Field label="Área (m²) *" type="number" value={regForm.area_m2}
            onChange={(v) => setRegForm((f) => ({ ...f, area_m2: v }))} />

          <button
            onClick={handleRegister}
            disabled={saving || !regForm.name || !regForm.code || !regForm.zone || !regForm.area_m2}
            className="mt-1 flex items-center justify-center gap-2 rounded-md bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <PlusCircle size={15} />
            {saving ? "Registrando..." : "Registrar espacio"}
          </button>
        </div>
      )}

      {/* ── Detail view ────────────────────────────────────────────────────── */}
      {!loading && space && view === "detail" && (
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">

          {/* Display status badge */}
          {displayStatus && (
            <span className={`self-start flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${DISPLAY_STATUS_STYLES[displayStatus]}`}>
              {displayStatus === "por_vencer" && (
                <span className="animate-pulse inline-block w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
              )}
              {DISPLAY_STATUS_LABELS[displayStatus]}
              {daysLeft !== null && daysLeft >= 0 && (
                <span className="ml-1 opacity-70">· {daysLeft}d</span>
              )}
            </span>
          )}

          {/* Progress bar de contrato */}
          {space.active_lease && daysLeft !== null && (() => {
            const start     = new Date(space.active_lease.start_date).getTime();
            const end       = new Date(space.active_lease.end_date).getTime();
            const now       = Date.now();
            const total     = end - start;
            const pct       = total > 0 ? Math.min(100, Math.max(0, ((now - start) / total) * 100)) : 0;
            const barColor  = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-emerald-500";
            const textColor = pct > 90 ? "text-red-400" : pct > 70 ? "text-amber-400" : "text-emerald-400";
            return (
              <div>
                <div className="h-1.5 rounded-full bg-slate-200">
                  <div className={`rounded-full h-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
                <p className={`mt-1 text-[10px] ${textColor}`}>{daysLeft >= 0 ? `${daysLeft} días restantes` : `Vencido hace ${Math.abs(daysLeft)} días`}</p>
              </div>
            );
          })()}

          {/* Info rows */}
          <div className="space-y-2 text-sm text-slate-700">
            <Row icon={<MapPin size={14} />}    label="Zona"  value={space.zone} />
            {space.sede && <Row icon={<Building2 size={14} />} label="Sede" value={space.sede} />}
            <Row icon={<Package size={14} />}   label="Área"  value={`${space.area_m2} m²`} />
            <Row icon={<AlertCircle size={14} />} label="Código" value={space.code} />
          </div>

          {/* Active lease */}
          {space.active_lease && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="mb-2 font-semibold text-slate-800">Contrato activo</p>
              <div className="space-y-1.5 text-slate-700">
                <Row icon={<User size={13} />}       label="Proveedor" value={space.active_lease.supplier.name} />
                {space.active_lease.marca && (
                  <Row icon={<Tag size={13} />}      label="Marca"     value={space.active_lease.marca} />
                )}
                <Row icon={<Calendar size={13} />}   label="Inicio"    value={space.active_lease.start_date} />
                <Row icon={<Calendar size={13} />}   label="Fin"       value={space.active_lease.end_date} />
                {daysLeft !== null && (
                  <Row
                    icon={<Clock size={13} />}
                    label="Días restantes"
                    value={daysLeft >= 0 ? `${daysLeft} días` : `Vencido hace ${Math.abs(daysLeft)} días`}
                  />
                )}
                <Row icon={<DollarSign size={13} />} label="Valor negociado"
                  value={`$${space.active_lease.monthly_rent.toLocaleString()}`} />
              </div>
              <button
                onClick={handleCancelLease}
                className="mt-3 w-full rounded-md border border-red-300 bg-red-50 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                Cancelar contrato
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            {space.status !== "occupied" && (
              <button
                onClick={() => setView("assign")}
                className="w-full rounded-md bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Asignar proveedor
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              {(["free", "reserved", "maintenance"] as SpaceStatus[])
                .filter((s) => s !== space.status)
                .map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className="rounded-md border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Marcar {STATUS_LABELS[s].toLowerCase()}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Assign form ────────────────────────────────────────────────────── */}
      {!loading && space && view === "assign" && (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <p className="text-sm font-semibold text-slate-800">Nuevo contrato</p>

          {/* Proveedor */}
          <label className="text-xs text-slate-600">
            Proveedor *
            <select
              value={leaseForm.supplier_id}
              onChange={(e) => setLeaseForm((f) => ({ ...f, supplier_id: e.target.value }))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">Seleccionar...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <button
            onClick={() => setView("new-supplier")}
            className="self-start text-xs text-indigo-600 underline"
          >
            + Crear proveedor nuevo
          </button>

          <Field label="Marca / Categoría" type="text" value={leaseForm.marca}
            onChange={(v) => setLeaseForm((f) => ({ ...f, marca: v }))}
            placeholder="ej: PAPAS PEPSICO" />

          <Field label="Fecha inicio *" type="date" value={leaseForm.start_date}
            onChange={(v) => setLeaseForm((f) => ({ ...f, start_date: v }))} />
          <Field label="Fecha fin *" type="date" value={leaseForm.end_date}
            onChange={(v) => setLeaseForm((f) => ({ ...f, end_date: v }))} />
          <Field label="Valor negociado ($) *" type="number" value={leaseForm.monthly_rent}
            onChange={(v) => setLeaseForm((f) => ({ ...f, monthly_rent: v }))} />
          <Field label="Observaciones" type="text" value={leaseForm.notes}
            onChange={(v) => setLeaseForm((f) => ({ ...f, notes: v }))} />

          <div className="flex gap-2 pt-1">
            <button onClick={() => setView("detail")}
              className="flex-1 rounded-md border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50">
              Cancelar
            </button>
            <button
              onClick={handleAssign}
              disabled={!leaseForm.supplier_id || !leaseForm.start_date || !leaseForm.end_date || !leaseForm.monthly_rent}
              className="flex-1 rounded-md bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </div>
      )}

      {/* ── New supplier form ───────────────────────────────────────────────── */}
      {view === "new-supplier" && (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <p className="text-sm font-semibold text-slate-800">Nuevo proveedor</p>
          <Field label="Nombre *" type="text" value={supplierForm.name}
            onChange={(v) => setSupplierForm((f) => ({ ...f, name: v }))} />
          <Field label="Contacto" type="text" value={supplierForm.contact_name}
            onChange={(v) => setSupplierForm((f) => ({ ...f, contact_name: v }))} />
          <Field label="Teléfono" type="text" value={supplierForm.phone}
            onChange={(v) => setSupplierForm((f) => ({ ...f, phone: v }))} />
          <Field label="Email" type="email" value={supplierForm.email}
            onChange={(v) => setSupplierForm((f) => ({ ...f, email: v }))} />
          <div className="flex gap-2 pt-1">
            <button onClick={() => setView("assign")}
              className="flex-1 rounded-md border border-slate-200 py-2 text-sm text-slate-600">
              Cancelar
            </button>
            <button
              onClick={handleCreateSupplier}
              disabled={!supplierForm.name}
              className="flex-1 rounded-md bg-indigo-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Crear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
      <span className="shrink-0 text-slate-500">{label}:</span>
      <span className="font-medium break-all">{value}</span>
    </div>
  );
}

function Field({
  label, type, value, onChange, placeholder,
}: {
  label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <label className="text-xs text-slate-600">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-400 placeholder:text-slate-300"
      />
    </label>
  );
}
