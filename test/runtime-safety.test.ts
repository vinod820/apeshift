import { describe, expect, it } from "vitest";
import { transforms } from "../src/transforms/index.js";

const validApeExports = new Set([
  "accounts",
  "chain",
  "networks",
  "project",
  "config",
  "Project",
  "Contract",
  "convert",
  "compilers",
  "reverts",
]);

function applyAll(source: string): string {
  return transforms.reduce((next, transform) => transform.apply(next).source, source);
}

describe("runtime safety", () => {
  it("only imports known runtime-safe top-level ape exports", () => {
    const source = applyAll("from brownie import accounts, network, config, Contract, convert\n");
    const imports = [...source.matchAll(/^from ape import (.+)$/gm)].flatMap((match) =>
      (match[1] ?? "").split(",").map((name) => name.trim()),
    );
    expect(imports.every((name) => validApeExports.has(name))).toBe(true);
  });

  it("removes Brownie imports and network.show_active calls", () => {
    const source = applyAll("from brownie import accounts, network\nactive = network.show_active()\n");
    expect(source).not.toContain("from brownie import");
    expect(source).not.toContain("network.show_active()");
    expect(source).toContain("networks.provider.network.name");
  });

  it("does not leave web3.eth calls unhandled", () => {
    const source = applyAll("contract = web3.eth.contract(address=addr, abi=abi)\n");
    expect(source).toContain("contract = Contract(address=addr, abi=abi)");
    expect(source).not.toContain("web3.eth.");
  });

  it("converts sender dictionaries", () => {
    const source = applyAll("token.transfer(accounts[1], 1, {'from': accounts[0]})\n");
    expect(source).toContain("sender=accounts.test_accounts[0]");
    expect(source).not.toContain("{'from':");
  });

  it("migrates interface but keeps priority_fee as Brownie import/call (no TODO-only line)", () => {
    const source = applyAll("from brownie import interface\nfrom brownie.network import priority_fee\npriority_fee('1 gwei')\n");
    expect(source).not.toContain("from ape import interface");
    expect(source).toContain("from brownie.network import priority_fee");
    expect(source).toContain("priority_fee('1 gwei')");
  });
});
