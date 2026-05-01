import type { TransformModule } from "../types.js";

export const contractsTransform: TransformModule = {
  name: "contracts",
  rulePath: "src/transforms/contracts/rule.yaml",
  apply(source) {
    let count = 0;
    const next = source.replace(
      /\bContract\.from_abi\(\s*["'][^"']*["']\s*,\s*([^,)]+)\s*,\s*[^)]+\)/g,
      (_match, addr: string) => {
        count += 1;
        return `Contract.at(${addr.trim()})  # TODO(apeshift): verify ABI is available in Ape project`;
      },
    );
    return { source: next, count };
  },
};

export default contractsTransform;
