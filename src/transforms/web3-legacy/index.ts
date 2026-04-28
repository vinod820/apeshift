import { applyReplacements, type TransformModule } from "../types.js";

export const web3LegacyTransform: TransformModule = {
  name: "web3-legacy",
  rulePath: "src/transforms/web3-legacy/rule.yaml",
  apply(source) {
    return applyReplacements(source, [
      [/\bweb3\.eth\.getBalance\(([^)\n]+)\)/g, "provider.get_balance($1)"],
      [/\bweb3\.eth\.blockNumber\b/g, "chain.blocks.head.number"],
      [/\bweb3\.eth\.chainId\b/g, "networks.provider.network.chain_id"],
    ]);
  },
};

export default web3LegacyTransform;
