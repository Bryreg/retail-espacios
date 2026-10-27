# Implementación del rediseño UX 2026-10 contra el inventario

Verificación de la etapa 9: cada función de `pantallas.md` con su estado en la rama `claude/vibrant-wozniak-1ny6q4`.
«Existía, se conserva» quiere decir que la función ya estaba y sigue, ahora en el lugar del rediseño.

| Estado | Ítems |
|---|---|
| Hecho | 112 |
| Existía, se conserva | 153 |
| Parcial | 18 |
| No hecho | 9 |
| Decidido | 4 |

Cómo se comprobó: `npx tsc --noEmit`, las 44 suites `scripts/probar-*.mjs`, la batería completa del servidor (`pytest`) y un barrido del navegador por todos los módulos a 1920, 1440, 1366, 1024, 768 y 390 px, administración y trabajador, tema claro y oscuro (errores de consola, desbordes, «NaN», importes abreviados y plata a la vista del trabajador).


## Elementos comunes › Barra superior

| # | Función | Estado | Nota |
|---|---|---|---|
| 1 | Módulos: Contratos · Indicadores · Montajes · Plano de la sede | Hecho |  |
| 2 | Plataforma, sólo para el operador | Hecho |  |
| 3 | Selector de sede, con la opción «Todas las sedes» | Parcial | El selector elige una sede; «Todas las sedes» es una pestaña de Indicadores y una casilla en Montajes. |
| 4 | Botón Pendientes con el contador de pendientes | Hecho |  |
| 5 | Ajustes (engranaje) | Hecho |  |
| 6 | Estado de sincronización («Guardado / Guardando / Sin conexión»); un clic sincroniza y reemplaza a «Actualizar» | Hecho |  |
| 7 | Aviso de conflicto de sincronización, sólo cuando ocurre («Usar la del servidor / Conservar la mía») | Existía, se conserva |  |
| 8 | Menú de la cuenta: persona y rol, tema claro u oscuro, cambiar de supermercado, cerrar sesión | Parcial | Persona y rol, tema y cerrar sesión; «cambiar de supermercado» sigue siendo volver a ingresar. |
| 9 | Avisos de cuenta cuando aplican: pago pendiente, política nueva, cuenta suspendida | Existía, se conserva |  |
| 10 | En el teléfono: barra inferior con Contratos, Indicadores, Montajes, Plano y Ajustes | Parcial | La barra de abajo lleva Inicio, Contratos, Indicadores, Montajes y Plano; Ajustes va en el menú de la cuenta. |

## Elementos comunes › Buscador de funciones (Ctrl K)

| # | Función | Estado | Nota |
|---|---|---|---|
| 11 | Abrir con Ctrl K o con la lupa | Hecho |  |
| 12 | Resultados agrupados: Acciones · Espacios · Glosario | Hecho |  |
| 13 | Sinónimos («planilla» encuentra «Cargar contratos desde planilla»; «reno» encuentra «Renovar contrato» y «Ordenar códigos») | Hecho |  |
| 14 | Un espacio por código, con su estado y la acción que corresponde («PUN-07 · vence el 30/10/2026 → Renovar contrato») | Hecho |  |
| 15 | Moverse con ↑ ↓, abrir con Enter, cerrar con Esc | Hecho |  |
| 16 | Enlace «Ver el mapa de todas las funciones» | Hecho |  |

## Elementos comunes › Bandeja de Pendientes

| # | Función | Estado | Nota |
|---|---|---|---|
| 17 | Tres pestañas: Fecha límite hoy · Próximos 30 días · Inconsistencias, cada una con su conteo | Hecho |  |
| 18 | Cada pendiente con su acción y el espacio marcado en el plano al pasar el mouse | Parcial | Cada pendiente tiene su acción; el espacio se marca en el plano al pasar el mouse sólo en Indicadores. |
| 19 | Al resolverlo sale de la lista y aparece un aviso con «Deshacer» | Parcial | «Deshacer» existe en «Canon sin base»; no hay un deshacer general. |
| 20 | Se abre sola al primer ingreso del día si hay algo con fecha límite hoy | Hecho |  |
| 21 | Tipos de pendiente: | Existía, se conserva |  |
| 22 | Contrato vencido | Existía, se conserva |  |
| 23 | Contrato por vencer en 30 días (Renovar contrato · No renovar) | Existía, se conserva |  |
| 24 | Reserva provisional por confirmar o que caduca (Confirmar como contrato · Cancelar reserva) | Existía, se conserva |  |
| 25 | Falta planometría (Adjuntar planometría) | Existía, se conserva |  |
| 26 | Contratado sin montar | Existía, se conserva |  |
| 27 | Montaje no realizado, con motivo y foto | Existía, se conserva |  |
| 28 | Montado, sin verificar (contrato y planograma) | Hecho | El de contrato es nuevo (verificación); el de planograma existía. |
| 29 | Planograma que no coincide · planograma sin montar · guía por enviar | Existía, se conserva |  |
| 30 | Participación sin ubicar en la cara · borrador de distribución · reserva de participación que caduca | Parcial | Participación sin ubicar y reserva que caduca existen; «borrador de distribución» no aparece como pendiente. |
| 31 | Ventas por cargar (cobro por % de las ventas) | Existía, se conserva |  |
| 32 | Volver a llamar a un proveedor (fecha anotada en una oferta) | No hecho | No hay «volver a llamar a un proveedor». |
| 33 | Inconsistencias, cada una con la acción que la corrige: | Existía, se conserva |  |
| 34 | Canon sin base (mensual o total): «Es al mes / Es el total / Todos son al mes / Deshacer» | Existía, se conserva |  |
| 35 | Contrato sin mueble en el plano (cancelar el contrato de la base) | Existía, se conserva |  |
| 36 | Contrato que sólo vive en el plano (pasarlo a la base) | Existía, se conserva |  |
| 37 | Ocupado sin contrato | Existía, se conserva |  |
| 38 | Reservado a mano (Liberar · Reservar de verdad) | Existía, se conserva |  |
| 39 | Canon bajo la tarifa (Editar contrato) | Existía, se conserva |  |
| 40 | Montajes viejos sin reporte | Existía, se conserva |  |

