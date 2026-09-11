# Auditoría técnica — evolución del editor 3D de supermercado

Fecha: 2026-09-11. Alcance: primera iteración incremental sobre el editor
existente; las unidades espaciales del proyecto ya son **metros**.

## 1. Arquitectura actual

- Frontend Vite con React 18, TypeScript 5, React Router 6 y Zustand 5. El
  editor se carga dentro del Dashboard y el `StoreEditor3D` usa React Three
  Fiber 8, Three.js r184 y drei 10.
- `UnifiedFixture` es el contrato persistido compartido por los editores 2D y
  3D. El backend guarda el arreglo completo por sede en `fixtures_json`, por lo
  que los cambios deben ser aditivos y compatibles con layouts antiguos.
- `StoreEditor3D` ya contiene un catálogo de fixtures, modelos R3F por tipo,
  selección, arrastre con snap y colisiones, Orbit/Transform/PointerLock
  controls, modo primera persona, captura, propuestas, iluminación y espejo
  bidireccional con el store Zustand.
- Hay modelo comercial de cara A en el fixture, `faceB` para góndolas dobles y
  `slots` para comercialización por áreas. Existen proveedores, contratos y un
  catálogo de artes de proveedor; no existe todavía un catálogo tipado de
  productos ni placements persistibles.

## 2. Componentes reutilizables

- `UnifiedFixture`, `FaceData`, `ShelfSlot`, `isDoubleGondola` y las utilidades
  de nomenclatura preservan códigos, contratos y la compatibilidad 2D/3D.
- `GondolaMesh` ya distingue góndola doble y mural, tiene entrepaños, rieles y
  estructura básica paramétrica; `StoreRoom` proporciona suelo, sombras y
  medidas coherentes.
- El store Zustand, serializadores `storeToFixtures`/`fixturesToStore`,
  catálogo de proveedores y carga de artes son la base a conservar.

## 3. Problemas actuales

- La góndola calculaba visualmente sus repisas a partir de su altura, pero no
  existía una entidad lógica de repisa ni una relación con productos.
- Los `slots` representan rectángulos comerciales y no shelves físicos; no
  permiten calcular capacidad, filas de profundidad o facings.
- Las artes actuales se renderizan como una lámina que cubre una cara. Es útil
  para propuestas comerciales, pero no representa productos dentro de cada
  repisa.
- Los materiales mezclan Lambert con Standard y el color comercial se usaba en
  superficies extensas en varios muebles. La góndola requería indicadores más
  discretos y PBR consistente.

## 4. Riesgos y mitigación

- Cambiar el JSON del layout puede romper planos antiguos: los campos nuevos
  son opcionales y los serializadores preservan campos que todavía no modela la
  escena.
- Un mesh por producto no escala: la primera versión agrupa los productos por
  producto/material y los dibuja mediante `InstancedMesh`; modelos GLTF quedan
  como estrategia futura del renderer.
- Las dimensiones configurables deben mantener productos sobre la repisa: toda
  posición procede del cálculo de capacidad, no de coordenadas hardcodeadas.

## 5. Propuesta implementada en esta fase

Se añade un dominio independiente `retail3d`: `Product`, `FixtureFace`,
`Shelf`, `ProductPlacement`, `CommercialSpace` y `FixturePlanogram`. Cada
fixture conserva geometría y datos comerciales existentes; su `planogram`
opcional contiene las superficies y placements. Un adaptador genera un
planograma de góndola compatible para fixtures existentes. La góndola consume
esas shelves para geometría y productos 2.5D instanciados, con caras A/B para
góndolas y A para mural. `calculateShelfCapacity` y
`generateProductPlacements` calculan facings y filas con márgenes y separación.

## 6. Archivos a modificar

- `frontend/src/types/fixtures.ts`: enlazar de manera opcional el dominio de
  planograma con el contrato persistido existente.
- `frontend/src/components/StoreEditor3D/StoreEditor3D.tsx`: usar la geometría
  paramétrica, products y una iluminación comercial más realista sin reemplazar
  el editor, su selección o persistencia.

## 7. Archivos nuevos

- `frontend/src/types/retail3d.ts`: entidades del dominio 3D/comercial.
- `frontend/src/utils/planogram.ts`: cálculos puros de capacidad y placements.
- `frontend/src/components/StoreEditor3D/ProductShelfContents.tsx`: renderer
  2.5D instanciado de productos y soporte preparado para estrategias futuras.
