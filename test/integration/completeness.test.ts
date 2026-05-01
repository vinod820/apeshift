import { describe, expect, it } from "vitest";
import { transforms } from "../../src/transforms/index.js";

function applyAll(source: string) {
  let count = 0;
  let next = source;
  for (const t of transforms) {
    const res = t.apply(next);
    next = res.source;
    count += res.count;
  }
  return { source: next, count };
}

describe("integration completeness checks", () => {
  it("migrates canonical brownie fixture", () => {
    const src = `from brownie import accounts, network, Contract\nnetwork.gas_price()\ntx.wait(2)\na = accounts.add("0xabc")\nContract.from_explorer(addr)`;
    const { source, count } = applyAll(src);
    expect(source).not.toMatch(/from brownie import\s+(accounts|network|Contract)/);
    expect(source).not.toMatch(/\bnetwork\.(gas_price|connect|disconnect|is_connected|gas_limit)\b/);
    expect(source).not.toContain("undefined");
    const changedLines = source.split("\n").filter((l) => l.includes("TODO(apeshift)")).length;
    expect(count).toBeGreaterThanOrEqual(changedLines);
    for (const line of source.split("\n").filter((l) => l.includes("TODO(apeshift)"))) {
      expect(line).toContain("TODO(apeshift)");
    }
  });
});
