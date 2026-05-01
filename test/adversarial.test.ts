import { describe, expect, it } from "vitest";
import { cleanupTransform } from "../src/transforms/cleanup/index.js";
import { contractsTransform } from "../src/transforms/contracts/index.js";
import { accountsTransform } from "../src/transforms/accounts/index.js";
import { transforms } from "../src/transforms/index.js";

function applyAll(source: string): string {
  return transforms.reduce((next, t) => t.apply(next).source, source);
}

void cleanupTransform;
void accountsTransform;

describe("FALSE POSITIVE GUARD — accounts fixture injection", () => {
  it("does not rewrite accounts[0] when accounts is a pytest fixture param", () => {
    const src = `def test_transfer(accounts):\n    sender = accounts[0]\n    receiver = accounts[1]`;
    const result = applyAll(src);
    expect(result).not.toContain("test_accounts");
  });

  it("does not rewrite accounts[0] in a fixture that takes accounts as param", () => {
    const src = `@pytest.fixture\ndef owner(accounts):\n    return accounts[0]`;
    const result = applyAll(src);
    expect(result).not.toContain("test_accounts");
  });

  it("does not rewrite accounts[0] when multiple fixtures share the accounts param", () => {
    const src = [
      "def test_a(accounts, token):",
      "    accounts[0].transfer(accounts[1], 100)",
      "def test_b(chain, accounts):",
      "    accounts[2].balance()",
    ].join("\n");
    const result = applyAll(src);
    expect(result).not.toContain("test_accounts");
  });

  it("DOES rewrite accounts[0] in a script file with no fixture parameters", () => {
    const src = `from brownie import accounts\naccounts[0].deploy(Token)`;
    const result = applyAll(src);
    expect(result).toContain("test_accounts[0]");
  });

  it("handles mixed file: fixture function uses fixture, helper function uses global", () => {
    const src = [
      "def test_foo(accounts):",
      "    return accounts[0]",
      "",
      "def deploy_helper():",
      "    return accounts[1]",
    ].join("\n");
    const result = applyAll(src);
    expect(result).not.toContain("test_accounts");
  });
});

describe("FALSE POSITIVE GUARD — accounts[N] inside string literals", () => {
  it("does not rewrite accounts[0] inside a string", () => {
    const src = `msg = "use accounts[0] to deploy"`;
    const result = applyAll(src);
    expect(result).toContain(`"use accounts[0] to deploy"`);
    expect(result).not.toContain("test_accounts");
  });

  it("does not rewrite accounts[0] inside a comment", () => {
    const src = `# accounts[0] is the deployer`;
    const result = applyAll(src);
    expect(result).not.toContain("test_accounts");
  });

  it("does not rewrite accounts[0] inside a docstring", () => {
    const src = `"""Example: accounts[0].deploy(Token)"""`;
    const result = applyAll(src);
    expect(result).not.toContain("test_accounts");
  });
});

describe("FALSE POSITIVE GUARD — contract names colliding with builtins", () => {
  it("does not prepend project. to Python builtins that happen to start with uppercase", () => {
    const src = `assert result == True\nraise ValueError("bad")`;
    const result = applyAll(src);
    expect(result).not.toContain("project.True");
    expect(result).not.toContain("project.ValueError");
    expect(result).not.toContain("project.None");
  });

  it("does not rewrite Contract in import context as project.Contract", () => {
    const src = `from brownie import Contract`;
    const result = applyAll(src);
    expect(result).not.toContain("project.Contract");
    expect(result).toContain("from ape import Contract");
  });
});

describe("FALSE POSITIVE GUARD — sender dict in non-call context", () => {
  it("does not corrupt dict defined for other purposes that uses 'from' key", () => {
    const src = `params = {"from": "alice", "to": "bob"}`;
    const result = applyAll(src);
    if (!result.includes("TODO(apeshift)")) {
      expect(result).toContain(`{"from": "alice", "to": "bob"}`);
    }
    expect(result).not.toMatch(/=\s*sender\s*=\s*[^,)]+\s*,\s*sender/);
  });

  it("does not rewrite 'from' key in dict that is not a function argument", () => {
    const src = `tx_params = {"from": accounts[0]}`;
    const result = applyAll(src);
    const noGarbage = !result.includes("= sender=") && !result.includes(", sender=accounts.test_accounts[0]})");
    expect(noGarbage).toBe(true);
  });
});

