import { describe, expect, it } from "vitest";
import { contractsTransform } from "../../src/transforms/contracts/index.js";

describe("Contract.from_abi migration", () => {
  it("rewrites Contract.from_abi to Contract.at", () => {
    const { source, count } = contractsTransform.apply('Contract.from_abi("Token", token_address, abi)');
    expect(source).toContain("Contract.at(token_address)");
    expect(source).toContain("TODO(apeshift)");
    expect(count).toBe(1);
  });
});
