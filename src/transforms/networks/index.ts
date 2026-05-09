import type { TransformModule } from "../types.js";

export const networksTransform: TransformModule = {
  name: "networks",
  rulePath: "src/transforms/networks/rule.yaml",
  apply(source) {
    return { source, count: 0 };
  },
};

export default networksTransform;
