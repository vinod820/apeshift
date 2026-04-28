import { describe, expect, it } from "vitest";
import { cleanupTransform } from "../../src/transforms/cleanup/index.js";

describe("cleanup transform", () => {
  it("removes migrated Brownie imports to avoid Ape import shadowing", () => {
    const input = [
      "from ape import accounts, project",
      "from brownie import accounts, config, SimpleStorage, network",
      "",
      "account = accounts[0]",
      'simple_storage = SimpleStorage.deploy({"from": account})',
    ].join("\n");

    const result = cleanupTransform.apply(input);

    expect(result.source).toContain("from ape import accounts, config, networks");
    expect(result.source).toContain("project");
    expect(result.source).not.toContain("from brownie import");
    expect(result.source).toContain("account = accounts.test_accounts[0]");
    expect(result.source).toContain("simple_storage = project.SimpleStorage.deploy(sender=account)");
  });

  it("rewrites multi-line Brownie imports without doubled commas", () => {
    const input = [
      "from brownie import (",
      "    MockV3Aggregator,",
      "    network,",
      ")",
      'MockV3Aggregator.deploy({"from": account})',
    ].join("\n");

    const result = cleanupTransform.apply(input);

    expect(result.source).toContain("from ape import networks");
    expect(result.source).toContain("project");
    expect(result.source).not.toContain(",,");
    expect(result.source).toContain("project.MockV3Aggregator.deploy(sender=account)");
  });

  it("rewrites remaining exception, sender, and positional event edge cases", () => {
    const input = [
      "from brownie import exceptions",
      "with pytest.raises(exceptions.VirtualMachineError):",
      '    fund_me.withdraw({"from": bad_actor})',
    ].join("\n");

    const result = cleanupTransform.apply(input);

    expect(result.source).toContain("from ape.exceptions import ContractLogicError");
    expect(result.source).toContain("with pytest.raises(ContractLogicError):");
    expect(result.source).toContain("fund_me.withdraw(sender=bad_actor)");
    expect(result.source).not.toContain("from brownie import");
  });

  it("removes invalid interface and priority_fee runtime imports", () => {
    const input = [
      "from brownie import interface",
      "from brownie.network import priority_fee",
      "priority_fee('1 gwei')",
      "token = interface.LinkTokenInterface(link_token.address)",
    ].join("\n");
    const result = cleanupTransform.apply(input);
    expect(result.source).not.toContain("interface");
    expect(result.source).not.toContain("from brownie.network import priority_fee");
    expect(result.source).toContain("project.LinkTokenInterface.at(link_token.address)");
    expect(result.source).toContain("TODO(apeshift)");
  });

  it("rewrites web3.eth.contract to Ape Contract factory", () => {
    const result = cleanupTransform.apply("web3_contract = web3.eth.contract(address=addr, abi=abi)\n");
    expect(result.source).toContain("from ape import Contract");
    expect(result.source).toContain("web3_contract = Contract(address=addr, abi=abi)");
    expect(result.source).not.toContain("web3.eth.contract");
  });
});
