/**
 * Perfiles de lámina plegada, como geometría extruida.
 *
 * **Por qué esto existe.** Todo el mobiliario del editor estaba hecho de
 * `boxGeometry`. Mientras una pieza sea una caja no hay forma de tener un
 * labio, un pliegue, un gancho ni una ranura — y son justamente esos cuatro
 * detalles los que hacen que el ojo lea «mueble de tienda» en lugar de
 * «primitiva de Three.js». No es un problema de material ni de luz: con una
 * caja no hay nada que iluminar.
 *
 * Un entrepaño de góndola es una lámina de ~1 mm doblada: sube en un labio
 * adelante y en un gancho atrás. Dibujada su SECCIÓN y extruida a lo ancho,
 * sale en una sola malla, con el pliegue de verdad.
 *
 * Todas las geometrías se cachean por firma: una góndola de seis niveles con
 * la misma profundidad reusa la misma geometría seis veces, y un corrido de
 * diez módulos reusa el mismo parante diez veces.
 */
import * as THREE from "three";
import { ENTREPANO, PANEL_FONDO, PARANTE, REMATE } from "./medidas";

/** Caché de geometrías por firma. Se vacía sola al recargar; no hace falta
 *  invalidarla porque la firma incluye todos los parámetros que la definen. */
const cache = new Map<string, THREE.BufferGeometry>();

function cacheada(firma: string, construir: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const ya = cache.get(firma);
  if (ya) return ya;
  const nueva = construir();
  cache.set(firma, nueva);
  return nueva;
}

/**
 * La sección de un entrepaño, extruida a lo ancho.
 *
 * La sección se dibuja en el plano XY —X es el fondo, Y es el alto— y se
 * extruye en Z, que es el ancho del mueble. Recorrido del contorno:
 *
 *        gancho                                    labio
 *        ┌─┐                                        ┌─┐
 *        │ │                                        │ │
 *        │ └────────────────────────────────────────┘ │
 *        └────────────────────────────────────────────┘
 *        atrás                                    adelante
 *
 * El resultado queda centrado en el ancho y con el plano de apoyo en y = 0,
 * que es donde se para el producto.
 */
export function geometriaEntrepano(ancho: number, fondo: number): THREE.BufferGeometry {
  const t = ENTREPANO.espesor;
  const labio = ENTREPANO.labio;
  const gancho = ENTREPANO.gancho;
  const firma = `entrepano:${ancho.toFixed(4)}:${fondo.toFixed(4)}`;

  return cacheada(firma, () => {
    const s = new THREE.Shape();
    // Cara inferior, de atrás hacia adelante.
    s.moveTo(0, -t);
    s.lineTo(fondo, -t);
    // Sube el labio por fuera.
    s.lineTo(fondo, labio);
    s.lineTo(fondo - t, labio);
    // Baja por dentro del labio hasta el plano de apoyo.
    s.lineTo(fondo - t, 0);
    // Vuelve por el plano de apoyo hasta el gancho.
    s.lineTo(t, 0);
    // Sube el gancho trasero.
    s.lineTo(t, gancho);
    s.lineTo(0, gancho);
    s.closePath();

    const g = new THREE.ExtrudeGeometry(s, {
      depth: ancho,
      bevelEnabled: true,
      // Un bisel diminuto: los cantos de lámina real nunca son de 90° exactos,
      // y ese medio milímetro es el que atrapa el brillo que delata el pliegue.
      bevelThickness: 0.0004,
      bevelSize: 0.0004,
      bevelSegments: 1,
    });
    // Extruye en +Z desde 0: se centra a lo ancho y se orienta para que X sea
    // el fondo del mueble.
    g.translate(0, 0, -ancho / 2);
    g.rotateY(Math.PI / 2);
    g.computeVertexNormals();
    return g;
  });
}

/**
 * El parante: un perfil en C, extruido en altura.
 *
 * Es una columna de lámina plegada, no un tubo macizo. La cara ranurada mira
 * hacia el pasillo —es donde enganchan los entrepaños y donde se ven los
 * calados— y las alas de la C vuelven hacia adentro, contra el panel de fondo.
 */
