# Fase 11 — La Plataforma como espacio de análisis y asesoría

**Pedido del dueño (2026-09-07).** Al abrir el detalle de un cliente en
`/plataforma`: «un montón de información sin orden, súper largo, sin entender
qué era cada cosa». La plataforma tiene que ser un espacio de análisis y de
asesoría, con la referencia del **storytelling de científicos y analistas de
datos** para presentar resultados. Rediseño con varias opciones, **sin ninguna
referencia visual**: los diseñadores trabajan solo con `brief.md`.

## Proceso (el que funcionó en la landing y en Vender)

1. **Analista de datos primero.** Un agente analista (Opus) toma el brief y un
   JSON de ejemplo con la forma real de los endpoints (`/api/plataforma/*` y
   `/clientes/{slug}/detalle`) y escribe `outputs/guion.md`: la historia de la
   cartera y la de un cliente, capítulo por capítulo, con la frase-conclusión
   de cada bloque y las cifras, en el orden situación → hallazgo → propuesta →
   valor. Es el equivalente del copy de la landing: de ahí sale la calidad.
2. **Tres diseñadores a ciegas** (Opus, en paralelo), cada uno con el brief, el
   guion, el JSON y `tema.css`, con un riesgo distinto:
   - **A · El informe** — la sesión como documento que se lee de arriba abajo,
     con los gráficos anotados; la cartera como índice.
   - **B · El tablero de asesoría** — la cartera como cola de trabajo ordenada
     por necesidad; el cliente como una hoja sin scroll con capítulos
     navegables.
   - **C · La conversación** — cada recomendación como una tarjeta de acción
     con su evidencia desplegable; el plano y las sedes como ancla.
3. **Director de arte** (Opus): capturas, mediciones (jerarquía: ¿la
   conclusión está arriba?, cifras contra referencia, nada dos veces, listas
   agregadas, contraste, validador), comparativa sin elegir.
4. **El dueño elige** (o mezcla). Después el port: backend sin cambios de
   datos salvo lo que el guion pida y ya exista; frontend en
   `pages/Plataforma.tsx`, `pages/DetalleCliente.tsx`, `components/plataforma/`;
   auditor de frontera (la tarifa nunca sale; bitácora; solo lectura);
   verificador en serie.

## Guardrails

Los de `brief.md` §4 (frontera) y §6 (forma). El reporte de transparencia no
se rediseña. Sin migraciones. Cero recursos externos.
