import type { TransformModule } from "../types.js";

/**
 * Project-scoped contract rewrites (`interface.*`, `Contract.from_abi`, deploy helpers) are applied
 * in `cleanupTransform` so they run after sender/network fixes and share `ensureApeImport`.
 * See `cleanup/index.ts` (`convertInterfaceCalls`, `convertContractFromAbi`).
 */
export const contractsTransform: TransformModule = {
  name: "contracts",
  rulePath: "src/transforms/contracts/rule.yaml",
  apply(source) {
    return { source, count: 0 };
  },
};

export default contractsTransform;