export function geometriaParante(alto: number): THREE.BufferGeometry {
  const a = PARANTE.ancho;
  const f = PARANTE.fondo;
  const t = PARANTE.espesor;
  const firma = `parante:${alto.toFixed(4)}`;

  return cacheada(firma, () => {
    const s = new THREE.Shape();
    // La cara entera —la que lleva los calados— se dibuja en +Y, que después
    // de rotar queda mirando hacia AFUERA del mueble. Las alas de la C vuelven
    // hacia adentro, contra el panel de fondo.
    s.moveTo(-a / 2, f / 2);
    s.lineTo(a / 2, f / 2);
    s.lineTo(a / 2, -f / 2);
    s.lineTo(a / 2 - t, -f / 2);
    s.lineTo(a / 2 - t, f / 2 - t);
    s.lineTo(-a / 2 + t, f / 2 - t);
    s.lineTo(-a / 2 + t, -f / 2);
    s.lineTo(-a / 2, -f / 2);
    s.closePath();

    const g = new THREE.ExtrudeGeometry(s, {
      depth: alto,
      bevelEnabled: true,
      bevelThickness: 0.0005,
      bevelSize: 0.0005,
      bevelSegments: 1,
    });
    // Extruido en +Z; se rota para que la altura quede en +Y desde la base, y
    // se corre para que el perfil ocupe z ∈ [-fondo, 0] igual que el resto de
    // las piezas de la cara: apoyado en el plano de montaje, creciendo hacia
    // el pasillo.
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -f / 2);
    g.computeVertexNormals();
    return g;
  });
}

/**
 * El porta-precios: la tira del canto del entrepaño.
 *
 * Sección en L, para que la cara de la etiqueta quede inclinada hacia arriba
 * —así se lee desde la altura de los ojos— en vez de vertical.
 */
export function geometriaPortaPrecios(ancho: number, alto: number): THREE.BufferGeometry {
  const firma = `precios:${ancho.toFixed(4)}:${alto.toFixed(4)}`;
  const t = 0.0015;

  return cacheada(firma, () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.006, 0);
    s.lineTo(0.008, alto);
    s.lineTo(0.008 - t, alto);
    s.lineTo(0.006 - t, t);
    s.lineTo(0, t);
    s.closePath();

    const g = new THREE.ExtrudeGeometry(s, { depth: ancho, bevelEnabled: false });
    g.translate(0, 0, -ancho / 2);
    g.rotateY(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  });
}

/**
 * Un listón del panel de fondo, con el canto de abajo plegado.
 *
 * El panel ranurado no es una chapa con rayas: son listones horizontales
 * separados unos de otros, montados por delante de un respaldo. La luz entre
 * listón y listón ES la ranura —por ahí entran los ganchos— y como el listón
 * vuela unos milímetros, esa luz tira sombra propia. Ésa es la diferencia
 * entre una ranura y una raya pintada, y es lo único que da escala al mueble
 * cuando se lo mira desde la otra punta del pasillo.
 *
 * La sección se dibuja en XY —X es el alto del listón, Y su espesor— y se
 * extruye a lo ancho del vano.
 */
export function geometriaLama(ancho: number, alto: number): THREE.BufferGeometry {
  const t = 0.0022;
  const firma = `lama:${ancho.toFixed(4)}:${alto.toFixed(4)}`;

  return cacheada(firma, () => {
    const h = alto / 2;
    const s = new THREE.Shape();
    // Cara vista, y los dos cantos volviendo hacia el respaldo.
    s.moveTo(-h, 0);
    s.lineTo(h, 0);
    s.lineTo(h, t * 2);
    s.lineTo(h - t, t * 2);
    s.lineTo(h - t, t);
    s.lineTo(-h + t, t);
    s.lineTo(-h + t, t * 2);
    s.lineTo(-h, t * 2);
    s.closePath();

    const g = new THREE.ExtrudeGeometry(s, { depth: ancho, bevelEnabled: false });
    g.translate(0, 0, -ancho / 2);
    // El alto pasa a Y, el ancho a X y el espesor a -Z: apoyado en el plano de
    // montaje y creciendo hacia el pasillo, como todas las piezas de la cara.
    g.rotateZ(Math.PI / 2);
    g.rotateY(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  });
}

/** El respaldo del panel: la chapa lisa que se ve por las ranuras. Va oscura
 *  porque lo que se ve ahí es sombra, no chapa iluminada. */
export function geometriaRespaldo(ancho: number, alto: number): THREE.BufferGeometry {
  return cacheada(`respaldo:${ancho.toFixed(4)}:${alto.toFixed(4)}`, () => {
    const g = new THREE.BoxGeometry(ancho, alto, PANEL_FONDO.espesor);
    g.translate(0, 0, -PANEL_FONDO.espesor / 2);
    return g;
  });
}

/**
 * El remate superior: chapa plegada en U invertida que tapa el canto de arriba.
 *
 * Sección en XY —X es el fondo, Y el alto— extruida a lo ancho, igual que el
 * entrepaño. Vuelca hacia el frente, que es donde en tienda va el cartel.
 */
export function geometriaRemate(ancho: number, saliente: number): THREE.BufferGeometry {
  const t = 0.0015;
  const alto = REMATE.alto;
  const firma = `remate:${ancho.toFixed(4)}:${saliente.toFixed(4)}`;

  return cacheada(firma, () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(-saliente, 0);
    s.lineTo(-saliente, -alto);
    s.lineTo(-saliente + t, -alto);
    s.lineTo(-saliente + t, -t);
    s.lineTo(0, -t);
    s.closePath();

    const g = new THREE.ExtrudeGeometry(s, { depth: ancho, bevelEnabled: false });
    g.translate(0, 0, -ancho / 2);
    g.rotateY(Math.PI / 2);
    g.computeVertexNormals();
    return g;
  });
}

