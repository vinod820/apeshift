import type { TransformModule } from "../types.js";

export const contractsTransform: TransformModule = {
  name: "contracts",
  rulePath: "src/transforms/contracts/rule.yaml",
  apply(source) {
    return { source, count: 0 };
  },
};

export default contractsTransform;
