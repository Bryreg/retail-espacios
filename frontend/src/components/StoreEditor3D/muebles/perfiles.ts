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
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ENTREPANO, PANEL_FONDO, PARANTE, REMATE } from "./medidas";
import { hashTexto } from "./producto";

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

/** Milímetros enteros: la firma del caché no puede depender del último bit. */
const mm = (v: number) => Math.round(v * 1000);

/** El perfil, muestreado a una altura relativa `f` (0 = abajo, 1 = arriba),
 *  interpolando entre las bandas. Sin perfil, un cilindro. */
function semianchoEn(perfil: readonly number[] | undefined, f: number): number {
  if (!perfil || perfil.length === 0) return 1;
  const x = Math.min(perfil.length - 1, Math.max(0, f * perfil.length - 0.5));
  const i = Math.floor(x);
  const j = Math.min(perfil.length - 1, i + 1);
  const t = x - i;
  return perfil[i] * (1 - t) + perfil[j] * t;
}

/** Proyección PLANAR del frente: la foto se ve tal cual desde −Z. La derecha
 *  de quien mira desde −Z es −X, por eso `u` crece hacia −X. */
function uvPlanar(g: THREE.BufferGeometry, ancho: number, alto: number): void {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = 0.5 - pos.getX(i) / ancho;
    uv[i * 2 + 1] = 0.5 + pos.getY(i) / alto;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/**
 * Una bolsa llena, parada: dos caras abombadas que se juntan en los cantos.
 *
 * La primera versión era una caja con el frente y el dorso inflados: los
 * costados quedaban como una losa, el lomo de un libro. Una bolsa de arroz
 * de verdad se afina a CERO en los costados —ahí está la costura—, tiene el
 * fondo apoyado (la base guarda espesor, si no se para en un filo) y arriba
 * un sello fino. El espesor es el producto de dos curvas:
 *
 * - a lo ancho, cos(π·s/2)^0,4: lleno en el medio, cero en los costados;
 * - a lo alto, 0,72 + 0,28·sen(π·t) —lleno en la mitad— que se afina desde
 *   los dos tercios hasta el sello (el 7 % de arriba), donde queda en 6 %.
 *
 * El dorso es un poco más chato que el frente (90 %): la bolsa se apoya
 * contra la de atrás. La foto va planar en las dos caras y, con alfa
 * (`materialDeEtiqueta`), recorta la silueta de la foto.
 */
function almohada(ancho: number, alto: number, fondo: number): THREE.BufferGeometry {
  const NX = 16, NY = 22, SELLO = 0.93;
  const aLoAlto = (t: number) => {
    if (t >= SELLO) return 0.06;
    // La panza llega a 1 justo en la mitad: el espesor de la ficha es el de
    // la bolsa llena en su parte más gorda.
    const panza = 0.72 + 0.28 * Math.sin(Math.PI * t);
    const a = t < 0.67 ? 0 : (t - 0.67) / (SELLO - 0.67);
    return Math.max(0.06, panza * (1 - 0.92 * a * a * (3 - 2 * a)));
  };
  // 0,4 y no 0,55: con la curva más cerrada la bolsa de 6 cm se veía de 3
  // desde el costado, una cartulina doblada; así queda llena hasta cerca de
  // la costura, como una bolsa de arroz de verdad.
  const aLoAncho = (s: number) => Math.pow(Math.max(0, Math.cos((s * Math.PI) / 2)), 0.4);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  // Filas de alto con más detalle cerca del sello.
  const ts = Array.from({ length: NY + 1 }, (_, j) => j / NY);
  ts.splice(ts.findIndex((t) => t > SELLO), 0, SELLO - 0.001);
  const fila = ts.length;
  for (const lado of [-1, 1] as const) {
    const k = lado < 0 ? 1 : 0.9;
    for (const t of ts) {
      for (let i = 0; i <= NX; i++) {
        const s = (i / NX) * 2 - 1;
        const x = (s * ancho) / 2, y = (t - 0.5) * alto;
        pos.push(x, y, lado * k * (fondo / 2) * aLoAlto(t) * aLoAncho(s));
        uv.push(0.5 - x / ancho, t);
      }
    }
  }
  const base = (lado: number, j: number, i: number) => (lado < 0 ? 0 : fila * (NX + 1)) + j * (NX + 1) + i;
  for (let j = 0; j < fila - 1; j++) {
    for (let i = 0; i < NX; i++) {
      // El frente mira a −Z y el dorso a +Z: el orden de los vértices cambia.
      const [a, b, c, d] = [base(-1, j, i), base(-1, j, i + 1), base(-1, j + 1, i), base(-1, j + 1, i + 1)];
      idx.push(a, c, b, b, c, d);
      const [e, f, g, h] = [base(1, j, i), base(1, j, i + 1), base(1, j + 1, i), base(1, j + 1, i + 1)];
      idx.push(e, f, g, f, h, g);
    }
  }
  // El fondo y el sello: las dos caras no se tocan ahí (tienen espesor), se
  // cosen con una tira.
  for (const j of [0, fila - 1]) {
    for (let i = 0; i < NX; i++) {
      const [a, b, c, d] = [base(-1, j, i), base(-1, j, i + 1), base(1, j, i), base(1, j, i + 1)];
      if (j === 0) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Cuántas facetas lleva un envase torneado, según dónde va.
 *
 * - «alto»: el FRENTE. 32 lados: a 150 px el borde se aparta del círculo
 *   menos de medio píxel (la toma «De cerca»).
 * - «bajo»: lo de ATRÁS. Desde el pasillo, de lo de atrás se ve la tapa
 *   oscurecida y un filo del costado entre dos del frente. Con 32 lados una
 *   góndola doble de 3,6 m con un vaso apilable eran 3.708 envases y 4,7 M de
 *   triángulos —sólo 1.260 al frente—, y una PC con video integrado que
 *   comparte pantalla en una videollamada giraba a tirones. Con 12 lados y
 *   pocas filas, lo de atrás cuesta menos que una sexta parte.
 */
export const DETALLE = {
  vaso: { alto: { filas: 16, lados: 32 }, bajo: { filas: 4, lados: 12 } },
  botella: { alto: { filas: 20, lados: 32 }, bajo: { filas: 8, lados: 12 } },
} as const;

/**
 * El envase del producto del proveedor, con la foto como etiqueta.
 *
 * ## Por qué cuatro formas
 *
 * La silueta es lo primero que el ojo clasifica: una lámina con la foto de un
 * vaso, de canto, es una cartulina. Pero tampoco hay un modelo 3D de cada
 * producto, ni lo va a haber. Lo que sí hay es la foto del frente y su
 * silueta, y con eso alcanza para cuatro formas que cubren el supermercado:
 *
 * - **caja** — una caja con la foto en el frente y el dorso, y un color
 *   liso en los cantos y la tapa (segundo material; ver
 *   `materialDeEtiqueta`): el borde de la foto estirado salía a rayas.
 * - **revolución** — botella, lata, vaso o frasco, TORNEADO con la silueta de
 *   la foto (`perfil`, de `recorte.ts`): la botella de la foto tiene su hombro
 *   y su cuello, y de costado sigue siendo una botella.
 * - **almohada** — una bolsa: dos caras abombadas que se afinan a cero en
 *   los costados, con el fondo apoyado y un sello fino arriba (`almohada`).
 * - **recorte** — el último recurso: la silueta recortada, plana.
 *
 * Todas van centradas en el origen y con la etiqueta mirando a −Z, la misma
 * convención de las piezas del mueble. La UV del frente es PLANAR: la foto es
 * una vista de frente, así que proyectada de frente queda en su lugar, y en
 * un cuerpo redondo se comprime hacia los costados como en uno de verdad.
 *
 * Va por el caché de geometrías; ninguna se muta. La acostada es la de pie
 * con las medidas cambiadas, CLONADA y girada: un envase acostado se gira, no
 * se achata (ver `geometriaDeEmpaque`).
 */
export function geometriaDeEtiqueta(
  envase: "caja" | "revolucion" | "almohada" | "recorte",
  ancho: number, alto: number, fondo: number,
  perfil?: readonly number[],
  acostado = false,
  /** Una botella: el pie se redondea (ver abajo). Un vaso o una lata no. */
  botella = false,
  /** Vaso o lata: qué parte de arriba de la foto es tapa y reborde
   *  (`tapaDeFoto`). El cuerpo se envuelve con lo de abajo y la tapa lleva
   *  su propio material (segundo grupo). */
  franjaDeTapa = 0,
  /** «bajo»: las unidades de ATRÁS de un envase torneado (ver `DETALLE`). */
  detalle: "alto" | "bajo" = "alto",
): THREE.BufferGeometry {
  const huella = perfil ? hashTexto(perfil.map((p) => Math.round(p * 1000)).join(",")) : 0;
  const tapa = envase === "revolucion" && !botella ? Math.round(franjaDeTapa * 1000) : 0;
  const nivel = envase === "revolucion" ? detalle : "alto";
  const firma = `etiqueta:${envase}:${mm(ancho)}:${mm(alto)}:${mm(fondo)}:${huella}:${acostado}:${botella}:${tapa}:${nivel}`;

  return cacheada(firma, () => {
    if (acostado) {
      if (envase === "revolucion" || envase === "recorte") {
        // Eje horizontal: la de pie mide `alto` de ancho y `ancho` de alto.
        const g = geometriaDeEtiqueta(envase, alto, ancho, fondo, perfil, false, botella, franjaDeTapa, nivel).clone();
        g.rotateZ(Math.PI / 2);
        return g;
      }
      // La caja (y la bolsa) acostadas, con la regla de `acostar`: tumbadas
      // sobre la cara más grande, con la etiqueta mirando para arriba.
      const g = new THREE.BoxGeometry(ancho, alto, fondo);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        // La foto se ve desde arriba, con su «arriba» hacia −X. El canto que
        // da al pasillo toma una columna 3 % ADENTRO de la foto y no la del
        // borde, que es contorno y sangrado: se veía una franja negra.
        const u = Math.min(0.97, Math.max(0.03, 0.5 - pos.getZ(i) / fondo));
        uv.setXY(i, u, 0.5 - pos.getX(i) / ancho);
      }
      uv.needsUpdate = true;
      g.clearGroups();
      return g;
    }

    if (envase === "caja") {
      const g = new THREE.BoxGeometry(ancho, alto, fondo);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const nor = g.attributes.normal as THREE.BufferAttribute;
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const color = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const nx = nor.getX(i), ny = nor.getY(i);
        const u = 0.5 - x / ancho, v = 0.5 + y / alto;
        // Hacia adentro: 0 en el canto del frente, 1 en el del dorso.
        const adentro = (z + fondo / 2) / fondo;
        if (nx < -0.5) uv.setXY(i, 1 - 0.02 * adentro, v);        // −X: el borde derecho de la foto
        else if (nx > 0.5) uv.setXY(i, 0.02 * adentro, v);       // +X: el izquierdo
        else if (ny > 0.5) uv.setXY(i, u, 1 - 0.02 * adentro);   // tapa: el borde de arriba
        else if (ny < -0.5) uv.setXY(i, u, 0.02 * adentro);      // fondo: el de abajo
        else uv.setXY(i, u, v);                                  // frente, y el dorso espejado
        // El costado se oscurece hacia atrás: un plano de un solo color se
        // lee como cartulina, y en tienda el canto que se aleja recibe menos
        // luz del pasillo. Lo leen sólo los cantos (su material lleva
        // `vertexColors`); la foto lo ignora.
        const k = 1 - 0.26 * adentro;
        color[i * 3] = color[i * 3 + 1] = color[i * 3 + 2] = k;
      }
      uv.needsUpdate = true;
      g.setAttribute("color", new THREE.BufferAttribute(color, 3));
      // Dos materiales (`materialDeEtiqueta`): la foto en el frente y el
      // dorso, y el color del costado en los cuatro cantos. Con la última
      // columna de la foto estirada, el costado salía a rayas. BoxGeometry
      // ordena las caras +X, −X, +Y, −Y, +Z, −Z, seis índices cada una.
      g.clearGroups();
      g.addGroup(0, 24, 1);
      g.addGroup(24, 12, 0);
      return g;
    }

    if (envase === "revolucion" && !botella) return vasoConTapa(ancho, alto, perfil, franjaDeTapa, nivel);

    if (envase === "revolucion") {
      const { filas: FILAS, lados: LADOS } = DETALLE.botella[nivel];
      // El pie de una botella se redondea hacia adentro (el 7 % de abajo):
      // con el perfil de la foto el cuerpo llegaba entero hasta el piso y
      // terminaba en un disco plano, y acostada cada botella se leía como un
      // salchichón rebanado. Un vaso o una lata tienen el canto vivo.
      const PIE = 0.07;
      const redondeo = (f: number) => (botella && f < PIE ? 1 - 0.2 * (1 - f / PIE) ** 2 : 1);
      const radio = (f: number) => Math.max(0.0005, (semianchoEn(perfil, f) * ancho * redondeo(f)) / 2);
      // Las tapas arrancan en un labio, un poco adentro del borde: así el
      // borde conserva la etiqueta y la tapa lleva SU color (ver abajo).
      const LABIO = 0.94;
      const puntos = [new THREE.Vector2(0, -alto / 2), new THREE.Vector2(radio(0) * LABIO, -alto / 2)];
      const alturas = botella && nivel === "alto"
        ? [0, 0.012, 0.03, 0.05, ...Array.from({ length: FILAS - 1 }, (_, k) => (k + 2) / FILAS)]
        : botella
          ? [0, 0.04, ...Array.from({ length: FILAS }, (_, k) => (k + 1) / FILAS)]
          : Array.from({ length: FILAS + 1 }, (_, k) => k / FILAS);
      for (const f of alturas) {
        puntos.push(new THREE.Vector2(radio(f), -alto / 2 + f * alto));
      }
      puntos.push(new THREE.Vector2(radio(1) * LABIO, alto / 2), new THREE.Vector2(0, alto / 2));
      const g = new THREE.LatheGeometry(puntos, LADOS);
      // La proyección se cierra un 6 % hacia adentro: el borde exacto de la
      // silueta es el contorno antialiasado de la foto (y el sangrado), y
      // estirado sobre el costado del cuerpo se veía como una costura negra
      // en cuanto la cámara no está justo de frente.
      uvPlanar(g, ancho * 1.06, alto);
      // Las tapas, de UN color: el del centro de la boca y, abajo, uno del
      // cuerpo un poco arriba del pie (el 6 %): el borde de abajo de la foto
      // es el hueco entre los lóbulos de la base de una botella, o sea fondo
      // quitado, y la base acostada salía negra. Con la proyección plana, la
      // tapa repetía la primera fila de la foto estirada: rayas sobre cada vaso.
      const pos = g.attributes.position as THREE.BufferAttribute;
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const rArriba = radio(1), rAbajo = radio(0);
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i), r = Math.hypot(pos.getX(i), pos.getZ(i));
        if (Math.abs(y - alto / 2) < 1e-6 && r < rArriba * 0.99) uv.setXY(i, 0.5, 0.985);
        else if (Math.abs(y + alto / 2) < 1e-6 && r < rAbajo * 0.99) uv.setXY(i, 0.5, 0.06);
      }
      uv.needsUpdate = true;
      return g;
    }

    if (envase === "almohada") return almohada(ancho, alto, fondo);

    // recorte: la silueta plana, mirando a −Z.
    const g = new THREE.PlaneGeometry(ancho, alto);
    g.rotateY(Math.PI);
    uvPlanar(g, ancho, alto);
    return g;
  });
}

