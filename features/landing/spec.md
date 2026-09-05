# Fase 9 — Landing page de RECABRA: qué es, para qué sirve, cómo se usa, y registrate

## El problema (dueño de la plataforma, 2026-09-05)

Al abrir `retail-espacios.onrender.com` lo único que hay es el formulario:
"Continuar con Google", correo/contraseña o el acceso por supermercado. Nada
dice **qué es RECABRA**, qué hace, para quién es ni por qué alguien debería
registrarse. La landing tiene que vender el sistema y llevar al registro.

## Objetivo

Una página pública en `/` para quien NO tiene sesión (quien la tiene sigue
entrando directo a su supermercado o a `/plataforma`, como hoy). El login
actual se mueve a `/login` (con `?invitacion=` y todos sus enlaces intactos;
`/login` sigue siendo el destino del correo de invitación y del deep link de
montaje). Meta: que un gerente de supermercado que llega por un enlace
entienda en 30 segundos qué es y toque "Crear mi cuenta".

## Qué cuenta la página (en este orden; copy en español rioplatense-neutro,
sin humo, cifras reales del producto)

1. **Hero**: nombre, una frase que diga qué es ("RECABRA gestiona los espacios
   comerciales de tu supermercado: qué mueble está libre, quién lo ocupa, a
   cuánto y hasta cuándo") y el plano isométrico INTERACTIVO (abajo). CTA
   primario "Crear mi cuenta" → `/login#registro`; secundario "Ya tengo
   cuenta" → `/login`.
2. **Qué hace** (4–6 bloques con el producto real, no genéricos): plano de la
   tienda vista desde arriba y en 3D; contratos por espacio con proveedor,
   canon y fechas; ocupación y qué se libera en el período; tarifas de
   referencia y spread; recordatorios de vencimiento por correo; montaje
   confirmado con foto desde el celular (enlace del trabajador); histórico
   mes a mes.
3. **Para quién y beneficios**: gerente/administrador (vende espacios con
   datos, no de memoria), trabajador de piso (confirma montajes sin ver
   dinero), proveedor (transparencia de qué compró). Beneficios medibles:
   ocupación visible, ingresos contratados del mes, contratos que se vencen
   sin que nadie se dé cuenta, tiempo de armar un contrato.
4. **Cómo se usa** (3 pasos): 1) creás la cuenta y tu supermercado en un
   minuto, 2) dibujás el plano (o lo cargás por planilla), 3) vendés
   espacios tocando el mapa. Capturas reales de la app (claro/oscuro).
5. **Asesoría** (el diferencial de Fases 6–8): "además del sistema, te
   decimos qué proponer" — recomendaciones con valor en juego, oportunidades
   por espacio libre, tendencia. Sin cifras de clientes reales: ejemplos
   sembrados.
6. **Confianza**: multi-supermercado con base separada por cliente, login con
   Google, política de datos y reporte de transparencia (enlaces reales),
   Colombia (Ley 1581).
7. **Precio / modelo**: transferencia bancaria y cuenta de cobro, sin
   pasarela (es la decisión vigente); "hablemos" con correo de contacto.
   `[COMPLETAR: precio]`.
8. **CTA final** y pie con enlaces legales.

## El plano isométrico interactivo (VINCULANTE — es lo que hace la página
distinta)

- Un plano isométrico de un supermercado de EJEMPLO (sembrado en el código de
  la landing, nunca datos de un cliente) con góndolas, puntas, neveras y
  cajas, en el MISMO lenguaje visual que `FloorPlan2D` (verde = libre,
  naranja = se libera, rojo = tomado, gris = resto de la sala) para que lo
  que ve en la landing sea lo que va a ver adentro.
- **Acercar y alejar** con rueda/pinch y **arrastrar** para desplazarse;
  botones + / − / centrar; en móvil, gestos. Al pasar el mouse por un mueble,
  una tarjeta chica con código, proveedor de ejemplo y canon. Un botón
  "Ver en 3D" que alterna a una vista 3D liviana (three.js ya está en el
  proyecto; lazy-load: la landing no puede cargar el editor entero).
- Rendimiento: LCP < 2,5 s en móvil 4G, el plano no bloquea el primer pintado
  (SVG/canvas propio para la isométrica, 3D solo bajo demanda), imágenes
  comprimidas, sin librerías nuevas de animación (CSS + `requestAnimationFrame`).
