import { useState, useEffect } from "react";
import { Trash2, Copy, Download, Scissors, Save, BookOpen, Settings2, CheckCircle2 } from "lucide-react";
import type { ZoneDef } from "../../types";
import { IMG_W, IMG_H } from "./zones";

// ─── Furniture library presets ────────────────────────────────────────────────

type LibraryItem = {
  id: string;
  label: string;
  icon: string;
  type: ZoneDef["type"];
  width: number;
  height: number;
};

const LIBRARY: Array<{ category: string; items: LibraryItem[] }> = [
  {
    category: "Góndolas",
    items: [
      { id: "lib-gondola-std",   label: "Cuerpo de góndola",   icon: "🛒", type: "gondola",       width: 85,  height: 22 },
      { id: "lib-gondola-long",  label: "Góndola larga",        icon: "🛒", type: "gondola",       width: 135, height: 22 },
      { id: "lib-gondola-wide",  label: "Góndola doble faz",    icon: "🛒", type: "gondola",       width: 85,  height: 40 },
    ],
  },
  {
    category: "Espacios alquilables",
    items: [
      { id: "lib-punta",         label: "Punta de góndola",     icon: "📦", type: "punta_gondola", width: 42,  height: 22 },
      { id: "lib-robatope",      label: "Robatope",             icon: "🪧", type: "robatope",      width: 30,  height: 30 },
      { id: "lib-ristra",        label: "Ristra",               icon: "🏷️", type: "ristra",        width: 12,  height: 22 },
      { id: "lib-cross",         label: "Cross",                icon: "✚",  type: "cross",         width: 42,  height: 14 },
      { id: "lib-m2",            label: "Metro cuadrado",       icon: "📐", type: "metro_cuadrado", width: 50, height: 50 },
      { id: "lib-mueble",        label: "Mueble / Exhibidor",   icon: "🪑", type: "mueble",        width: 40,  height: 40 },
    ],
  },
  {
    category: "Refrigeración",
    items: [
      { id: "lib-fridge-std",    label: "Heladera",             icon: "🧊", type: "refrigerator",  width: 65,  height: 18 },
      { id: "lib-fridge-long",   label: "Mural frío",           icon: "🧊", type: "refrigerator",  width: 130, height: 18 },
      { id: "lib-freezer",       label: "Freezer",              icon: "❄️", type: "refrigerator",  width: 50,  height: 50 },
    ],
  },
  {
    category: "Promocional",
    items: [
      { id: "lib-display-promo", label: "Display promo",        icon: "🏷️", type: "promo",         width: 36,  height: 36 },
      { id: "lib-isla-promo",    label: "Isla central",         icon: "🛍️", type: "promo",         width: 70,  height: 60 },
      { id: "lib-degustacion",   label: "Degustación",          icon: "🍽️", type: "specialty",     width: 32,  height: 32 },
    ],
  },
  {
    category: "Especiales",
    items: [
      { id: "lib-carniceria",    label: "Carnicería",           icon: "🥩", type: "specialty",     width: 80,  height: 50 },
      { id: "lib-panaderia",     label: "Panadería",            icon: "🥖", type: "specialty",     width: 80,  height: 42 },
      { id: "lib-fiambres",      label: "Fiambrería",           icon: "🧀", type: "specialty",     width: 65,  height: 42 },
      { id: "lib-verduleria",    label: "Verdulería",           icon: "🥦", type: "specialty",     width: 80,  height: 55 },
    ],
  },
  {
    category: "Cajas y Servicio",
    items: [
      { id: "lib-caja",          label: "Caja registradora",    icon: "💳", type: "register",      width: 26,  height: 32 },
      { id: "lib-caja-auto",     label: "Caja automática",      icon: "🤖", type: "register",      width: 28,  height: 36 },
      { id: "lib-info",          label: "Información",          icon: "ℹ️", type: "specialty",     width: 40,  height: 30 },
    ],
  },
];

// ─── Numeric input ────────────────────────────────────────────────────────────

function NumInput({ label, value, onChange, min = 0, max }: {
  label: string; value: number; onChange: (n: number) => void; min?: number; max?: number;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);

  function commit(raw: string) {
    const n = parseInt(raw, 10);
    if (!isNaN(n)) {
      const clamped = max !== undefined ? Math.min(max, Math.max(min, n)) : Math.max(min, n);
      onChange(clamped);
      setLocal(String(clamped));
    } else {
      setLocal(String(value));
    }
  }

  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-ink-4">{label}</span>
      <input
        type="number"
        className="w-full rounded border border-line bg-surface px-2 py-1 text-xs font-mono text-ink-1 focus:outline-none focus:ring-1 focus:ring-accent"
        value={local} min={min} max={max}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
      />
    </label>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  zone: ZoneDef | null;
  zones: ZoneDef[];
  clipboard: ZoneDef | null;
  onUpdate: (updated: ZoneDef) => void;
  onDelete: (id: string) => void;
  onDuplicate: (zone: ZoneDef) => void;
  onExport: () => void;
  onSave: () => void;
  savedAt: Date | null;
  onAddZone: (zone: ZoneDef) => void;
  onSplitChange: (vCuts: number, hCuts: number) => void;
  onSplitApply: (zone: ZoneDef, vCuts: number, hCuts: number) => void;
}