/**
 * Un vaso (o una lata) torneado con la silueta de su foto, con la TAPA aparte.
 *
 * La primera versión envolvía el cuerpo con la foto entera y ponía encima un
 * disco de un color: la franja de arriba de la foto —el reborde y el foil
 * doblado sobre el frente— quedaba pintada en el costado, y el disco liso
 * encima. Doble tapa: un hongo de juguete, con el disco lavanda como lo más
 * claro del cuadro. Y con 16 lados, de cerca se veían las facetas del borde.
 *
 * Ahora:
 * - el cuerpo se tornea y se envuelve con la foto SIN su franja de tapa
 *   (`franjaDeTapa`, de `tapaDeFoto`): perfil y etiqueta salen del mismo
 *   tramo, de la base al reborde;
 * - 32 lados: a 150 px el borde se aparta del círculo menos de medio píxel;
 * - la tapa y el fondo son piezas aparte, unidas en la misma geometría como
 *   SEGUNDO grupo (material de la tapa: el foil con su reborde,
 *   `texturaDeTapa`), proyectadas desde arriba. Aparte también da el canto
 *   vivo del reborde, que con las normales promediadas salía redondeado.
 *
 * Con índice y no «sin índice»: una punta llena son 360 vasos, y triplicar
 * los vértices de cada uno hacía cada cuadro de la toma de venta bastante
 * más caro en una máquina sin placa de video.
 */