- Accesible: navegable por teclado, `prefers-reduced-motion` respetado, texto
  alternativo para el plano.

## Orden de trabajo y libertad creativa (VINCULANTE — indicación del dueño)

1. **Primero el texto. El copy es lo que decide la calidad del resultado.**
   Un agente **analista/copy** (Opus) escribe TODO el texto de la página
   antes de que nadie diseñe ni construya: titulares, subtítulos, bloques,
   pasos, beneficios, CTAs, microcopy de botones y tarjetas, el pie. Lo
   escribe con el producto real —leyendo `docs/ESTADO.md` completo, las
   specs de `features/*/spec.md` y las capturas de `features/*/outputs/`—,
   para un gerente de supermercado colombiano que no conoce el sistema, en
   español claro, concreto y sin humo: verbos, cifras del producto (no
   inventadas), cero jerga técnica. Entrega `outputs/copy.md` con la
   estructura de la página sección por sección y, por sección, el texto
   final más una línea de "intención" (qué tiene que sentir/entender quien
   lee). Es el insumo único de diseño y frontend.
2. **Diseño sin referencias visuales, solo con el texto.** Sabemos por
   sesiones anteriores que las skills de diseño rinden mejor sin capturas ni
   paleta impuesta. El agente de **diseño** recibe `copy.md` y esta spec, y
   NADA más: ni capturas de la app, ni los tokens `--con-*`, ni la paleta
   actual. Usa `ui-ux-pro-max`, `design-system` / `ui-styling`, `brand` (y
   `dataviz` si propone gráficos) con **libertad creativa total**: dirección
   visual, paleta, tipografía, ritmo, animaciones, la puesta en escena del
   plano isométrico. Entrega `outputs/diseno.md` (dirección + tokens +
   especificación por sección) y, si puede, un prototipo HTML estático en
   `outputs/prototipo/`. Que sea ambicioso: después se descarta lo que no
   vaya con la realidad del producto, pero eso lo decide el dueño al ver el
   resultado, no el agente al autolimitarse.
3. **Recién después el frontend** construye en la app a partir de `copy.md`
   y `diseno.md`. Lo único que hereda de la app es lo funcional (rutas, CSP,
   three.js lazy para el 3D); la estética es la del diseño nuevo. Si el
   diseño nuevo choca con la app interior, se documenta como decisión
   pendiente del dueño, no se "suaviza".
4. Coherencia claro/oscuro y responsive de 360 px a 1920 px siguen siendo
   requisitos; el resto es libre.
- SEO básico: `<title>`, meta description, Open Graph, `robots`, `sitemap`
  no hace falta. `lang="es"`.

## Guardrails

- La landing es pública: **cero llamadas autenticadas**, cero datos reales
  (ni de Galerías Plaza ni de nadie). Bajo la CSP de Fase 3 (sin scripts ni
  fuentes externas salvo lo que la CSP ya permite).
- No romper: `/login` con `?invitacion=`, el deep link de montaje, `/politica-
  datos`, `/plataforma`, la redirección de sesión existente en `App.tsx`.
- SIN MIGRACIONES; nada de backend salvo, si hace falta, servir la ruta.
- Verificación por agente SOLO sobre su territorio (REGLA_VERIFICACIÓN); la
  suite completa, `tsc` y `build` los corre el Verificador una vez, en serie;
  capturas móvil y escritorio, claro y oscuro; Lighthouse o medición
  equivalente del LCP.

## Verificación (checklist del Verificador)

- [ ] `/` sin sesión muestra la landing; con sesión redirige como hoy.
- [ ] `/login`, `/login?invitacion=`, deep link de montaje y `/politica-datos` intactos (tests existentes verdes).
- [ ] El plano isométrico acerca/aleja con rueda y botones, arrastra, muestra tarjeta al pasar; "Ver en 3D" carga three.js bajo demanda (no en el bundle inicial).
- [ ] Sin llamadas a `/api/*` autenticadas desde la landing; CSP sin violaciones en consola.
- [ ] Capturas 360 px y 1440 px, claro y oscuro; LCP medido < 2,5 s (simulación móvil).
- [ ] Copy revisado contra `docs/ESTADO.md`: nada que el producto no haga.
- [ ] Suite completa verde dos veces en serie; `tsc` y `build` limpios.