// ─── ZoneEditorPanel ──────────────────────────────────────────────────────────

export default function ZoneEditorPanel({
  zone, zones, clipboard,
  onUpdate, onDelete, onDuplicate,
  onExport, onSave, savedAt, onAddZone,
  onSplitChange, onSplitApply,
}: Props) {
  const [vCuts, setVCuts] = useState(0);
  const [hCuts, setHCuts] = useState(0);
  const [activeTab, setActiveTab] = useState<"editor" | "library">("library");

  // Reset split when zone changes
  useEffect(() => {
    setVCuts(0);
    setHCuts(0);
    onSplitChange(0, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone?.id]);

  // Auto-switch to editor tab when a zone is selected
  useEffect(() => {
    if (zone) setActiveTab("editor");
  }, [zone?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSplitChange(v: number, h: number) {
    setVCuts(v);
    setHCuts(h);
    onSplitChange(v, h);
  }

  function addFromLibrary(item: LibraryItem) {
    const offset = zones.length % 8;
    const newZone: ZoneDef = {
      id: `${item.id}-${Date.now()}`,
      label: item.label,
      type: item.type,
      x: Math.min(IMG_W - item.width,  460 + offset * 18),
      y: Math.min(IMG_H - item.height, 340 + offset * 14),
      width:  item.width,
      height: item.height,
      selectable: true,
    };
    onAddZone(newZone);
  }

  function patch<K extends keyof ZoneDef>(key: K, val: ZoneDef[K]) {
    onUpdate({ ...zone!, [key]: val } as ZoneDef);
  }

  // ── Shared bottom actions ──────────────────────────────────────────────────

  const SaveBar = () => (
    <div className="mt-auto space-y-2 pt-2">
      <button
        onClick={onSave}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-libre-100 bg-libre-50 px-3 py-2 text-xs font-semibold text-libre-txt hover:bg-libre-100 transition-colors"
      >
        <Save size={13} />
        Guardar cambios
      </button>
      {savedAt && (
        <p className="flex items-center justify-center gap-1 text-[10px] text-libre-txt">
          <CheckCircle2 size={10} />
          Guardado {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
      <button
        onClick={onExport}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-3 hover:bg-surface-2 transition-colors"
      >
        <Download size={12} />
        Export zones.ts
      </button>
    </div>
  );

  // ── Tab switcher ──────────────────────────────────────────────────────────

  const tabBtn = (tab: "editor" | "library", icon: React.ReactNode, label: string) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex flex-1 items-center justify-center gap-1 rounded py-1 text-[10px] font-medium transition-colors ${
        activeTab === tab
          ? "bg-accent text-accent-ink"
          : "text-ink-3 hover:bg-surface-3"
      }`}
    >
      {icon}{label}
    </button>
  );

  // ── Library tab ───────────────────────────────────────────────────────────

  if (activeTab === "library") {
    return (
      <aside className="flex w-64 flex-col gap-0 border-l border-line bg-surface overflow-hidden">
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-line-soft bg-surface-2 p-1.5 flex-shrink-0">
          {tabBtn("library", <BookOpen size={10} />, "Biblioteca")}
          {tabBtn("editor",  <Settings2 size={10} />, "Editor")}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {LIBRARY.map((group) => (
            <div key={group.category}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-4">
                {group.category}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addFromLibrary(item)}
                    className="flex flex-col items-center gap-1 rounded-lg border border-line bg-surface-2 px-2 py-2 text-center hover:border-accent-200 hover:bg-accent-50 transition-colors"
                    title={`${item.width}×${item.height}px · ${item.type}`}
                  >
                    <span className="text-lg leading-none">{item.icon}</span>
                    <span className="text-[10px] font-medium leading-tight text-ink-1">{item.label}</span>
                    <span className="text-[9px] text-ink-4">{item.width}×{item.height}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-line-soft p-3">
          <SaveBar />
        </div>
      </aside>
    );
  }

  // ── Editor tab (no zone selected) ─────────────────────────────────────────

  if (!zone) {
    return (
      <aside className="flex w-64 flex-col border-l border-line bg-surface overflow-hidden">
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-line-soft bg-surface-2 p-1.5 flex-shrink-0">
          {tabBtn("library", <BookOpen size={10} />, "Biblioteca")}
          {tabBtn("editor",  <Settings2 size={10} />, "Editor")}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="mt-4 text-center text-xs text-ink-4 leading-relaxed">
            Clic en una zona para seleccionarla.<br />
            Arrastrá para mover.<br />
            Handle para redimensionar.<br />
            Dibujá en el fondo para crear.
          </div>

          {/* Keyboard shortcuts */}
          <div className="rounded-lg border border-line-soft bg-surface-2 p-3 space-y-1">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-3">Shortcuts</p>
            {[
              ["Ctrl+C", "Copiar zona"],
              ["Ctrl+V", "Pegar zona"],
              ["Ctrl+D", "Duplicar"],
              ["Delete", "Eliminar"],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-mono text-ink-2">{key}</kbd>
                <span className="text-[10px] text-ink-4">{label}</span>
              </div>
            ))}
          </div>

          {clipboard && (
            <div className="rounded-lg border border-line bg-accent-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">En clipboard</p>
              <p className="mt-0.5 truncate text-xs font-mono text-accent">{clipboard.id}</p>
            </div>
          )}

          <p className="text-center text-[10px] text-ink-4">{zones.length} zonas en total</p>
        </div>

        <div className="border-t border-line-soft p-3">
          <SaveBar />
        </div>
      </aside>
    );
  }

  // ── Editor tab (zone selected) ────────────────────────────────────────────

  const maxW = IMG_W - zone.x;
  const maxH = IMG_H - zone.y;

  return (
    <aside className="flex w-64 flex-col border-l border-line bg-surface overflow-hidden">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-line-soft bg-surface-2 p-1.5 flex-shrink-0">
        {tabBtn("library", <BookOpen size={10} />, "Biblioteca")}
        {tabBtn("editor",  <Settings2 size={10} />, "Editor")}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">Zone Editor</span>
          <span className="rounded bg-accent-50 px-1.5 py-0.5 text-[10px] font-mono text-accent">{zone.id}</span>
        </div>

        {/* Label */}
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-ink-4">Label</span>
          <input
            className="w-full rounded border border-line bg-surface px-2 py-1 text-xs text-ink-1 focus:outline-none focus:ring-1 focus:ring-accent"
            value={zone.label}
            onChange={(e) => patch("label", e.target.value)}
          />
        </label>

        {/* Type */}
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-ink-4">Type</span>
          <select
            className="w-full rounded border border-line bg-surface px-2 py-1 text-xs text-ink-1 focus:outline-none focus:ring-1 focus:ring-accent"
            value={zone.type}
            onChange={(e) => patch("type", e.target.value as ZoneDef["type"])}
          >
            <option value="gondola">gondola</option>
            <option value="promo">promo</option>
            <option value="refrigerator">refrigerator</option>
            <option value="specialty">specialty</option>
            <option value="register">register</option>
            <option value="infrastructure">infrastructure</option>
          </select>
        </label>

        {/* Geometry */}
        <div className="rounded-lg border border-line-soft bg-surface-2 p-3 space-y-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-ink-4">Position & Size</span>
          <div className="grid grid-cols-2 gap-2">
            <NumInput label="X" value={zone.x} max={IMG_W - zone.width}  onChange={(v) => patch("x", v)} />
            <NumInput label="Y" value={zone.y} max={IMG_H - zone.height} onChange={(v) => patch("y", v)} />
            <NumInput label="Width"  value={zone.width}  min={12} max={maxW} onChange={(v) => patch("width", v)} />
            <NumInput label="Height" value={zone.height} min={12} max={maxH} onChange={(v) => patch("height", v)} />
          </div>
        </div>

        {/* Zone count */}
        <p className="text-center text-[10px] text-ink-4">
          {zones.indexOf(zone) + 1} / {zones.length} zonas
        </p>

        {/* Split */}
        <div className="rounded-lg border border-entra-100 bg-entra-50 p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Scissors size={11} className="text-entra-txt" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-entra-txt">Dividir zona</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-ink-3">Cortes verticales</span>
              <input type="number" min={0} max={20} value={vCuts}
                onChange={(e) => handleSplitChange(Math.max(0, parseInt(e.target.value) || 0), hCuts)}
                className="w-full rounded border border-entra-100 bg-surface px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-entra" />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-ink-3">Cortes horiz.</span>
              <input type="number" min={0} max={20} value={hCuts}
                onChange={(e) => handleSplitChange(vCuts, Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full rounded border border-entra-100 bg-surface px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-entra" />
            </label>
          </div>
          {(vCuts > 0 || hCuts > 0) && (
            <p className="text-[10px] text-entra-txt">
              → {vCuts + 1} col × {hCuts + 1} fil = <strong>{(vCuts + 1) * (hCuts + 1)} zonas</strong>
            </p>
          )}
          <button
            disabled={vCuts === 0 && hCuts === 0}
            onClick={() => onSplitApply(zone, vCuts, hCuts)}
            className="flex w-full items-center justify-center gap-1.5 rounded border border-entra-100 bg-entra-50 px-2 py-1.5 text-xs font-medium text-entra-txt hover:bg-entra-100 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
          >
            <Scissors size={11} /> Aplicar cortes
          </button>
        </div>

        {/* Duplicate / Delete */}
        <div className="flex gap-2">
          <button
            onClick={() => onDuplicate(zone)}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-line px-2 py-1.5 text-xs text-ink-2 hover:bg-surface-2 transition-colors"
          >
            <Copy size={12} /> Duplicate
          </button>
          <button
            onClick={() => onDelete(zone.id)}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-ocupado-100 px-2 py-1.5 text-xs text-ocupado-txt hover:bg-ocupado-50 transition-colors"
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </div>

      <div className="border-t border-line-soft p-3">
        <SaveBar />
      </div>
    </aside>
  );
}
