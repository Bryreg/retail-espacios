/** Imprimir sólo la hoja de la guía (`guia.css`, `@media print`): marca el
 *  documento mientras dura el diálogo de impresión. */
export function imprimirLaGuia(): void {
  const html = document.documentElement;
  html.classList.add("imprimiendo-guia");
  let reloj: ReturnType<typeof setTimeout> | null = null;
  const sacar = () => {
    html.classList.remove("imprimiendo-guia");
    window.removeEventListener("afterprint", sacar);
    if (reloj) clearTimeout(reloj);
  };
  window.addEventListener("afterprint", sacar);
  window.print();
  // Un navegador que no avisa `afterprint` (o cuyo `print` no espera): se saca
  // igual, con tiempo de sobra para que la vista previa ya se haya armado.
  reloj = setTimeout(sacar, 60_000);
}
