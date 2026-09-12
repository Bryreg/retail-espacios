import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FixturePlanogram, ProductPlacement } from "../../types/retail3d";

interface Props {
  planogram: FixturePlanogram;
  depth: number;
  ghost?: boolean;
}

/**
 * Producto 2.5D económico: cada SKU comparte caja/material y sus repeticiones
 * se renderizan con InstancedMesh. Cuando un placement tenga `modelUrl`, esta
 * frontera es donde se podrá seleccionar el renderer GLTF sin tocar el modelo
 * comercial ni el algoritmo de planograma.
 */
export function ProductShelfContents({ planogram, depth, ghost = false }: Props) {
  const productById = useMemo(() => new Map(planogram.products.map(product => [product.id, product])), [planogram.products]);
  const shelfById = useMemo(() => new Map(planogram.shelves.map(shelf => [shelf.id, shelf])), [planogram.shelves]);
  const groups = useMemo(() => {
    const byProduct = new Map<string, ProductPlacement[]>();
    planogram.placements.forEach(placement => {
      const group = byProduct.get(placement.productId) ?? [];
      group.push(placement);
      byProduct.set(placement.productId, group);
    });
    return [...byProduct.entries()];
  }, [planogram.placements]);

  return <>{groups.map(([productId, placements]) => {
    const product = productById.get(productId);
    if (!product) return null;
    return <ProductInstances key={productId} placements={placements} product={product} shelfById={shelfById} depth={depth} doubleSided={planogram.faces.length > 1} ghost={ghost} />;
  })}</>;
}

function ProductInstances({ placements, product, shelfById, depth, doubleSided, ghost }: {
  placements: ProductPlacement[];
  product: { width: number; height: number; depth: number; color?: string };
  shelfById: Map<string, { depth: number }>;
  depth: number;
  doubleSided: boolean;
  ghost: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const matrices = useMemo(() => placements.map(placement => {
    const shelf = shelfById.get(placement.shelfId);
    if (!shelf) return new THREE.Matrix4();
    const side = placement.faceId === "A" ? -1 : 1;
    const z = (doubleSided ? side * (depth / 4) : 0) + side * placement.position[2];
    const matrix = new THREE.Matrix4();
    matrix.compose(
      new THREE.Vector3(placement.position[0], placement.position[1], z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, side === 1 ? Math.PI : 0, 0)),
      new THREE.Vector3(...placement.scale),
    );
    return matrix;
  }), [placements, depth, doubleSided, shelfById]);

  useEffect(() => {
    if (!ref.current) return;
    matrices.forEach((matrix, index) => ref.current?.setMatrixAt(index, matrix));
    ref.current.instanceMatrix.needsUpdate = true;
  }, [matrices]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, placements.length]} castShadow receiveShadow frustumCulled>
      <boxGeometry args={[product.width, product.height, product.depth]} />
      <meshStandardMaterial color={product.color ?? "#64748b"} metalness={0.04} roughness={0.42} transparent={ghost} opacity={ghost ? 0.42 : 1} />
    </instancedMesh>
  );
}
