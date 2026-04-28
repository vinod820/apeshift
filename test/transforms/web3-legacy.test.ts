import { describe, expect, it } from "vitest";
import { web3LegacyTransform } from "../../src/transforms/web3-legacy/index.js";

describe("web3 legacy transform", () => {
  it("rewrites exact web3.eth Brownie accessors", () => {
    const input = "bal = web3.eth.getBalance(accounts[0].address)\nheight = web3.eth.blockNumber\ncid = web3.eth.chainId\n";
    const result = web3LegacyTransform.apply(input);
    expect(result.count).toBe(3);
    expect(result.source).toContain("bal = provider.get_balance(accounts[0].address)");
    expect(result.source).toContain("height = chain.blocks.head.number");
    expect(result.source).toContain("cid = networks.provider.network.chain_id");
  });
});
