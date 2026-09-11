import React from "react";
import type { FixturePlanogram } from "../../types/retail3d";
import { RealisticGondola, RealisticPunta, RealisticRobatope, RealisticRistra, RealisticCross, RealisticMetro, RealisticMueble } from "./RealisticFixtureDesigns";
import { ProductShelfContents } from "./ProductShelfContents";

type Props = {
  type: string;
  w: number;
  d: number;
  h: number;
  ghost?: boolean;
  gondolaType?: string;
  planogram?: FixturePlanogram;
};

/** Structural realism layer. Dimensions are passed through unchanged from the fixture. */
export function RealisticFixtureRenderer({ type, w, d, h, ghost, gondolaType, planogram }: Props) {
  const structural = (() => {
    switch (type) {
      case "gondola": return <RealisticGondola w={w} d={d} h={h} ghost={ghost} />;
      case "punta": return <RealisticPunta w={w} d={d} h={h} ghost={ghost} />;
      case "robatope": return <RealisticRobatope w={w} d={d} h={h} ghost={ghost} />;
      case "ristra": return <RealisticRistra w={w} d={d} h={h} ghost={ghost} />;
      case "cross": return <RealisticCross w={w} d={d} h={h} ghost={ghost} />;
      case "metro": return <RealisticMetro w={w} d={d} h={h} ghost={ghost} />;
      case "mueble": return <RealisticMueble w={w} d={d} h={h} ghost={ghost} />;
      default: return null;
    }
  })();

  return <group>
    {structural}
    {type === "gondola" && planogram && <ProductShelfContents planogram={planogram} depth={d} ghost={ghost} />}
  </group>;
}
