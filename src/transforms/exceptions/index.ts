import { applyReplacements, type TransformModule } from "../types.js";

export const exceptionsTransform: TransformModule = {
  name: "exceptions",
  rulePath: "src/transforms/exceptions/rule.yaml",
  apply(source) {
    return applyReplacements(source, [
      [/\bbrownie\.exceptions\.VirtualMachineError\b/g, "ape.exceptions.ContractLogicError"],
      [/(?<![\w.])VirtualMachineError\b/g, "ContractLogicError"],
    ]);
  },
};

export default exceptionsTransform;
