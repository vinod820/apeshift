import { describe, expect, it } from "vitest";
import { cleanupTransform } from "../../src/transforms/cleanup/index.js";

describe("new migration patterns", () => {
  it("migrates network/provider helpers", () => {
    const src = [
      'network.connect("mainnet")',
      "network.disconnect()",
      "network.is_connected()",
      "network.gas_price()",
      "network.gas_limit()",
    ].join("\n");
    const out = cleanupTransform.apply(src).source;
    expect(out).toContain("TODO(apeshift)");
    expect(out).toContain("networks.provider is not None");
    expect(out).toContain("networks.provider.gas_price");
    expect(out).toContain("networks.provider.settings.gas_limit");
  });

  it("migrates tx patterns", () => {
    const src = 'tx.wait(1)\nmsg=tx.revert_msg\nok = tx.status == 1\ne = tx.events["Transfer"]';
    const out = cleanupTransform.apply(src).source;
    expect(out).toContain("tx.wait_confirmations(1)");
    expect(out).toContain("tx.revert_message");
    expect(out).toContain("TransactionStatusEnum.passing");
    expect(out).toContain('tx.events["Transfer"]');
  });

  it("migrates contract/account/config patterns", () => {
    const src = [
      'accounts.add("0xabc")',
      "accounts.default",
      "Contract.from_explorer(addr)",
      "token.transfer.call(to, amt)",
      "token.functions.transfer(to, amt)",
      'config["wallets"]["from_key"]',
      'config["networks"][name]',
      "def test_x(web3):\n    return web3",
      "brownie.test.strategy('uint256')",
    ].join("\n");
    const out = cleanupTransform.apply(src).source;
    expect(out).toContain("accounts.load(\"alias\")");
    expect(out).toContain("Contract.at(addr)");
    expect(out).toContain("token.transfer(to, amt)");
    expect(out).toContain('config["wallets"]["from_key"]');
    expect(out).toContain('config["networks"][name]');
    expect(out).toContain("replace web3 fixture with provider");
  });

  it("does not rewrite inside comments/strings/docstrings", () => {
    const src = [
      '# network.connect("mainnet")',
      's = "tx.wait(1)"',
      '"""accounts.add("0xabc")"""',
    ].join("\n");
    const out = cleanupTransform.apply(src).source;
    expect(out).toBe(src);
  });

  it("is idempotent for new patterns", () => {
    const src = 'network.connect("mainnet")\ntx.wait(1)\naccounts.add("0xabc")';
    const once = cleanupTransform.apply(src).source;
    const twice = cleanupTransform.apply(once).source;
    expect(twice).toBe(once);
  });
});
