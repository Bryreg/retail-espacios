# Cómo se midió el port

Playwright contra el servidor de desarrollo del propio repo, con la API
respondida por stubs (`abrir.mjs`) y un layout con la forma de NAVE
(`datos.mjs`: **106 muebles, 23 caras comercializables**, y contra el periodo
por defecto de Vender —hoy → hoy+30— **15 libres · 5 se liberan · 3 tomados**,
que es exactamente la historia de D).

```bash
cd frontend && npx vite --port 5231 --strictPort &
cd features/diseno-interior/outputs/vender/medicion
node choques.mjs [ancho] [alto] [claro|oscuro]   # rótulos del plano: choques y cortes
node pantalla.mjs                                # 7 resoluciones × 2 modos: qué se esconde
node valvula.mjs                                 # la ficha del contrato con 1..5 espacios
node auditoria.mjs                               # contraste, cuerpos y confidencialidad
node interaccion.mjs                             # resaltado, conteos, contrato, escalera
node supervisar.mjs                              # que Supervisar siga como estaba
node tamanos.mjs · amarillo.mjs · anillo.mjs     # escala, un amarillo, anillo de foco
node cap.mjs 1440 900 claro                      # una captura
```

`BASE` cambia el puerto (`BASE=http://localhost:5231`). El navegador es el
Chromium preinstalado (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).

Un aviso para quien mida el plano: después de tocar `+`, `−` o de mover la
rueda, **esperá un cuadro** (`requestAnimationFrame`) antes de leer rects — no
porque la pantalla necesite ese cuadro para acomodar, sino porque el navegador
necesita ese cuadro para *dibujar* lo que ya está decidido.
