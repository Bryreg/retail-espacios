// Marcador: lo reemplaza el paso 6b
export default function PanelDeDistribucion(props: { fixtureId: string; sede: string; onEncuadrarCara: (cara: "A" | "B") => void }) {
  return (
    <div data-distribucion className="w-80 flex-shrink-0 border-l border-dark-line bg-dark-surface p-3 text-xs text-dark-ink-2">
      Distribución de {props.fixtureId} ({props.sede}): el panel llega en el paso 6b.
    </div>
  );
}