## Elementos comunes › Ficha del espacio

| # | Función | Estado | Nota |
|---|---|---|---|
| 41 | Encabezado: código · nombre, estado en el período elegido y fecha («Contratado · vence el 30/10/2026») | Hecho |  |
| 42 | Datos: proveedor y marca, vigencia, canon mensual y valor total, estado del montaje, observación; cara A/B con el proveedor de la otra cara | Hecho |  |
| 43 | Acción principal según el estado: Renovar contrato · Nuevo contrato · Confirmar la reserva | Hecho |  |
| 44 | A la vista: Editar contrato (o el próximo) · Ver en 3D | Hecho |  |
| 45 | Línea de tiempo de 12 meses: hasta cuándo está ocupado, qué tiene comprometido a futuro y desde cuándo queda disponible | Hecho |  |
| 46 | Montaje y documentos: planometría (adjuntar, cambiar, quitar), archivos del contrato (ver, descargar) | Hecho |  |
| 47 | Partes y participaciones, sólo cuando aplican: renovar, editar, contratar lo disponible, cancelar una parte, distribuir | Existía, se conserva |  |
| 48 | Exhibición: Ver en 3D · Distribuir la cara · Planograma de la cara | Hecho |  |
| 49 | Plegado «Otras acciones del contrato»: contrato con otro proveedor, negociar el espacio, cancelar el contrato (con confirmación) | Hecho |  |
| 50 | En el teléfono: hoja que sube desde abajo, con lo mismo | Hecho |  |

## Elementos comunes › Ayuda y fijar en la barra

| # | Función | Estado | Nota |
|---|---|---|---|
| 51 | «?» en cada pantalla: qué hace y la definición de cada término que aparece | Hecho |  |
| 52 | «?» en cada cifra: fórmula, período, comparación y meta (diccionario de métricas) | Parcial | El «?» de cada cifra está en Indicadores (y su Diccionario); no en las cifras del Inicio. |
| 53 | Menú «Más» de cada módulo, sólo con lo raro o peligroso | Hecho |  |
| 54 | Fijar en la barra: cada persona sube hasta 3 funciones de «Más» a su barra; no cambia lo que ven los demás | Hecho |  |

## Entrada y cliente nuevo › Crear cuenta e ingresar

| # | Función | Estado | Nota |
|---|---|---|---|
| 55 | Página pública: «Crear mi cuenta» · «Ya tengo cuenta» | Existía, se conserva |  |
| 56 | Ingresar con Google, o con correo y contraseña | Existía, se conserva |  |
| 57 | Crear cuenta con correo y verificarlo; reenviar el correo de verificación | Existía, se conserva |  |
| 58 | Olvidé mi contraseña | Existía, se conserva |  |
| 59 | Elegir supermercado cuando la persona está en más de uno | Existía, se conserva |  |
| 60 | Política de Tratamiento de Datos y su aceptación | Existía, se conserva |  |

## Entrada y cliente nuevo › Registrar un supermercado

| # | Función | Estado | Nota |
|---|---|---|---|
| 61 | «Registrar un supermercado nuevo»: nombre y aceptación de la política → «Crear y entrar» | Existía, se conserva |  |
| 62 | Topes: 2 supermercados por persona, freno por IP | Existía, se conserva |  |

## Entrada y cliente nuevo › Aceptar una invitación

| # | Función | Estado | Nota |
|---|---|---|---|
| 63 | Entrar desde el enlace del correo; se canjea con el mismo correo invitado | Existía, se conserva |  |
| 64 | «Continuar sin la invitación» · «Ingresar con otra cuenta» | Existía, se conserva |  |
| 65 | Aviso cuando la invitación venció (dura 7 días) | Existía, se conserva |  |

## Entrada y cliente nuevo › Configuración inicial

| # | Función | Estado | Nota |
|---|---|---|---|
| 66 | Barra de avance «N de 6» y el siguiente paso marcado con la única acción amarilla | Hecho |  |
| 67 | Paso 1 · Crear las sedes | Hecho |  |
| 68 | Paso 2 · Dibujar el plano de cada sede (lleva a Plano de la sede); muestra muebles y espacios contratables | Hecho |  |
| 69 | Paso 3 · Definir las tarifas (lleva a Ajustes › Tarifas) | Hecho |  |
| 70 | Paso 4 · Definir responsables por sede (comercial, administración, montaje); avisa qué avisos no salen si falta alguno | Hecho |  |
| 71 | Paso 5 · Invitar al equipo (lleva a Ajustes › Usuarios) | Hecho |  |
| 72 | Paso 6 · Registrar el primer contrato o cargar los existentes desde planilla | Hecho |  |
| 73 | Cada paso dice lo que falta y lo ya hecho («CENTRO: 16 muebles, 22 espacios contratables») | Hecho |  |
| 74 | Ocultar la configuración inicial y volver a ella desde Ajustes | Parcial | Se oculta por computadora (navegador), no por supermercado; se vuelve a mostrar desde Ajustes › Cuenta. |

