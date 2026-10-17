// Marcador: lo reemplaza el paso 6b
export default function LienzoDeZonas(props: { fixtureId: string; sede: string }) {
  return (
    <div data-distribucion className="flex h-full items-center justify-center bg-dark-surface text-xs text-dark-ink-2">
      Lienzo de zonas de {props.fixtureId} ({props.sede}): llega en el paso 6b.
    </div>
  );
}