function vasoConTapa(
  ancho: number, alto: number, perfil: readonly number[] | undefined, franjaDeTapa: number,
  nivel: "alto" | "bajo" = "alto",
): THREE.BufferGeometry {
  const LABIO = 0.94;
  const cuerpo = Math.max(0.5, 1 - Math.max(0, Math.min(0.2, franjaDeTapa)));
  const radio = (f: number) => Math.max(0.0005, (semianchoEn(perfil, f * cuerpo) * ancho) / 2);
  const { lados: LADOS } = DETALLE.vaso[nivel];
  // Un vaso de yogur es un cono truncado: si el perfil es casi recto (se
  // aparta menos del 1,5 % del ancho de la recta entre la base y el
  // reborde), cuatro filas lo dibujan igual que dieciséis.
  const recto = (() => {
    const r0 = radio(0), r1 = radio(1);
    for (let k = 1; k < 16; k++) {
      const f = k / 16;
      if (Math.abs(radio(f) - (r0 + (r1 - r0) * f)) > ancho * 0.015) return false;
    }
    return true;
  })();
  const FILAS = recto ? 4 : DETALLE.vaso[nivel].filas;
  // El costado: de la base al reborde.
  const lado = new THREE.LatheGeometry(
    Array.from({ length: FILAS + 1 }, (_, k) => new THREE.Vector2(radio(k / FILAS), -alto / 2 + (k / FILAS) * alto)),
    LADOS,
  );
  // La proyección plana del frente, cerrada un 6 % hacia adentro (el borde
  // exacto de la silueta es contorno y sangrado) y SÓLO hasta el reborde: la
  // franja de tapa de la foto no va en el costado.
  uvPlanar(lado, ancho * 1.06, alto);
  const uvl = lado.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uvl.count; i++) uvl.setY(i, uvl.getY(i) * cuerpo);
  // La tapa (de afuera hacia el centro: la normal mira arriba) y el fondo
  // (del centro hacia afuera: mira abajo), con el anillo del reborde.
  const rArriba = radio(1), rAbajo = radio(0);
  const arriba = new THREE.LatheGeometry([
    new THREE.Vector2(rArriba, alto / 2), new THREE.Vector2(rArriba * LABIO, alto / 2), new THREE.Vector2(0, alto / 2),
  ], LADOS);
  const abajo = new THREE.LatheGeometry([
    new THREE.Vector2(0, -alto / 2), new THREE.Vector2(rAbajo * LABIO, -alto / 2), new THREE.Vector2(rAbajo, -alto / 2),
  ], LADOS);
  // Proyectadas desde arriba: el centro de la textura en el eje, el borde en
  // el reborde. Y las normales de un disco, sin promediar con el costado.
  const rTapa = Math.max(rArriba, rAbajo);
  for (const [g, ny] of [[arriba, 1], [abajo, -1]] as const) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, 0.5 + pos.getX(i) / (2 * rTapa), 0.5 - pos.getZ(i) / (2 * rTapa));
      nor.setXYZ(i, 0, ny, 0);
    }
  }
  const tapas = mergeGeometries([arriba, abajo])!;
  const g = mergeGeometries([lado, tapas], true)!;
  for (const x of [lado, arriba, abajo, tapas]) x.dispose();
  return g;
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