## Indicadores › Resumen (panel de información rápida)

| # | Función | Estado | Nota |
|---|---|---|---|
| 75 | Período: Hoy · Mes · Últimos 12 meses; comparación con el mes anterior | Hecho |  |
| 76 | Tarjeta Canon mensual contratado: valor, variación vs el mes anterior, % del potencial a tarifa, curva de 12 meses contra el potencial → Tabla de contratos | Hecho |  |
| 77 | Tarjeta Ocupación: %, un cuadrito por espacio (contratados y disponibles), meta → Contratos con el plano por disponibilidad | Hecho |  |
| 78 | Tarjeta Canon ÷ tarifa: %, barra con la marca de la meta → Tabla de contratos ordenada por ÷ tarifa | Hecho |  |
| 79 | Tarjeta Para hacer hoy: conteo y las 3 tareas con fecha límite hoy, cada una con su botón → Pendientes | Hecho |  |
| 80 | Tarjeta Vence en 90 días: canon sin renovar, cada contrato como punto sobre el eje de días (naranja sin renovación, gris renovado) → Tabla filtrada | Hecho |  |
| 81 | Tarjeta Montajes del mes: N de M en la tienda, barra por estado (verificado, sin verificar, sin montar, no realizado) → Montajes | Hecho |  |
| 82 | Tarjeta Disponibles hoy: cantidad, códigos con días sin contrato, lo no facturado en el mes → Contratos con esos espacios elegidos | Hecho |  |
| 83 | «?» en cada tarjeta con la definición de la métrica (diccionario) | Hecho |  |
| 84 | Estado contra la meta sólo con ícono y texto («Bajo la meta de 90 %»), nunca sólo color | Hecho |  |
| 85 | Importes completos, sin abreviar («$ 9.939.500») | Hecho |  |
| 86 | Versión del trabajador: sin importes; sus montajes, los disponibles y lo que vence | Hecho |  |
| 87 | Teléfono: canon, ocupación, canon ÷ tarifa y las tareas de hoy | Hecho |  |

## Indicadores › Tabla de contratos

| # | Función | Estado | Nota |
|---|---|---|---|
| 88 | Filtros en botones: Vigentes · Vencen en 90 días · Próximos · Vencidos · Cerrados, con conteo | Hecho |  |
| 89 | Buscar por espacio o proveedor | Hecho |  |
| 90 | Columnas: espacio, proveedor, vigencia, canon /mes, canon ÷ tarifa, montaje, vence en | Hecho |  |
| 91 | Ordenar por cualquier columna; marca de «sin renovar» en lo que vence | Hecho |  |
| 92 | Tocar una fila abre la ficha del espacio | Hecho |  |
| 93 | Exportar CSV | Hecho |  |

## Indicadores › Quién paga el canon

| # | Función | Estado | Nota |
|---|---|---|---|
| 94 | Tres cifras: proveedores con contrato vigente, cuánto pagan los 3 primeros, el que más paga | Hecho |  |
| 95 | Proveedores ordenados por canon mensual, en barras de un solo color; los pequeños en «Otros» | Hecho |  |
| 96 | Por proveedor: canon /mes, % del total, contratos, próximo fin | Hecho |  |
| 97 | Orden por monto o por nombre | Hecho |  |
| 98 | Exportar CSV | Hecho |  |

## Indicadores › Participaciones de cara

| # | Función | Estado | Nota |
|---|---|---|---|
| 99 | Cada cara como una barra del 100 % con el % de cada proveedor y lo disponible | Parcial | Tabla de participaciones con CSV; sin barras del 100 % por cara. |
| 100 | Cada proveedor conserva su color en todas las caras | Parcial | Los colores y filtros siguen la tabla existente, no el dibujo. |
| 101 | Marca de «Falta ubicar» cuando hay una participación sin zona | Hecho |  |
| 102 | Filtro por proveedor y día del informe; desde / hasta | Parcial | Los colores y filtros siguen la tabla existente, no el dibujo. |
| 103 | «Abrir en Distribución» por cara | Hecho |  |
| 104 | Exportar CSV | Hecho |  |

## Indicadores › Todas las sedes

| # | Función | Estado | Nota |
|---|---|---|---|
| 105 | Una tarjeta para el total y una por sede | Hecho |  |
| 106 | Por tarjeta: canon mensual con variación, curva de 12 meses, ocupación, canon ÷ tarifa, sin renovar a 90 días | Hecho |  |
| 107 | Una frase que dice qué sede necesita atención y por qué | Hecho |  |
| 108 | «Abrir» lleva al Resumen de esa sede | Hecho |  |

## Indicadores › Detalle del tablero

| # | Función | Estado | Nota |
|---|---|---|---|
| 109 | Resultado: canon contra potencial, ocupación, canon ÷ tarifa, lo no facturado | Hecho |  |
| 110 | Lo que viene: canon que vence por semana (con y sin contrato siguiente), espacios disponibles por día a 90 días | Hecho |  |
| 111 | Por qué: tabla por tipo de mueble (espacios, contratados, ocupación con meta, días disponibles entre contratos, canon ÷ tarifa, lo no facturado) | Hecho |  |
| 112 | Operación: embudo de montajes del mes (empiezan, aviso enviado, registrado, montado, verificado) y pendientes por fecha límite | Hecho |  |
| 113 | Una lectura escrita al pie de cada bloque | Hecho |  |
| 114 | Ver como tabla y exportar CSV | Hecho |  |