/**
 * El marco del copete de una punta: perfil en U que envuelve la chapa impresa.
 *
 * El copete es lo que el proveedor compra cuando compra una punta: se ve de
 * frente desde todo el pasillo transversal. Un cartel modelado como una caja
 * plana se lee como una etiqueta pegada; lo que lo hace leer como cartelería
 * es el MARCO, que sobresale unos milímetros de la cara impresa y le tira una
 * sombra propia alrededor.
 *
 * La sección se dibuja en XY —X es el fondo, Y el alto— y se extruye a lo
 * ancho, igual que el entrepaño.
 */
export function geometriaMarcoDeCopete(
  ancho: number, alto: number, fondo: number,
): THREE.BufferGeometry {
  const t = 0.008;          // espesor del marco
  const rebaje = 0.006;     // cuánto se hunde la cara impresa dentro del marco
  const firma = `copete:${ancho.toFixed(4)}:${alto.toFixed(4)}:${fondo.toFixed(4)}`;

  return cacheada(firma, () => {
    const h = alto / 2;
    const s = new THREE.Shape();
    // Contorno exterior, de atrás hacia adelante por abajo.
    s.moveTo(0, -h);
    s.lineTo(-fondo, -h);
    s.lineTo(-fondo, -h + t);
    // Escalón donde apoya la chapa impresa.
    s.lineTo(-fondo + rebaje, -h + t);
    s.lineTo(-fondo + rebaje, h - t);
    s.lineTo(-fondo, h - t);
    s.lineTo(-fondo, h);
    s.lineTo(0, h);
    s.closePath();

    const g = new THREE.ExtrudeGeometry(s, { depth: ancho, bevelEnabled: false });
    g.translate(0, 0, -ancho / 2);
    g.rotateY(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  });
}

/**
 * El marco de una puerta de nevera: un anillo rectangular extruido.
 *
 * Una nevera de refrescos SIN puerta no se lee como nevera: se lee como una
 * estantería pintada de oscuro. Y una puerta modelada como una placa de vidrio
 * suelta tampoco, porque lo que el ojo reconoce es el MARCO — el perfil de
 * aluminio ancho que rodea el vidrio, con su propia sombra contra el cuerpo.
 * El vidrio, en cambio, casi no se ve.
 *
 * Se dibuja como un rectángulo con un agujero rectangular adentro, así que
 * sale en una sola malla en vez de cuatro barras a las que hay que cuidarles
 * las esquinas.
 */
export function geometriaMarcoDePuerta(
  ancho: number, alto: number, marco: number, fondo: number,
): THREE.BufferGeometry {
  const firma = `puerta:${ancho.toFixed(4)}:${alto.toFixed(4)}:${marco.toFixed(4)}:${fondo.toFixed(4)}`;

  return cacheada(firma, () => {
    const s = new THREE.Shape();
    s.moveTo(-ancho / 2, -alto / 2);
    s.lineTo(ancho / 2, -alto / 2);
    s.lineTo(ancho / 2, alto / 2);
    s.lineTo(-ancho / 2, alto / 2);
    s.closePath();

    const hueco = new THREE.Path();
    const hx = Math.max(0.01, ancho / 2 - marco);
    const hy = Math.max(0.01, alto / 2 - marco);
    hueco.moveTo(-hx, -hy);
    hueco.lineTo(-hx, hy);
    hueco.lineTo(hx, hy);
    hueco.lineTo(hx, -hy);
    hueco.closePath();
    s.holes.push(hueco);

    const g = new THREE.ExtrudeGeometry(s, {
      depth: fondo,
      bevelEnabled: true,
      // Un bisel chico en el canto del aluminio: es donde se engancha el
      // brillo que hace que el marco se separe del vidrio.
      bevelThickness: 0.0012,
      bevelSize: 0.0012,
      bevelSegments: 1,
    });
    // Nace extruido en +Z; se corre para que ocupe z ∈ [-fondo, 0], igual que
    // el resto de las piezas: apoyado en su plano y creciendo hacia el pasillo.
    g.translate(0, 0, -fondo);
    g.computeVertexNormals();
    return g;
  });
}

/**
 * El casco de un canasto: cuatro paredes inclinadas, más anchas arriba que
 * abajo.
 *
 * Es la forma de una batea de promoción, y no es un capricho de diseño: el
 * canasto se hace en tronco de pirámide para que se pueda apilar vacío, y esa
 * inclinación es justo lo que el ojo usa para distinguir una batea de un
 * cajón. Con paredes rectas se lee como una caja; con la boca más ancha que el
 * fondo se lee como algo en lo que se hurga.
 *
 * Se arma a mano con los ocho vértices en vez de deformar un cilindro de
 * cuatro lados, que es el atajo: el cilindro mide su radio a los VÉRTICES, así
 * que las caras planas quedan metidas un 29 % y el mueble sale más chico que
 * las cotas que pidió el plano.
 */
export function geometriaCanasto(
  anchoArriba: number, fondoArriba: number,
  anchoAbajo: number, fondoAbajo: number,
  alto: number,
): THREE.BufferGeometry {
  const firma = `canasto:${anchoArriba.toFixed(3)}:${fondoArriba.toFixed(3)}:` +
                `${anchoAbajo.toFixed(3)}:${fondoAbajo.toFixed(3)}:${alto.toFixed(3)}`;
  return cacheada(firma, () => cascoDeTronco(anchoArriba, fondoArriba, anchoAbajo, fondoAbajo, alto));
}

/** El casco, SIN cachear. Quien necesite moverlo o escalarlo tiene que partir
 *  de acá: las geometrías del caché son compartidas, y un `translate` sobre
 *  una de ellas se lo lleva puesto a todos los muebles que la usan. */
function cascoDeTronco(
  anchoArriba: number, fondoArriba: number,
  anchoAbajo: number, fondoAbajo: number,
  alto: number,
): THREE.BufferGeometry {
  {
    const aa = anchoArriba / 2, fa = fondoArriba / 2;
    const ab = anchoAbajo / 2, fb = fondoAbajo / 2;
    // Abajo (y = 0) y arriba (y = alto), en sentido antihorario visto de arriba.
    const abajo: [number, number, number][] = [
      [-ab, 0, -fb], [ab, 0, -fb], [ab, 0, fb], [-ab, 0, fb],
    ];
    const arriba: [number, number, number][] = [
      [-aa, alto, -fa], [aa, alto, -fa], [aa, alto, fa], [-aa, alto, fa],
    ];

    const pos: number[] = [];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const [a, b, c, d] = [abajo[i], abajo[j], arriba[j], arriba[i]];
      // Dos triángulos por pared, con la normal hacia AFUERA.
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }
}

/**
 * La geometría de un envase, según su FORMA.
 *
 * ## Por qué esto no podía seguir siendo una caja
 *
 * Todo el producto del sistema se dibujaba como `BoxGeometry` escalada. Con
 * eso, un lineal de gaseosas es una pared de ladrillos y una nevera de bebidas
 * se ve como un archivador. **La silueta es lo primero que el ojo clasifica**,
 * antes que el color y mucho antes que la etiqueta: un cilindro con cuello se
 * lee «botella» a diez metros, y un prisma no se lee como nada.
 *
 * `Empaque.forma` ya traía el dato —«botella», «lata», «pieza»— desde que se
 * armó el catálogo de empaques. No se usaba: todo terminaba en el mismo cubo.
 *
 * ## Por qué tan pocos segmentos
 *
 * Una góndola llena son cientos de envases, y van instanciados. Con 10 lados
 * un cilindro de 6 cm de diámetro ya se lee redondo a distancia de pasillo, y
 * cada lado que se agrega se multiplica por esos cientos. La fruta usa un
 * icosaedro y no una esfera por lo mismo, y de paso queda facetada, que es
 * más parecido a una manzana que una bola perfecta.
 */
export function geometriaDeEmpaque(
  forma: "caja" | "botella" | "lata" | "bolsa" | "pieza" | "bandeja",
  ancho: number, alto: number, fondo: number,
  acostado = false,
): THREE.BufferGeometry {
  const firma = `empaque:${forma}:${ancho.toFixed(4)}:${alto.toFixed(4)}:${fondo.toFixed(4)}:${acostado}`;

  return cacheada(firma, () => {
    // Un envase acostado se dibuja DE PIE y se gira, no se achata: una botella
    // tumbada sigue teniendo cuello, y con 9 cm de alto sale un disco.
    if (acostado && (forma === "botella" || forma === "lata")) {
      const g = geometriaDeEmpaque(forma, alto, ancho, fondo).clone();
      g.rotateZ(Math.PI / 2);
      g.computeVertexNormals();
      return g;
    }
    const r = Math.min(ancho, fondo) / 2;

    if (forma === "botella") {
      // Perfil de media botella, de abajo hacia arriba: base, cuerpo recto,
      // hombro, cuello y tapa. Girado da el envase entero en una sola malla.
      const cuello = r * 0.42;
      const perfil: THREE.Vector2[] = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(r * 0.92, 0),
        new THREE.Vector2(r, alto * 0.04),
        new THREE.Vector2(r, alto * 0.62),
        new THREE.Vector2(r * 0.96, alto * 0.70),
        // El hombro: la curva que lleva del cuerpo al cuello. Es lo que hace
        // que se lea botella y no tubo.
        new THREE.Vector2(r * 0.72, alto * 0.80),
        new THREE.Vector2(cuello, alto * 0.86),
        new THREE.Vector2(cuello, alto * 0.93),
        new THREE.Vector2(cuello * 1.18, alto * 0.94),
        new THREE.Vector2(cuello * 1.18, alto),
        new THREE.Vector2(0, alto),
      ];
      const g = new THREE.LatheGeometry(perfil, 10);
      g.translate(0, -alto / 2, 0);
      g.computeVertexNormals();
      return g;
    }

    if (forma === "lata") {
      // Cuerpo recto con los dos cantos rebajados: una lata no es un cilindro
      // a secas, tiene el reborde de la tapa y el pie engargolado.
      const perfil: THREE.Vector2[] = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(r * 0.86, 0),
        new THREE.Vector2(r, alto * 0.06),
        new THREE.Vector2(r, alto * 0.94),
        new THREE.Vector2(r * 0.86, alto),
        new THREE.Vector2(0, alto),
      ];
      const g = new THREE.LatheGeometry(perfil, 10);
      g.translate(0, -alto / 2, 0);
      g.computeVertexNormals();
      return g;
    }

    if (forma === "pieza") {
      // Una manzana, un tomate, una papa. Facetada a propósito: una esfera
      // perfecta se lee como una bola de billar.
      const g = new THREE.IcosahedronGeometry(0.5, 1);
      g.scale(ancho, alto * 1.05, fondo);
      g.computeVertexNormals();
      return g;
    }

    if (forma === "bandeja") {
      // Bandeja de carne o fiambre: el film estirado arriba queda abombado, y
      // ese lomo es lo que la distingue de una caja plana.
      const g = new THREE.SphereGeometry(0.5, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      g.scale(ancho, alto * 1.6, fondo);
      g.translate(0, -alto / 2, 0);
      g.computeVertexNormals();
      return g;
    }

    if (forma === "bolsa") {
      // Una bolsa de snack va inflada y más ancha arriba que abajo, que es por
      // donde la sueldan.
      const g = cascoDeTronco(ancho, fondo, ancho * 0.62, fondo * 0.62, alto);
      g.translate(0, -alto / 2, 0);
      return g;
    }

    return new THREE.BoxGeometry(ancho, alto, fondo);
  });
}

