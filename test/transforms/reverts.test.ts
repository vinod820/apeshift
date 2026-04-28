import { describe, expect, it } from "vitest";
import { revertsTransform } from "../../src/transforms/reverts/index.js";

describe("reverts transform", () => {
  it("rewrites brownie.reverts calls", () => {
    const input = 'with brownie.reverts("some error"):\n    contract.fn()\nwith brownie.reverts():\n    contract.fn()\n';
    const result = revertsTransform.apply(input);
    expect(result.count).toBe(2);
    expect(result.source).toContain('with ape.reverts("some error"):');
    expect(result.source).toContain("with ape.reverts():");
  });
});
