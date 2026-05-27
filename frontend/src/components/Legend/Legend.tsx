import { STATUS_COLORS_SOLID as STATUS_COLORS } from "../FloorMap/zones";

const LABELS: Record<string, string> = {
  free: "Libre",
  occupied: "Ocupado",
  reserved: "Reservado",
  maintenance: "Mantenimiento",
};

export default function Legend() {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(STATUS_COLORS).map(([status, color]) => (
        <div key={status}
          className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          {LABELS[status]}
        </div>
      ))}
      <div className="flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 shadow-sm">
        <span className="h-2 w-2 rounded-full bg-indigo-500 flex-shrink-0" />
        Seleccionado
      </div>
    </div>
  );
}
