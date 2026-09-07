# Fase 10 · PR 2 — Vender con la forma de E

**Punto de partida (2026-09-07).** El PR 1 (#54) puso adentro los tokens de la
landing: claro por defecto, oscuro a un clic, amarillo solo en el botón
principal. En claro, Vender cambió el 4 % de los píxeles: la piel sola no trae
la identidad. Lo que hace que la landing se vea como la landing es la **forma**:
display pesada con tracking cerrado, cifras en mono, rótulos pill, líneas
finas, tarjetas con aire, conectores, composición. Eso es este PR.

**Qué NO se discute (ya decidido y en producción):**

- **La estructura de q1 con injertos de q3** está implementada: plano isométrico
  con las fechas de liberación sobre el mueble, contrato con varios espacios y
  lugar fijo, «Cuándo se libera cada espacio» (escalera A·4: sin columna
  lateral, sin eje vertical, peine de días, el cursor escribe la lectura),
  tarifa de referencia con su pie. Ver `docs/ESTADO.md` «Rediseño de la
  pantalla principal» y `docs/maquetas/elegida-vender.html`.
- **Vender la ve el proveedor** (el administrador gira el portátil): nada de
  otros proveedores, sus cánones, rankings, quién está bajo tarifa, canon de
  la sede ni plata del periodo. Solo disponibilidad, tiempo, el espacio, el
  contrato de ESE proveedor y la tarifa de referencia.
- **Cerrar trato y revisar sin scroll en 1440×900.** El formulario del contrato
  no es un globo: tiene lugar fijo.
- **Claro por defecto**, oscuro a un clic. **Amarillo solo en «Guardar contrato
  y avisar»**. Los tres estados con los hex validados de `tema.css`; cada
  estado va con su palabra al lado.
- Los criterios del dueño: la forma la manda el dato; pulcro (cada cosa está
  ahí por algo; si dos elementos dicen lo mismo, uno sobra); que no se lea
  como generado.

## Ronda 1 — tres direcciones, a ciegas del sistema actual

Tres diseñadores, en paralelo, **sin ver la app actual ni sus capturas**. Cada
uno recibe: la landing E (`features/landing/outputs/opciones/E-fusion/` —
index.html y README: ESA es la identidad), los tokens (`frontend/src/tema.css`),
la maqueta elegida (`docs/maquetas/elegida-vender.html`: ESA es la estructura y
los datos reales de NAVE), `docs/maquetas/BRIEF.md`, `CRITERIOS.md`, y la sección
del rediseño en `docs/ESTADO.md`. Cada uno gasta el riesgo en un lugar distinto:

- **A · «q1 vestida de E».** La misma composición de q1, con la tipografía, los
  materiales y el ritmo de E. El riesgo: que la fidelidad a q1 lo deje tibio.
- **B · «El catálogo».** Vender como la pieza que el proveedor mira: el plano
  domina, el contrato es la ficha de E («Una sola ficha»: filas mono con
  separador punteado y total grande), la escalera es el argumento de venta.
- **C · «La mesa de trabajo».** Para quien la abre cuarenta veces al día:
  densidad, mono en todo lo que se compara, líneas finas, cero decoración; el
  contrato fijo a la derecha y todo lo demás a un vistazo.

Entregables por opción, en `outputs/vender/opciones/<X>/`: `index.html`
autocontenido (tokens de `tema.css` copiados adentro, pilas de sistema, cero
recursos externos, claro por defecto con el toggle a oscuro, datos reales de
NAVE), `README.md` (qué decidió y por qué, qué de q1 conserva, qué de E trae,
el resultado del validador de dataviz sobre sus colores de estado contra las
dos superficies).

Después, un **director de arte** captura las tres a 1440×900 (claro y oscuro)
y a 390 (claro), mide que en 1440×900 no haya scroll para cerrar trato y
revisar, hace el `grep` de confidencialidad (ningún nombre de proveedor ajeno
ni canon ajeno), y escribe `outputs/vender/COMPARATIVA.md`: qué aporta cada
una, qué se lleva, y qué injertaría. **No elige**: elige el dueño.

## Ronda 2 — el port (después de que el dueño elija)

Frontend + auditor + verificador en serie, como en la landing: llevar la opción
elegida a `pages/DashboardView.tsx`, `components/Contrato/`, `components/Libera/`
y lo que toque, con los pendientes del PR 1 que son de forma:

- rótulos del plano isométrico con la mono (7 px de desborde en códigos de 7
  caracteres); `EXH-CENTRAL` en el FloorMap;
- las siete clases de `DISPLAY_TOP` sobre cuatro colores validados;
- la escala tipográfica (los nombres `--t-*` con los pasos que la opción fije) y
  `--s5/--s6` vs `p-5/p-6`;
- código muerto `StoreView`/`Legend`.

Supervisar hereda lo que sea de sistema (tipografía, tarjetas, rótulos) sin
rediseñarse: es el PR 3.
