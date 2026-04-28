import { applyReplacements, type TransformModule } from "../types.js";

export const revertsTransform: TransformModule = {
  name: "reverts",
  rulePath: "src/transforms/reverts/rule.yaml",
  apply(source) {
    return applyReplacements(source, [
      [/\bbrownie\.reverts\(/g, "ape.reverts("],
    ]);
  },
};

export default revertsTransform;