/**
 * Un MARCO de esquinas redondeadas, acostado: el bocel que rodea la bandeja de
 * una caja registradora.
 *
 * En la ficha del fabricante esa moldura es lo primero que se ve de la mesa —
 * una banda oscura y gorda que da la vuelta completa y dobla en curva en las
 * puntas, con la bandeja clara hundida adentro—. Dibujado con cuatro barras
 * rectas quedan cuatro esquinas vivas y el mueble se lee de chapa cortada; el
 * radio en planta es justamente lo que hace que se lea como una moldura.
 *
 * Se dibuja como un rectángulo redondeado con otro adentro de agujero, y se
 * extruye hacia arriba: alto = espesor de la moldura.
 */
export function geometriaMarcoRedondeado(
  ancho: number, fondo: number, grosor: number, radio: number, alto: number,
): THREE.BufferGeometry {
  const firma =
    `marcoredondo:${ancho.toFixed(4)}:${fondo.toFixed(4)}:${grosor.toFixed(4)}:${radio.toFixed(4)}:${alto.toFixed(4)}`;

  return cacheada(firma, () => {
    const rect = (w: number, d: number, r: number) => {
      const rr = Math.max(0, Math.min(r, w / 2 - 0.001, d / 2 - 0.001));
      const s = new THREE.Path();
      s.moveTo(-w / 2 + rr, -d / 2);
      s.lineTo(w / 2 - rr, -d / 2);
      s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + rr);
      s.lineTo(w / 2, d / 2 - rr);
      s.quadraticCurveTo(w / 2, d / 2, w / 2 - rr, d / 2);
      s.lineTo(-w / 2 + rr, d / 2);
      s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - rr);
      s.lineTo(-w / 2, -d / 2 + rr);
      s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + rr, -d / 2);
      return s;
    };

    const fuera = rect(ancho, fondo, radio);
    const forma = new THREE.Shape(fuera.getPoints(48));
    const g2 = Math.min(grosor, Math.min(ancho, fondo) / 2 - 0.002);
    forma.holes.push(
      new THREE.Path(rect(ancho - g2 * 2, fondo - g2 * 2, Math.max(0.002, radio - g2)).getPoints(48)),
    );

    const g = new THREE.ExtrudeGeometry(forma, { depth: alto, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, alto, 0);
    g.computeVertexNormals();
    return g;
  });
}