## Indicadores › Diccionario de métricas

| # | Función | Estado | Nota |
|---|---|---|---|
| 115 | Por métrica: fórmula, período, comparación, umbral, datos de origen | Hecho |  |
| 116 | Métricas: canon mensual contratado, potencial a tarifa, ocupación, canon ÷ tarifa, sin facturar por espacios disponibles, canon que vence en 90 días, espacios disponibles por día, días disponibles entre contratos, montajes del mes, pendientes por fecha límite | Hecho |  |

## Contratos › Contratos: ¿para qué fechas?

| # | Función | Estado | Nota |
|---|---|---|---|
| 117 | Primera línea «¿Para qué fechas?»: del / al, con los días que suman | Hecho |  |
| 118 | Atajos: 1 mes · 3 meses · 6 meses · cada temporada (Black Friday, Navidad…) | Hecho |  |
| 119 | Plano con el resultado: verde disponible todas las fechas, ámbar contratado parcialmente (en fechas o en superficie), rojo contratado, borde punteado reservado | Hecho |  |
| 120 | Debajo de cada código: «disponible», «desde 16/11/2026», «hasta 31/01/2027» o qué parte («cara B», «20 % cara A») | Hecho |  |
| 121 | Ver el plano por: Disponibilidad · Fecha en que se libera · Tarifa | No hecho | No hay «Ver el plano por Disponibilidad · Fecha · Tarifa». |
| 122 | Clave con conteos («4 disponibles todas las fechas · 8 contratados parcialmente…») | Hecho |  |
| 123 | Lista «Espacios para esas fechas»: disponibles todas las fechas y disponibles parte (cuántos días de los pedidos cubren), con tarifa | Parcial | La lista existe como «Cuándo se libera» y la línea de tiempo; no hay una lista aparte «Espacios para esas fechas». |
| 124 | Marcar varios espacios y «Contratar N espacios · del … al …» con las fechas ya puestas | Existía, se conserva | Varios espacios en el mismo contrato existía; las fechas ahora vienen de «¿Para qué fechas?». |
| 125 | Mover y acercar el plano (arrastrar, rueda, dos dedos); filtrar por código o proveedor | Hecho |  |
| 126 | Cambiar a Línea de tiempo | Hecho |  |
| 127 | Cargar desde planilla · Nuevo contrato (sin fechas previas) | Hecho |  |
| 128 | Teléfono: las fechas arriba y la lista; «Ver en el plano» | Hecho |  |

## Contratos › Línea de tiempo de la sede

| # | Función | Estado | Nota |
|---|---|---|---|
| 129 | Barras por contrato con el proveedor; contratado parcialmente en ámbar; reserva provisional punteada | Parcial | Por privacidad (Contratos lo mira el proveedor) las barras no dicen el proveedor. |
| 130 | Raya de hoy y banda de las fechas elegidas | Hecho |  |
| 131 | Tocar un hueco: «PUN-05 disponible del 15/12/2026 al 31/03/2027 · 107 días · Contratar estas fechas» | Hecho |  |
| 132 | «Sólo los disponibles en tus fechas» | Hecho |  |
| 133 | Escalera «Cuándo se libera cada espacio» (cuántos quedan disponibles desde cada fecha), con cursor y teclado | Hecho |  |

## Contratos › Nuevo contrato · paso 1: qué se contrata

| # | Función | Estado | Nota |
|---|---|---|---|
| 134 | Entera: el mueble o la cara completa, con su tarifa | Existía, se conserva |  |
| 135 | Por partes: el mueble muestra sus partes (entrepaños desde la base EN1, tramos, puertas), cada una con su disponibilidad; marcar varias; la tarifa por parte (de su clase o la de la cara ÷ partes) | Existía, se conserva |  |
| 136 | Por participación: «queda 20 % de la cara A» sin nombres de otros proveedores; escribir el % (como máximo lo que queda); tarifa proporcional | Existía, se conserva |  |
| 137 | Varios espacios en el mismo contrato; quitar una línea | Existía, se conserva |  |
| 138 | «Un renglón por cada una»: la misma pieza en todas las de la sede | Existía, se conserva |  |
| 139 | Cambiar cómo se contrata una línea o sus fechas | Existía, se conserva |  |
| 140 | Ver en 3D con el proveedor | Existía, se conserva |  |

## Contratos › Nuevo contrato · paso 2: proveedor y vigencia

| # | Función | Estado | Nota |
|---|---|---|---|
| 141 | Proveedor con autocompletado (Tab); correo de avisos del proveedor | Existía, se conserva |  |
| 142 | Marca (opcional) | Existía, se conserva |  |
| 143 | Vigencia ya puesta desde la pregunta inicial; editable con atajos y temporadas | Hecho |  |

## Contratos › Nuevo contrato · paso 3: canon

| # | Función | Estado | Nota |
|---|---|---|---|
| 144 | Escribir canon mensual o valor total del contrato (el sistema calcula el otro) | Existía, se conserva |  |
| 145 | Tarifa de referencia al lado, la comparación («Igual a la tarifa», «bajo la tarifa») y el valor total | Existía, se conserva |  |
| 146 | Volver a la tarifa | Existía, se conserva |  |
| 147 | Otra forma de cobro: % de las ventas, con corte cada mes o al final | Existía, se conserva |  |

## Contratos › Nuevo contrato · paso 4: confirmación