describe("FALSE POSITIVE GUARD — Wei() in non-Brownie contexts", () => {
  it("does not rewrite a variable named Wei that is user-defined", () => {
    const src = `Wei = 10**18\nresult = Wei * amount`;
    const result = applyAll(src);
    expect(result).toContain("Wei = 10**18");
  });

  it("does not corrupt Wei() call inside a comment", () => {
    const src = `# Wei("1 ether") is 10**18`;
    const result = applyAll(src);
    expect(result).toContain(`# Wei("1 ether") is 10**18`);
  });
});

describe("FALSE POSITIVE GUARD — history variable collision", () => {
  it("does not rewrite a user variable named history that is unrelated to brownie", () => {
    const src = `price_history = [1, 2, 3]\nlast = price_history[-1]`;
    const result = applyAll(src);
    expect(result).not.toContain("chain.price_history");
    expect(result).toContain("price_history[-1]");
  });

  it("does not rewrite 'history' inside a string", () => {
    const src = `label = "history[-1] gives last tx"`;
    const result = applyAll(src);
    expect(result).toContain(`"history[-1] gives last tx"`);
  });
});

describe("FALSE POSITIVE GUARD — import rewrites", () => {
  it("does not emit duplicate from-ape-import lines", () => {
    const src = ["from brownie import accounts", "from brownie import chain", "from brownie import config"].join("\n");
    const result = applyAll(src);
    const importLines = result.split("\n").filter((l) => l.startsWith("from ape import"));
    expect(importLines.length).toBe(1);
  });

  it("does not emit 'from ape import interface' — interface is not an Ape export", () => {
    const src = `from brownie import interface`;
    const result = applyAll(src);
    expect(result).not.toContain("from ape import interface");
  });

  it("does not add 'from ape import accounts' when accounts is already imported", () => {
    const src = `from ape import accounts\naccounts[0].balance()`;
    const result = applyAll(src);
    const count = (result.match(/from ape import accounts/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("does not corrupt a file that has no brownie imports at all", () => {
    const src = `import pytest\n\ndef test_foo():\n    assert 1 + 1 == 2`;
    const result = applyAll(src);
    expect(result).toBe(src);
  });

  it("does not add ape imports to a plain Python file", () => {
    const src = `def add(a, b):\n    return a + b`;
    const result = applyAll(src);
    expect(result).not.toContain("from ape import");
    expect(result).toBe(src);
  });
});

describe("CORRECT POSITIVES — chain.sleep migration", () => {
  it("rewrites chain.sleep(100) with a TODO comment", () => {
    const src = `chain.sleep(100)`;
    const result = applyAll(src);
    expect(result).toContain("chain.mine(1)");
    expect(result).toContain("TODO(apeshift)");
    expect(result).not.toBe(src);
  });

  it("rewrites chain.sleep with expression argument", () => {
    const src = `chain.sleep(60 * 60 * 24)`;
    const result = applyAll(src);
    expect(result).toContain("chain.mine(1)");
    expect(result).toContain("TODO(apeshift)");
  });

  it("does not rewrite chain.mine (already correct Ape syntax)", () => {
    const src = `chain.mine(10)`;
    const result = applyAll(src);
    expect(result).toBe(src);
  });
});

describe("CORRECT POSITIVES — Wei() migration", () => {
  it("converts Wei('1 ether')", () => {
    const src = `amount = Wei("1 ether")`;
    const result = applyAll(src);
    expect(result).toContain("1 * 10**18");
    expect(result).not.toContain(`Wei("1 ether")`);
  });

  it("converts Wei('1 gwei')", () => {
    const src = `fee = Wei("1 gwei")`;
    const result = applyAll(src);
    expect(result).toContain("1 * 10**9");
  });

  it("converts Wei('1 wei')", () => {
    const src = `dust = Wei("1 wei")`;
    const result = applyAll(src);
    expect(result).toContain("1 * 1");
  });

  it("adds TODO for dynamic Wei() calls, does not silently corrupt them", () => {
    const src = `amount = Wei(user_amount)`;
    const result = applyAll(src);
    expect(result).toContain("TODO(apeshift)");
    expect(result).not.toMatch(/amount = \s*$/m);
  });
});

describe("CORRECT POSITIVES — Contract.from_abi migration", () => {
  it("rewrites Contract.from_abi to Contract.at with TODO", () => {
    const src = `token = Contract.from_abi("Token", token_address, abi)`;
    const result = contractsTransform.apply(src);
    expect(result.source).toContain("Contract.at(token_address)");
    expect(result.source).toContain("TODO(apeshift)");
    expect(result.count).toBe(1);
  });

  it("does not rewrite Contract.at (already correct)", () => {
    const src = `token = Contract.at(token_address)`;
    const result = contractsTransform.apply(src);
    expect(result.source).toBe(src);
    expect(result.count).toBe(0);
  });

  it("handles Contract.from_abi with extra whitespace", () => {
    const src = `Contract.from_abi( "Token" , addr , token_abi )`;
    const result = contractsTransform.apply(src);
    expect(result.source).toContain("Contract.at(addr)");
  });
});

describe("CORRECT POSITIVES — history migration", () => {
  it("rewrites history[-1] to chain.history[-1]", () => {
    const src = `from brownie import history\ntx = history[-1]`;
    const result = applyAll(src);
    expect(result).toContain("chain.history[-1]");
    expect(result).not.toContain("from brownie import history");
  });

  it("rewrites history[0] to chain.history[0]", () => {
    const src = `first_tx = history[0]`;
    const result = applyAll(src);
    expect(result).toContain("chain.history[0]");
  });
});

describe("CORRECT POSITIVES — accounts.at() migration", () => {
  it("adds TODO to accounts.at() with force=True", () => {
    const src = `owner = accounts.at("0x123456", force=True)`;
    const result = applyAll(src);
    expect(result).toContain("TODO(apeshift)");
  });

  it("adds TODO to accounts.at() with just an address", () => {
    const src = `owner = accounts.at(some_address)`;
    const result = applyAll(src);
    expect(result).toContain("TODO(apeshift)");
  });
});

describe("CORRECT POSITIVES — brownie.multicall", () => {
  it("adds TODO for brownie.multicall", () => {
    const src = `with brownie.multicall():\n    result = contract.fn()`;
    const result = applyAll(src);
    expect(result).toContain("TODO(apeshift)");
  });
});

describe("CORRECT POSITIVES — brownie.convert", () => {
  it("adds TODO for brownie.convert.to_uint", () => {
    const src = `val = brownie.convert.to_uint(amount)`;
    const result = applyAll(src);
    expect(result).toContain("TODO(apeshift)");
  });

  it("adds TODO for brownie.convert", () => {
    const src = `val = brownie.convert(amount, "uint256")`;
    const result = applyAll(src);
    expect(result).toContain("TODO(apeshift)");
  });
});

describe("IDEMPOTENCY — running transforms twice must be identical", () => {
  const cases = [
    `from brownie import accounts\naccounts[0].deploy(Token)`,
    `from brownie import chain, accounts\nchain.sleep(100)\naccounts[0].balance()`,
    `from brownie import accounts, network\nactive = network.show_active()`,
    `Token.deploy({"from": accounts[0]})`,
    `with brownie.reverts("err"):\n    contract.fn()`,
    `from brownie import interface\ntoken = interface.ERC20(addr)`,
    `token.transfer(receiver, 100, {"from": accounts[1]})`,
    `import pytest\n\ndef test_foo():\n    assert True`,
  ];

  for (const src of cases) {
    it(`is idempotent for: ${src.split("\n")[0]}`, () => {
      const once = applyAll(src);
      const twice = applyAll(once);
      expect(twice).toBe(once);
    });
  }
});

describe("REGRESSION — existing transforms must still fire", () => {
  it("still rewrites sender dicts", () => {
    const src = `token.transfer(receiver, 100, {"from": accounts[0]})`;
    const result = applyAll(src);
    expect(result).toContain("sender=accounts");
    expect(result).not.toContain('{"from":');
  });

  it("still rewrites brownie.reverts", () => {
    const src = `with brownie.reverts("error"):\n    contract.fn()`;
    const result = applyAll(src);
    expect(result).toContain("ape.reverts");
  });

  it("still rewrites VirtualMachineError", () => {
    const src = `from brownie import exceptions\nwith pytest.raises(exceptions.VirtualMachineError):`;
    const result = applyAll(src);
    expect(result).toContain("ContractLogicError");
  });

  it("still rewrites interface.ERC20(addr)", () => {
    const src = `from brownie import interface\ntoken = interface.ERC20(addr)`;
    const result = applyAll(src);
    expect(result).toContain("project.ERC20.at(addr)");
  });

  it("still rewrites Token[-1]", () => {
    const src = `from brownie import Token\ncontract = Token[-1]`;
    const result = applyAll(src);
    expect(result).toContain("project.Token.deployments[-1]");
  });

  it("still rewrites network.show_active()", () => {
    const src = `from brownie import network\nname = network.show_active()`;
    const result = applyAll(src);
    expect(result).toContain("networks.provider.network.name");
  });

  it("still rewrites web3.eth.getBalance", () => {
    const src = `bal = web3.eth.getBalance(addr)`;
    const result = applyAll(src);
    expect(result).not.toContain("web3.eth.getBalance");
  });

  it("still collapses duplicate ape imports into one line", () => {
    const src = `from brownie import accounts\nfrom brownie import chain\nfrom brownie import config`;
    const result = applyAll(src);
    const lines = result.split("\n").filter((l) => l.startsWith("from ape import"));
    expect(lines.length).toBe(1);
  });
});

describe("EDGE CASES", () => {
  it("handles empty string without throwing", () => {
    expect(() => applyAll("")).not.toThrow();
  });

  it("handles file with only comments without throwing", () => {
    const src = `# This is a comment\n# from brownie import accounts`;
    expect(() => applyAll(src)).not.toThrow();
    const result = applyAll(src);
    expect(result).toBe(src);
  });

  it("handles Windows CRLF line endings without corrupting output", () => {
    const src = `from brownie import accounts\r\naccounts[0].deploy(Token)\r\n`;
    expect(() => applyAll(src)).not.toThrow();
    const result = applyAll(src);
    expect(result).not.toContain("undefined");
  });

  it("handles very long lines without hanging or throwing", () => {
    const longLine = `token.transfer(${"x".repeat(500)}, {"from": accounts[0]})`;
    expect(() => applyAll(longLine)).not.toThrow();
  });

  it("handles nested dict in sender position with TODO, not corrupt output", () => {
    const src = `contract.fn({"from": accounts[0], "value": {"amount": 100}})`;
    expect(() => applyAll(src)).not.toThrow();
    const result = applyAll(src);
    expect(result).not.toMatch(/sender=\s*,/);
  });

  it("does not add project. prefix to lowercase contract-looking calls", () => {
    const src = `result = token.balanceOf(addr)`;
    const result = applyAll(src);
    expect(result).toBe(src);
  });

  it("does not rewrite 'Chain' (capital C user variable) as chain migration", () => {
    const src = `Chain = get_chain()\nChain.mine(1)`;
    const result = applyAll(src);
    expect(result).toContain("Chain = get_chain()");
  });
});

describe("NEW PATTERNS — no false positives and idempotency", () => {
  const samples = [
    "network.connect(\"mainnet\")",
    "network.disconnect()",
    "network.is_connected()",
    "tx.wait(1)",
    "tx.revert_msg",
    "tx.events[\"Transfer\"]",
    "Contract.from_explorer(addr)",
  ];

  for (const sample of samples) {
    it(`does not rewrite in comment: ${sample}`, () => {
      expect(applyAll(`# ${sample}`)).toBe(`# ${sample}`);
    });
    it(`does not rewrite in string: ${sample}`, () => {
      expect(applyAll(`x = "${sample}"`)).toBe(`x = "${sample}"`);
    });
    it(`does not rewrite in docstring: ${sample}`, () => {
      expect(applyAll(`"""${sample}"""`)).toBe(`"""${sample}"""`);
    });
  }

  it("is idempotent for a mixed new-pattern sample", () => {
    const src = `network.connect("mainnet")\ntx.wait(1)\naccounts.add("0xabc")`;
    const once = applyAll(src);
    expect(applyAll(once)).toBe(once);
  });
});