/** El plano hundido de adentro del marco: la bandeja por donde corre la cinta.
 *  Va con las mismas esquinas redondeadas que el bocel, o el rectángulo blanco
 *  asoma por las cuatro puntas curvas. */
export function geometriaBandejaRedondeada(
  ancho: number, fondo: number, radio: number, espesor: number,
): THREE.BufferGeometry {
  const firma =
    `bandejaredonda:${ancho.toFixed(4)}:${fondo.toFixed(4)}:${radio.toFixed(4)}:${espesor.toFixed(4)}`;

  return cacheada(firma, () => {
    const rr = Math.max(0, Math.min(radio, ancho / 2 - 0.001, fondo / 2 - 0.001));
    const s = new THREE.Shape();
    s.moveTo(-ancho / 2 + rr, -fondo / 2);
    s.lineTo(ancho / 2 - rr, -fondo / 2);
    s.quadraticCurveTo(ancho / 2, -fondo / 2, ancho / 2, -fondo / 2 + rr);
    s.lineTo(ancho / 2, fondo / 2 - rr);
    s.quadraticCurveTo(ancho / 2, fondo / 2, ancho / 2 - rr, fondo / 2);
    s.lineTo(-ancho / 2 + rr, fondo / 2);
    s.quadraticCurveTo(-ancho / 2, fondo / 2, -ancho / 2, fondo / 2 - rr);
    s.lineTo(-ancho / 2, -fondo / 2 + rr);
    s.quadraticCurveTo(-ancho / 2, -fondo / 2, -ancho / 2 + rr, -fondo / 2);

    const g = new THREE.ExtrudeGeometry(s, { depth: espesor, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, espesor, 0);
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