| # | Función | Estado | Nota |
|---|---|---|---|
| 148 | Resumen en una frase: proveedor, espacio, fechas, canon | Hecho |  |
| 149 | Planometría: adjuntar (imagen o PDF), cambiar | Existía, se conserva |  |
| 150 | A quién se avisa: proveedor (sin tarifas), responsable comercial, responsable de montaje; nota opcional para el proveedor | Existía, se conserva |  |
| 151 | Guardar contrato | Existía, se conserva |  |
| 152 | Reservar provisionalmente hasta una fecha de caducidad | Existía, se conserva |  |
| 153 | Atrás · Empezar de nuevo | Existía, se conserva |  |

## Contratos › Contrato guardado

| # | Función | Estado | Nota |
|---|---|---|---|
| 154 | Confirmación con el resumen | Hecho |  |
| 155 | «Qué pasa ahora»: confirmación enviada al proveedor, aviso de montaje enviado (o esperando la planometría o la zona), registro del montaje, verificación | Hecho |  |
| 156 | Línea de tiempo del espacio con la nueva vigencia y desde cuándo vuelve a estar disponible | Hecho |  |
| 157 | Contratar otro espacio · Ver la ficha | Hecho |  |

## Contratos › Editar, renovar y cancelar

| # | Función | Estado | Nota |
|---|---|---|---|
| 158 | Editar contrato (y el próximo, si lo hay): salir sin cambios o «Guardar cambios y reenviar» con confirmación de destinatarios | Existía, se conserva |  |
| 159 | Renovar contrato: abre un contrato nuevo con los datos del actual | Existía, se conserva |  |
| 160 | Contrato con otro proveedor · negociar el espacio | Existía, se conserva |  |
| 161 | Confirmar o cancelar una reserva provisional | Existía, se conserva |  |
| 162 | Cancelar el contrato, con confirmación | Existía, se conserva |  |
| 163 | Contratar lo disponible de una cara o de una parte | Existía, se conserva |  |

## Contratos › Cargar contratos desde planilla

| # | Función | Estado | Nota |
|---|---|---|---|
| 164 | Descargar la plantilla (.xlsx) con las instrucciones | Existía, se conserva |  |
| 165 | Subir .xlsx, .xls o .csv; cambiar el archivo | Existía, se conserva |  |
| 166 | Revisar fila por fila: valor al mes × meses = total, sólo enteros, contra la tarifa; desmarcar filas | Existía, se conserva |  |
| 167 | «Guardar N y avisar»; pantalla final con lo guardado, los avisos y lo que no se pudo | Existía, se conserva |  |

## Contratos › Ver en 3D con el proveedor

| # | Función | Estado | Nota |
|---|---|---|---|
| 168 | Visor encima del contrato: cambiar de cara, tomas, «Hoy» / «Con {proveedor}», pantalla completa, volver al contrato | Existía, se conserva |  |
| 169 | Probar un producto: buscar, elegir, quitar, cambiar de proveedor | Existía, se conserva |  |
| 170 | Subir un producto (foto del frente, nombre) | Existía, se conserva |  |
| 171 | Bajar la propuesta (lámina con el antes y el después) | Existía, se conserva |  |

## Plano de la sede › Contorno de la sede

| # | Función | Estado | Nota |
|---|---|---|---|
| 172 | Ancho y largo del salón de ventas, en metros | No hecho | El contorno de la sede no se implementó (pantalla nueva). |
| 173 | Lado de la entrada (norte, sur, este, oeste) y distancia a la esquina | No hecho | El contorno de la sede no se implementó (pantalla nueva). |
| 174 | Vista previa a escala | No hecho | El contorno de la sede no se implementó (pantalla nueva). |
| 175 | «Guardar contorno y seguir con los muebles»; corregir después | No hecho | El contorno de la sede no se implementó (pantalla nueva). |
| 176 | Plano vacío: «Dibujar el plano» | No hecho | El contorno de la sede no se implementó (pantalla nueva). |

## Plano de la sede › Plano 2D: muebles

| # | Función | Estado | Nota |
|---|---|---|---|
| 177 | Modo ver / modo editar | Existía, se conserva |  |
| 178 | Catálogo por familias: colocar un mueble o un modelo de fábrica arrastrándolo; buscar; plegar; «Ver el catálogo completo» | Hecho | Tira de tipos para tocar o arrastrar; «Más» abre el catálogo completo (familias, modelos, nombre propio). |
| 179 | Código asignado solo al colocar un mueble | Existía, se conserva |  |
| 180 | Barra con nombre: Deshacer · Rehacer · Rotar · Duplicar · Eliminar | Hecho |  |
| 181 | Mover, copiar, pegar, elegir varios (arrastrar, Shift + clic, teclado) | Existía, se conserva |  |
| 182 | Selección múltiple: contratable sí / no, eliminar N elementos | Existía, se conserva |  |
| 183 | Zoom (−, 100 %, +), centrar en todo, mostrar los códigos, pantalla completa | Hecho |  |
| 184 | Buscar y filtrar en el plano por disponibilidad | Hecho |  |
| 185 | Estado «Guardado» a la vista | Existía, se conserva |  |
| 186 | Validación del plano a la vista con su conteo: códigos repetidos, muebles superpuestos, pasillos angostos, negociados con otro código; «Tocar para ir» | Existía, se conserva |  |
| 187 | Resultado: «16 muebles · 22 espacios contratables» | Existía, se conserva |  |
| 188 | «Más»: atajos de teclado | Parcial | Atajos de teclado sigue en la barra del plano, no adentro de «Más». |