/**
 * El vidrio curvo de un mostrador de carnes o de fiambres.
 *
 * Es LA pieza que identifica un mostrador de servicio. Un panel de vidrio
 * plano y vertical lo convierte en una vitrina cualquiera; lo que dice
 * «carnicería» a diez metros es esa curva que arranca casi horizontal sobre la
 * bandeja y se levanta hacia el cliente, porque es la que deja ver el producto
 * desde arriba mientras lo protege.
 *
 * El perfil se dibuja como un arco en XY —X es el vuelo hacia el cliente, Y el
 * alto— y se extruye a lo ancho del mueble, igual que el entrepaño. El arco se
 * hace con dos curvas paralelas separadas por el espesor, y no con una curva
 * sola: un vidrio sin canto no atrapa luz en el borde y se ve como una
 * calcomanía.
 */
export function geometriaVidrioCurvo(
  ancho: number, alto: number, vuelo: number, espesor = 0.006,
): THREE.BufferGeometry {
  // El espesor va en la firma: los montantes negros del vidrio son ESTE mismo
  // arco, angosto y grueso. Sin el espesor en la clave, el primero que se
  // dibuja se queda con la ranura del caché y el otro sale con su espesor.
  const firma =
    `vidriocurvo:${ancho.toFixed(4)}:${alto.toFixed(4)}:${vuelo.toFixed(4)}:${espesor.toFixed(4)}`;

  return cacheada(firma, () => {
    const PASOS = 12;
    // El arco: arranca al frente y abajo, y termina arriba y atrás. Se usa un
    // cuarto de elipse, que es la forma del vidrio templado que se fabrica.
    const punto = (t: number, desfase: number) => {
      const a = (t * Math.PI) / 2;
      return new THREE.Vector2(
        -(vuelo + desfase) * Math.cos(a) + vuelo,
        (alto + desfase) * Math.sin(a),
      );
    };

    const s = new THREE.Shape();
    const fuera: THREE.Vector2[] = [];
    const dentro: THREE.Vector2[] = [];
    for (let i = 0; i <= PASOS; i++) {
      fuera.push(punto(i / PASOS, 0));
      dentro.push(punto(i / PASOS, -espesor));
    }
    s.moveTo(fuera[0].x, fuera[0].y);
    for (const p of fuera.slice(1)) s.lineTo(p.x, p.y);
    for (const p of dentro.slice().reverse()) s.lineTo(p.x, p.y);
    s.closePath();

    const g = new THREE.ExtrudeGeometry(s, { depth: ancho, bevelEnabled: false });
    g.translate(0, 0, -ancho / 2);
    g.rotateY(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  });
}

/**
 * La TAPA de vidrio que cierra el extremo de la bóveda de un mostrador.
 *
 * Con la bóveda sola el mueble queda abierto de costado: se ve el hueco frío
 * por dentro desde la punta, y el vidrio se lee como dos costillas negras
 * paradas en el aire. Lo que cierra el extremo es un paño plano recortado con
 * la misma curva del arco — el mismo perfil, pero relleno en vez de hueco.
 */
export function geometriaTapaDeVidrio(
  alto: number, vuelo: number, espesor = 0.006,
): THREE.BufferGeometry {
  const firma = `tapavidrio:${alto.toFixed(4)}:${vuelo.toFixed(4)}:${espesor.toFixed(4)}`;

  return cacheada(firma, () => {
    const PASOS = 12;
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    for (let i = 1; i <= PASOS; i++) {
      const a = (i / PASOS) * (Math.PI / 2);
      s.lineTo(-vuelo * Math.cos(a) + vuelo, alto * Math.sin(a));
    }
    // La esquina de atrás y abajo: el rincón que queda entre el arco, la
    // cubeta y el mueble de servicio.
    s.lineTo(vuelo, 0);
    s.closePath();

    const g = new THREE.ExtrudeGeometry(s, { depth: espesor, bevelEnabled: false });
    g.translate(0, 0, -espesor / 2);
    g.rotateY(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  });
}

/** La geometría de UNA ranura del parante. Se dibuja con `InstancedMesh`, así
 *  que un parante de 2 m con ranuras cada 25 mm son ~80 calados en una sola
 *  llamada de dibujo. */
export function geometriaRanura(): THREE.BufferGeometry {
  return cacheada("ranura", () =>
    new THREE.BoxGeometry(PARANTE.ranuraAncho, PARANTE.ranuraAlto, 0.004),
  );
}

/** Cuántas ranuras entran en un parante, y a qué altura va cada una. */
export function alturasDeRanura(alto: number): number[] {
  const paso = PARANTE.pasoRanura;
  const desde = 0.08;
  const hasta = alto - 0.05;
  const fuera: number[] = [];
  for (let y = desde; y <= hasta; y += paso) fuera.push(y);
  return fuera;
}

/** Suelta todas las geometrías cacheadas. La llama el desmontaje del editor:
 *  sin esto, cambiar de sede muchas veces deja geometrías vivas en la GPU. */
export function olvidarGeometrias(): void {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}
