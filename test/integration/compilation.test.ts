import { describe, expect, it } from "vitest";
import { transforms } from "../../src/transforms/index.js";

function applyAll(source: string): string {
  return transforms.reduce((next, t) => t.apply(next).source, source);
}

const validApeExports = new Set(["accounts", "chain", "networks", "project", "Contract", "reverts", "convert", "config"]);

function balanced(s: string): boolean {
  const pairs: Record<string, string> = {")":"(","]":"[","}":"{"};
  const st: string[] = [];
  for (const ch of s) {
    if ("([{".includes(ch)) st.push(ch);
    if (")]}".includes(ch)) {
      if (st.pop() !== pairs[ch]) return false;
    }
  }
  return st.length === 0;
}

describe("integration compilation checks", () => {
  it("validates syntax/imports/todos/basic migration hygiene", () => {
    const src = `from brownie import accounts, network\nnetwork.is_connected()\ntx.wait(1)`;
    const out = applyAll(src);
    expect(balanced(out)).toBe(true);
    for (const line of out.split("\n")) {
      if (line.startsWith("from ape import ")) {
        for (const n of line.replace("from ape import ", "").split(",").map((x) => x.trim())) {
          expect(validApeExports.has(n)).toBe(true);
        }
      }
      expect(!(line.includes("brownie") && line.includes("ape"))).toBe(true);
      if (line.includes("TODO(apeshift)")) expect(line.trim().startsWith("#") || line.includes("  #")).toBe(true);
    }
    expect(out).not.toMatch(/from brownie import\s+(accounts|chain|network|Contract|history|Wei|interface)/);
    expect(out).not.toContain("undefined");
  });
});