## Plano de la sede › Ficha del mueble

| # | Función | Estado | Nota |
|---|---|---|---|
| 189 | Encabezado: código · nombre, pasillo, medidas, caras | Existía, se conserva |  |
| 190 | Pestaña Mueble: cambiar el código (con «Intercambiar» si ya existe), usar la sede del plano, cara A/B, duplicar, eliminar | Existía, se conserva |  |
| 191 | Pestaña Contratación: ¿se puede contratar? (sí / no); cómo se contrata cada cara (entera · por partes · por participación), fijar N partes, aplicar a todas las de la sede, usar lo de la ficha; estado a mano (mantenimiento) | Existía, se conserva |  |
| 192 | Pestaña Contratación con contrato: lo contratado, lo disponible, Distribuir la cara, Planograma de la cara, Contratar | Existía, se conserva |  |
| 193 | Pestaña Medidas: ancho, profundidad, alto, entrepaños (+ / −), módulo | Existía, se conserva |  |
| 194 | Pestaña Documentos: subir y abrir archivos (pdf, xls, csv, imágenes), foto de la cara, nota del contrato y nota del espacio | Existía, se conserva |  |
| 195 | Espacios internos (slots) del mueble: proveedor, categoría, canon, fechas | Existía, se conserva |  |

## Plano de la sede › Plano 3D

| # | Función | Estado | Nota |
|---|---|---|---|
| 196 | Vista: Cenital · Primera persona · Orbital (WASD para caminar) | Hecho | Se renombró la barra: Cenital · Primera persona / Orbital. |
| 197 | Con arte · Sin arte | Existía, se conserva |  |
| 198 | Estado «Guardado» y Guardar | Existía, se conserva |  |
| 199 | Presentar al proveedor · Terminar reunión (quita las pruebas) | Existía, se conserva |  |
| 200 | Probar un producto: proveedor, lista, probar otro, quitar, medidas | Existía, se conserva |  |
| 201 | Panel de prueba: subir el arte de un producto, mostrar al proveedor, encuadrar esta cara, guardar / reemplazar / olvidar la vista | Existía, se conserva |  |
| 202 | Rejillas a mano (automáticas, de fábrica, a mano; por entrepaño; surtido) — plegado | Existía, se conserva |  |
| 203 | Bajar imagen (PNG) o propuesta (antes y después) | Existía, se conserva |  |
| 204 | Mueble elegido: rotar (R), espejar (F), eliminar (Supr), nombre con intercambio; misma ficha del espacio con Encuadrar y Rotar | Existía, se conserva |  |
| 205 | Colocar muebles desde el catálogo y leyenda de estados | Existía, se conserva |  |
| 206 | «Más»: limpiar todo el 3D (con confirmación) | Existía, se conserva |  |

## Plano de la sede › Distribución de una cara por participación

| # | Función | Estado | Nota |
|---|---|---|---|
| 207 | Cara A/B; Ver en 3D / Volver a ubicar; centrar la cara; miniatura «Así queda en 3D» | Existía, se conserva |  |
| 208 | Arrastrar piezas; forma Franja · Estantes · A mano; trazo (borrar puntos, rehacer); «Acomodar solas» | Existía, se conserva |  |
| 209 | Menú de una pieza: achicar a / dejar en X %, primer hueco libre, a la izquierda / derecha, sacar de la cara | Existía, se conserva |  |
| 210 | Menú de una pieza: renovar el contrato, pasar a contrato, cambiar o cancelar la reserva | Existía, se conserva |  |
| 211 | Formulario de participación (reserva provisional o contrato) | Existía, se conserva |  |
| 212 | «Listo, guardar la cara» con resumen; salir guardando o no | Existía, se conserva |  |
| 213 | «Más»: deshacer, rehacer, copiar de la otra cara, qué pasó con esta cara (historial), sacar todas las piezas, descartar mis cambios o el borrador | Existía, se conserva |  |
| 214 | Pasar el mueble a participación | Existía, se conserva |  |
| 215 | Recuperar lo que no se guardó · conflicto con otra persona («Traer lo nuevo / Usar lo mío») | Existía, se conserva |  |

## Planograma › Planificar la cara

| # | Función | Estado | Nota |
|---|---|---|---|
| 216 | Encabezado: código, cara, medidas, estantes; «Borrador guardado» (se guarda solo a los 20 s) | Existía, se conserva |  |
| 217 | Destinos de la cara con su tipo y su % | Existía, se conserva |  |
| 218 | Agregar destino: nombre, tipo (marca propia, categoría, producto o grupo, promoción, otro), %, cómo se monta, código en tu sistema, guardarlo en los destinos de la sede | Existía, se conserva |  |
| 219 | Arrastrar cada destino a la cara; forma Franja · Estantes · A mano; estirar sin cambiar el %; «Acomodar solos» | Existía, se conserva |  |
| 220 | Menú del destino: cambiar destino, quitar de la cara, ubicar o achicar | Existía, se conserva |  |
| 221 | Usar lo disponible con un destino (en muebles que se venden; lo vendido en gris, con candado) | Existía, se conserva |  |
| 222 | Revisión antes de publicar: 100 % asignado, sin superposiciones, cada destino con su % exacto, sin pisar lo vendido | Existía, se conserva |  |
| 223 | «Más»: deshacer, rehacer, vaciar, descartar mis cambios o el borrador | Existía, se conserva |  |
| 224 | Salir (pregunta si hay cambios) | Existía, se conserva |  |

