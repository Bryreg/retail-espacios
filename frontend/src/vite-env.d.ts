/// <reference types="vite/client" />

// Fase 3 compliance: los documentos legales (`src/legal/*.md`) se importan
// como texto crudo para renderizarlos en la página pública, en vez de
// pasarlos por un pipeline de build de markdown que este proyecto no tiene.
// Vite ya sabe servir cualquier import con `?raw` como string; esto sólo se
// lo dice a TypeScript.
declare module "*.md?raw" {
  const content: string;
  export default content;
}