## Planograma › Publicar versión

| # | Función | Estado | Nota |
|---|---|---|---|
| 225 | Rige desde (hoy o futura) y hasta (opcional, para una promoción) | Existía, se conserva |  |
| 226 | Qué cambia contra la versión vigente | Existía, se conserva |  |
| 227 | Publicar versión N (una publicada no se cambia: se reemplaza) | Existía, se conserva |  |
| 228 | Después de publicar: Ver e imprimir la guía · Mandarla a quien corresponde | Existía, se conserva |  |

## Planograma › Versiones

| # | Función | Estado | Nota |
|---|---|---|---|
| 229 | Lista de versiones: programada, vigente (o vencida hace N días), reemplazada | Existía, se conserva |  |
| 230 | Estado por versión: sin montar, montada y falta revisar, no se pudo, coincide, no coincide | Existía, se conserva |  |
| 231 | Ver una versión sin poder cambiarla · abrir su guía · abrir su revisión | Existía, se conserva |  |
| 232 | Quién planifica y publica: sólo administración, o también el equipo en muebles internos | Hecho | También en Ajustes › Equipo. |

## Planograma › Guía de montaje

| # | Función | Estado | Nota |
|---|---|---|---|
| 233 | Encabezado: sede, código y cara, versión y vigencia, aviso si no es la de hoy | Existía, se conserva |  |
| 234 | Paso 1 · Qué cambia contra la versión anterior | Existía, se conserva |  |
| 235 | Paso 2 · Qué va dónde: la cara con cada destino numerado, estantes contados desde arriba, regla en cm, una ficha por destino, vacíos a propósito, lo ya asignado sin marcas | Existía, se conserva |  |
| 236 | Paso 3 · Al terminar: casillas y firma | Existía, se conserva |  |
| 237 | Imprimir (A4, paleta propia para blanco y negro) | Existía, se conserva |  |
| 238 | Mandarla a quien corresponde (responsable de montaje de la sede, administración, otros correos), sin precios | Existía, se conserva |  |
| 239 | Copiar el enlace | Existía, se conserva |  |

## Montajes › Lista de montajes

| # | Función | Estado | Nota |
|---|---|---|---|
| 240 | Filtros: Todos · Sin montar · Montado, sin verificar · No realizado · Verificado, con conteo | Hecho |  |
| 241 | Ver como Lista · En el plano | No hecho | No hay «Ver en el plano» en Montajes. |
| 242 | Por fila: espacio o cara, clase (contrato o planograma), proveedor o versión, inicio, estado preciso | Hecho |  |
| 243 | Estados precisos: sin montar · falta planometría · falta zona · aviso enviado · montado, sin verificar · no realizado (con motivo) · verificado: coincide · verificado: no coincide | Hecho |  |
| 244 | Acción por fila: Ver registro y foto · Verificar montaje · Ubicar la zona · Adjuntar planometría · Ver aviso · Ver historial | Parcial | Registrar, verificar, resolver, adjuntar planometría y ubicar la zona; sin «Ver aviso» ni «Ver historial» por fila. |
| 245 | Para el responsable de montaje: la misma lista sin importes, con «Registrar montaje» | Hecho |  |
| 246 | Resumen de montajes (enlace a Indicadores) | Hecho |  |

## Montajes › Aviso de montaje en el teléfono

| # | Función | Estado | Nota |
|---|---|---|---|
| 247 | Enlace del correo, sin montos; abre ese espacio directamente | Existía, se conserva |  |
| 248 | Lista «Para montar hoy» ordenada por urgencia (lo que ya empezó primero) | Existía, se conserva |  |
| 249 | Mapa de la sede con el mueble señalado y la ubicación escrita | Existía, se conserva |  |
| 250 | Planometría del contrato; en una participación, sólo su zona | Existía, se conserva |  |
| 251 | «Entrar a RECABRA» si tiene cuenta | Existía, se conserva |  |

## Montajes › Registrar montaje

| # | Función | Estado | Nota |
|---|---|---|---|
| 252 | «Registrar montaje (tomar foto)»: cámara o galería | Existía, se conserva |  |
| 253 | Montaje realizado · No realizado | Existía, se conserva |  |
| 254 | Motivo obligatorio si no se pudo: el proveedor no entregó el material, no llegó el producto, el espacio está ocupado por otra cosa, otro motivo | Existía, se conserva |  |
| 255 | Quién registra y nota opcional | Existía, se conserva |  |
| 256 | Confirmar registro · Corregir lo que acabo de registrar | Existía, se conserva |  |

## Montajes › Guía de montaje por enlace

| # | Función | Estado | Nota |
|---|---|---|---|
| 257 | Marcar cada número como «Listo» | Existía, se conserva |  |
| 258 | «¿Cómo quedó?»: Quedó montada (foto opcional) · No se pudo (motivo y nota) | Existía, se conserva |  |
| 259 | Aviso arriba si hay que corregir («el 2 y el 3 quedaron mal») | Existía, se conserva |  |
| 260 | Imprimir la hoja | Existía, se conserva |  |

## Montajes › Verificar el montaje de un contrato

| # | Función | Estado | Nota |
|---|---|---|---|
| 261 | Planometría al lado de la foto del montaje, con fecha, hora, quién registró y nota | Hecho |  |
| 262 | Coincide | Hecho |  |
| 263 | No coincide: nota de qué corregir y reenviar el aviso de montaje | Hecho |  |
| 264 | Queda quién verificó y cuándo | Hecho |  |

## Montajes › Verificar el montaje de un planograma

| # | Función | Estado | Nota |
|---|---|---|---|
| 265 | Lo planificado (la cara de la guía con sus números) al lado de las fotos nuevas | Existía, se conserva |  |
| 266 | Sí, coincide · sin foto nueva: «Lo vi en la tienda: coincide» | Existía, se conserva |  |
| 267 | No coincide: tocar los números que quedaron mal u «otra cosa», qué hay que corregir, mandar la guía de nuevo | Existía, se conserva |  |
| 268 | Historia de la versión (avisos y revisiones) | Existía, se conserva |  |

## Montajes › Resolver un montaje no realizado

| # | Función | Estado | Nota |
|---|---|---|---|
| 269 | Ver el registro, el motivo y la foto | Hecho |  |
| 270 | Según el motivo: reclamar al proveedor, liberar el espacio ocupado, reenviar el aviso con nueva fecha | Parcial | Dice qué hacer según el motivo y deja registrar de nuevo; no reclama ni libera desde ahí. |
| 271 | Vuelve a «sin montar» o se cierra | Parcial | Registrar de nuevo lo saca de «No realizado»; no hay «cerrar» sin registrar. |

## Ajustes › Comercial

| # | Función | Estado | Nota |
|---|---|---|---|
| 272 | Tarifas: canon mensual de referencia por tipo de mueble, general y por sede; se guarda solo | Existía, se conserva | Ahora se abren desde Ajustes › Comercial (y Ctrl K, «Más»). |
| 273 | Temporadas: fechas de cada temporada, días antes y después, «se vende», volver al valor sugerido | Existía, se conserva | Ahora se abren desde Ajustes › Comercial (y Ctrl K, «Más»). |
| 274 | Metas por sede: ocupación y canon ÷ tarifa, con sus umbrales (nuevo) | Hecho |  |

## Ajustes › Sede y plano

| # | Función | Estado | Nota |
|---|---|---|---|
| 275 | Sedes: crear, renombrar, eliminar (con confirmación) | Hecho | Con los mismos diálogos del Plano. |
| 276 | Nombres de los muebles: cómo se llama cada familia en este supermercado | Existía, se conserva |  |
| 277 | Ordenar códigos (renumerar): alcance todas o una sede, recalcular, imprimir el informe, aplicar | Existía, se conserva | Ahora enlazados desde Ajustes › Sede y plano. |
| 278 | Catálogo de muebles propios (hoy /taller): crear, editar, retirar o reactivar fichas; mirar un mueble girable con carta de color; cómo se vende cada ficha | Existía, se conserva | Ahora enlazados desde Ajustes › Sede y plano. |

## Ajustes › Avisos

| # | Función | Estado | Nota |
|---|---|---|---|
| 279 | Destinatarios y recordatorios: correos, días de recordatorio antes del vencimiento | Existía, se conserva |  |
| 280 | Enviar correo de prueba | Existía, se conserva |  |
| 281 | Responsables por sede: comercial, administración y montaje | Parcial | Por sede: administración y montaje; comercial es el gerente, uno para todas. |

## Ajustes › Equipo

| # | Función | Estado | Nota |
|---|---|---|---|
| 282 | Usuarios: invitar por correo con rol (Trabajador, Administrador, Dueño), lo que puede cada rol escrito al lado | Existía, se conserva |  |
| 283 | Ver miembros e invitaciones pendientes, con último ingreso y vencimiento | Existía, se conserva |  |
| 284 | Activar o desactivar un miembro | Existía, se conserva |  |
| 285 | Permisos: quién planifica y publica planogramas (hoy sin pantalla) | Hecho |  |

## Ajustes › Cuenta

| # | Función | Estado | Nota |
|---|---|---|---|
| 286 | Suscripción y facturación: estado, lo pactado, próxima cuenta de cobro, cómo pagar, pagos registrados; datos de facturación | Existía, se conserva |  |
| 287 | Copia de seguridad (ZIP de todo) | Existía, se conserva |  |
| 288 | Mis datos: descargarlos y solicitar la supresión | Existía, se conserva |  |
| 289 | Reporte de transparencia (imprimir, PDF, JSON) | Existía, se conserva | En Ajustes › Cuenta › Mis datos. |
| 290 | Bitácora: filtro por acción, actualizar | Existía, se conserva |  |
| 291 | Configuración inicial: volver a mostrarla | Hecho |  |

## Sin cambios y decisiones abiertas

| # | Función | Estado | Nota |
|---|---|---|---|
| 292 | Metas: 90 % de ocupación y 95 % de canon ÷ tarifa (ámbar por debajo; rojo bajo 80 % y 85 %), ¿o por sede? | Decidido | 90 % y 95 % de fábrica, editables por sede en Ajustes. |
| 293 | Nombres del menú: Contratos · Indicadores · Montajes · Plano de la sede (y si «Vender» se conserva) | Decidido | Inicio · Contratos · Indicadores · Montajes · Plano de la sede · Ajustes; «Vender» queda como el modo de Contratos. |
| 294 | Importes completos, sin abreviar «M» | Decidido | Importes completos en todo el sistema (el barrido lo vigila). |
| 295 | Orden de implementación (propuesta: Contratos con fechas primero, junto con el Resumen de Indicadores) | Decidido | Se hizo en etapas 0–9. |
| 296 | Una persona nueva que pruebe la primera etapa | No hecho | Pendiente: una persona nueva que pruebe. |
