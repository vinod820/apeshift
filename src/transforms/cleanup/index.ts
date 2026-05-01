import type { TransformModule, TransformResult } from "../types.js";

const brownieNames = new Set([
  "accounts",
  "chain",
  "config",
  "Contract",
  "convert",
  "history",
  "exceptions",
  "interface",
  "network",
  "reverts",
  "web3",
]);

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function parseImportNames(raw: string): string[] {
  return raw
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => name.replace(/\s+as\s+.+$/, "").trim())
    .filter(Boolean);
}

function apeImportFor(names: string[]): string | null {
  const apeNames = names
    .filter((name) => brownieNames.has(name) && !["exceptions", "interface", "reverts", "web3"].includes(name))
    .map((name) => (name === "network" ? "networks" : name));
  if (apeNames.length === 0) return null;
  return `from ape import ${unique(apeNames).join(", ")}`;
}

function collectContractNames(source: string): string[] {
  const names: string[] = [];
  const singleLine = source.matchAll(/^from brownie import ([^\n()]+)$/gm);
  for (const match of singleLine) {
    names.push(...parseImportNames(match[1] ?? "").filter((name) => /^[A-Z]/.test(name) && name !== "Contract"));
  }
  const multiLine = source.matchAll(/^from brownie import \(\r?\n([\s\S]*?)^\)$/gm);
  for (const match of multiLine) {
    const body = match[1] ?? "";
    names.push(
      ...body
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/,$/, ""))
        .filter((name) => /^[A-Z]/.test(name) && name !== "Contract"),
    );
  }
  return unique(names);
}

function removeMigratedBrownieImports(source: string): TransformResult {
  let count = 0;
  const next = source.replace(/^from brownie import ([^\n()]+)$/gm, (line, raw: string) => {
    const names = parseImportNames(raw);
    const keep = names.filter((name) => !brownieNames.has(name) && !/^[A-Z]/.test(name));
    if (keep.length === names.length) return line;
    count += 1;
    const importLines = [];
    const ape = apeImportFor(names);
    if (ape) importLines.push(ape);
    if (names.some((name) => /^[A-Z]/.test(name))) importLines.push("from ape import project");
    if (keep.length > 0) importLines.push(`from brownie import ${keep.join(", ")}`);
    return unique(importLines).join("\n");
  });
  return { source: next, count };
}

function convertMultilineBrownieImports(source: string): TransformResult {
  let count = 0;
  const next = source.replace(/^from brownie import \(\r?\n([\s\S]*?)^\)$/gm, (block, body: string) => {
    const names = body
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/,$/, ""))
      .filter(Boolean);
    const ape = apeImportFor(names);
    const keep = names.filter((name) => !brownieNames.has(name) && !/^[A-Z]/.test(name));
    if (!ape) return block;
    count += 1;
    const lines = [ape];
    if (keep.length > 0) {
      lines.push("from ape import project");
      lines.push(`from brownie import ${keep.join(", ")}`);
    }
    return lines.join("\n");
  });
  return { source: next, count };
}

function ensureApeImport(source: string, names: string[]): string {
  const needed = names.filter((name) => {
    // Check single-line: from ape import ... <name> ...
    if (new RegExp(`^from ape import .*\\b${name}\\b`, "m").test(source)) return false;
    // Check multiline body: line that is just "    <name>," or "    <name>"
    if (new RegExp(`^[ \\t]+${name}\\s*,?\\s*$`, "m").test(source)) return false;
    return true;
  });
  if (needed.length === 0) return source;
  const line = `from ape import ${unique(needed).join(", ")}`;
  if (source.startsWith("#!")) {
    const [first, ...rest] = source.split(/\r?\n/);
    return `${first}\n${line}\n${rest.join("\n")}`;
  }
  return `${line}\n${source}`;
}

function ensureExceptionImport(source: string): string {
  if (/^from ape\.exceptions import .*ContractLogicError/m.test(source)) return source;
  const line = "from ape.exceptions import ContractLogicError";
  if (source.startsWith("#!")) {
    const [first, ...rest] = source.split(/\r?\n/);
    return `${first}\n${line}\n${rest.join("\n")}`;
  }
  return `${line}\n${source}`;
}

type MaskedSource = {
  masked: string;
  restore: (value: string) => string;
};

function maskLiterals(source: string): MaskedSource {
  const parts: string[] = [];
  const values: string[] = [];
  const pushMask = (value: string) => {
    const token = `__APESHIFT_MASK_${values.length}__`;
    values.push(value);
    parts.push(token);
  };

  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next3 = source.slice(i, i + 3);

    if (next3 === '"""' || next3 === "'''") {
      const quote = next3;
      let j = i + 3;
      while (j < source.length && source.slice(j, j + 3) !== quote) j += 1;
      if (j < source.length) j += 3;
      pushMask(source.slice(i, j));
      i = j;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === "\\" && j + 1 < source.length) {
          j += 2;
          continue;
        }
        if (source[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      pushMask(source.slice(i, j));
      i = j;
      continue;
    }

    if (ch === "#") {
      let j = i;
      while (j < source.length && source[j] !== "\n") j += 1;
      pushMask(source.slice(i, j));
      i = j;
      continue;
    }

    parts.push(ch);
    i += 1;
  }

  return {
    masked: parts.join(""),
    restore(value: string) {
      return value.replace(/__APESHIFT_MASK_(\d+)__/g, (_match, index: string) => values[Number(index)] ?? "");
    },
  };
}

function maskComments(source: string): MaskedSource {
  const parts: string[] = [];
  const values: string[] = [];
  const pushMask = (value: string) => {
    const token = `__APESHIFT_COMMENT_${values.length}__`;
    values.push(value);
    parts.push(token);
  };

  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next3 = source.slice(i, i + 3);

    if (next3 === '"""' || next3 === "'''") {
      const quote = next3;
      let j = i + 3;
      while (j < source.length && source.slice(j, j + 3) !== quote) j += 1;
      if (j < source.length) j += 3;
      parts.push(source.slice(i, j));
      i = j;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === "\\" && j + 1 < source.length) {
          j += 2;
          continue;
        }
        if (source[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      parts.push(source.slice(i, j));
      i = j;
      continue;
    }

    if (ch === "#") {
      let j = i;
      while (j < source.length && source[j] !== "\n") j += 1;
      pushMask(source.slice(i, j));
      i = j;
      continue;
    }

    parts.push(ch);
    i += 1;
  }

  return {
    masked: parts.join(""),
    restore(value: string) {
      return value.replace(/__APESHIFT_COMMENT_(\d+)__/g, (_match, index: string) => values[Number(index)] ?? "");
    },
  };
}

function convertSenderDicts(source: string): TransformResult {
  let count = 0;
  const patterns: Array<[RegExp, string]> = [
    [/,?\s*\{\s*["']from["']\s*:\s*([^,}\n]+)\s*,\s*["']value["']\s*:\s*([^,}\n]+)\s*\}/g, ", value=$2, sender=$1"],
    [/,?\s*\{\s*["']value["']\s*:\s*([^,}\n]+)\s*,\s*["']from["']\s*:\s*([^,}\n]+)\s*\}/g, ", value=$1, sender=$2"],
    [/,?\s*\{\s*["']from["']\s*:\s*([^,}\n]+)\s*,\s*["']gas_limit["']\s*:\s*([^,}\n]+)\s*\}/g, ", gas_limit=$2, sender=$1"],
    [/,?\s*\{\s*["']from["']\s*:\s*([^,}\n]+)\s*,\s*["']gas_price["']\s*:\s*([^,}\n]+)\s*\}/g, ", gas_price=$2, sender=$1"],
    [/,?\s*\{\s*["']from["']\s*:\s*([^,}\n]+)\s*\}/g, ", sender=$1"],
  ];
  let next = source;
  for (const [pattern, replacement] of patterns) {
    next = next.replace(pattern, (...args: string[]) => {
      count += 1;
      return replacement.replace(/\$(\d+)/g, (_token, index) => args[Number(index)] ?? "");
    });
  }
  next = next.replace(/\(\s*,\s*(sender|value|gas_limit|gas_price)=/g, "($1=");
  return { source: next, count };
}

function convertAccounts(source: string): TransformResult {
  const usedAsFixture = /def\s+\w+\s*\([^)]*\baccounts\b[^)]*\)\s*:/m.test(source);
  if (usedAsFixture) {
    return { source, count: 0 };
  }
  const masked = maskLiterals(source);
  let count = 0;
  let next = masked.masked.replace(/\baccounts\[(\d+)\]/g, (_match, index: string) => {
    count += 1;
    return `accounts.test_accounts[${index}]`;
  });
  next = masked.restore(next);
  if (count > 0) next = ensureApeImport(next, ["accounts"]);
  return { source: next, count };
}

function convertAccountsAt(source: string): TransformResult {
  let count = 0;
  const next = source.replace(/\baccounts\.at\(([^)]+)\)/g, (_match, args: string) => {
    count += 1;
    return `accounts.at(${args})  # TODO(apeshift): use accounts[accounts.test_accounts.index(...)] or ape_test fixture`;
  });
  return { source: next, count };
}

function convertChainSleep(source: string): TransformResult {
  const masked = maskLiterals(source);
  let count = 0;
  const next = masked.masked.replace(/\bchain\.sleep\(([^)]*)\)/g, (_match, arg: string) => {
    count += 1;
    return `chain.mine(1)  # TODO(apeshift): chain.sleep(${arg}) → chain.mine(); adjust block count as needed`;
  });
  return { source: masked.restore(next), count };
}

function convertHistory(source: string): TransformResult {
  const masked = maskLiterals(source);
  let count = 0;
  const next = masked.masked.replace(/(?<!\.)(\bhistory\b)(?=\s*\[)/g, () => {
    count += 1;
    return "chain.history";
  });
  const restored = masked.restore(next);
  return { source: count > 0 ? ensureApeImport(restored, ["chain"]) : restored, count };
}

function convertWei(source: string): TransformResult {
  const masked = maskComments(source);
  let count = 0;
  const unitMap: Record<string, string> = {
    ether: "10**18",
    gwei: "10**9",
    wei: "1",
  };
  const next = masked.masked
    .replace(/\bWei\(\s*["'](\d+(?:\.\d+)?)\s+(ether|gwei|wei)["']\s*\)/gi, (_match, amount: string, unit: string) => {
      count += 1;
      const multiplier = unitMap[unit.toLowerCase()] ?? "10**18";
      return `${amount} * ${multiplier}`;
    })
    .replace(/\bWei\(([^)]+)\)/g, (_match, expr: string) => {
      count += 1;
      return `Wei(${expr})  # TODO(apeshift): replace Wei() with ape.convert() or explicit int`;
    });
  return { source: masked.restore(next), count };
}

function convertNetworks(source: string): TransformResult {
  const masked = maskLiterals(source);
  let count = 0;
  let next = masked.masked.replace(/^import brownie\.network as network$/gm, () => {
    count += 1;
    return "from ape import networks";
  });
  next = next.replace(/\bnetwork\.show_active\(\)/g, () => {
    count += 1;
    return "networks.provider.network.name";
  });
  next = next.replace(/\bnetwork\.connect\(\s*([^)]+)\s*\)/g, (_m, choice: string) => {
    count += 1;
    return `# TODO(apeshift): use with networks.parse_network_choice(${choice.trim()}): context manager`;
  });
  next = next.replace(/\bnetwork\.disconnect\(\s*\)/g, () => {
    count += 1;
    return "# TODO(apeshift): Ape uses context managers; remove disconnect";
  });
  next = next.replace(/\bnetwork\.is_connected\(\s*\)/g, () => {
    count += 1;
    return "networks.provider is not None";
  });
  next = next.replace(/\bnetwork\.gas_price\(\s*\)/g, () => {
    count += 1;
    return "networks.provider.gas_price";
  });
  next = next.replace(/\bnetwork\.gas_limit\(\s*\)/g, () => {
    count += 1;
    return "networks.provider.settings.gas_limit";
  });
  next = masked.restore(next);
  if (count > 0) next = ensureApeImport(next, ["networks"]);
  return { source: next, count };
}

function convertAdditionalPatterns(source: string): TransformResult {
  const masked = maskLiterals(source);
  let count = 0;
  let next = masked.masked;
  next = next.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.wait\(([^)]*)\)/g, (_m, tx: string, arg: string) => {
    count += 1;
    return `${tx}.wait_confirmations(${arg.trim()})`;
  });
  next = next.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.revert_msg\b/g, (_m, tx: string) => {
    count += 1;
    return `${tx}.revert_message`;
  });
  next = next.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.events\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\]/g, (_m, tx: string, ev: string) => {
    count += 1;
    return `${tx}.events.filter(contract.${ev})  # TODO(apeshift): verify event class source`;
  });
  next = next.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.status\s*==\s*1\b/g, (_m, tx: string) => {
    count += 1;
    return `${tx}.status == TransactionStatusEnum.passing  # TODO(apeshift): verify enum import`;
  });
  next = next.replace(/\baccounts\.add\(([^)]+)\)/g, () => {
    count += 1;
    return 'accounts.load("alias")  # TODO(apeshift): migrate key handling';
  });
  next = next.replace(/\baccounts\.default\b/g, () => {
    count += 1;
    return "accounts.default  # TODO(apeshift): verify default account config";
  });
  next = next.replace(/\bContract\.from_explorer\(([^)]+)\)/g, (_m, addr: string) => {
    count += 1;
    return `Contract.at(${addr.trim()})  # TODO(apeshift): ensure explorer plugin`;
  });
  next = next.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.transfer\.call\(([^)]*)\)/g, (_m, token: string, args: string) => {
    count += 1;
    return `${token}.transfer(${args})  # TODO(apeshift): confirm call semantics`;
  });
  next = next.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.functions\.transfer\(([^)]*)\)/g, (_m, token: string, args: string) => {
    count += 1;
    return `${token}.transfer(${args})  # TODO(apeshift): web3 style removed`;
  });
  next = next.replace(/\bbrownie\.test\.strategy\(([^)]*)\)/g, (_m, args: string) => {
    count += 1;
    return `# TODO(apeshift): use hypothesis directly; brownie.test.strategy(${args}) has no Ape equivalent`;
  });
  next = next.replace(/\bconfig\[\s*["']wallets["']\s*\]\[\s*["']from_key["']\s*\]/g, () => {
    count += 1;
    return "accounts.load(...)  # TODO(apeshift): migrate from_key to ape accounts import";
  });
  next = next.replace(/\bconfig\[\s*["']networks["']\s*\]\[\s*([^\]]+)\s*\]/g, () => {
    count += 1;
    return "networks.provider.network  # TODO(apeshift): move to ape-config/networks.provider";
  });
  next = next.replace(/def\s+([A-Za-z_][A-Za-z0-9_]*)\(([^)]*\bweb3\b[^)]*)\)\s*:/g, (_m, fn: string, args: string) => {
    count += 1;
    return `def ${fn}(${args}):  # TODO(apeshift): replace web3 fixture with provider`;
  });
  return { source: masked.restore(next), count };
}

function convertPlainBrownieImports(source: string): TransformResult {
  let count = 0;
  let next = source.replace(/^import brownie$/gm, () => {
    count += 1;
    return "import ape";
  });
  next = next.replace(/^from brownie\.network import priority_fee$/gm, () => {
    count += 1;
    return "# TODO(apeshift): Ape does not export Brownie's priority_fee helper; configure gas fees via the active provider";
  });
  next = next.replace(/^\s*priority_fee\((.*)\)$/gm, (line) => {
    count += 1;
    const indent = line.match(/^\s*/)?.[0] ?? "";
    return `${indent}# TODO(apeshift): replace Brownie priority_fee(${line.replace(/^\s*priority_fee\(|\)$/g, "")}) with Ape provider fee configuration`;
  });
  return { source: next, count };
}

function convertProjectDeploys(source: string): TransformResult {
  let count = 0;
  const next = source.replace(/(?<!\.)\b([A-Z][A-Za-z0-9_]*)\.deploy\(/g, (match, contract: string) => {
    if (match.startsWith("project.")) return match;
    count += 1;
    return `project.${contract}.deploy(`;
  });
  return { source: count > 0 ? ensureApeImport(next, ["project"]) : next, count };
}

function convertInterfaceCalls(source: string): TransformResult {
  let count = 0;
  const next = source.replace(/\binterface\.([A-Za-z_][A-Za-z0-9_]*)\(([^)\n]+)\)/g, (_match, name: string, address: string) => {
    count += 1;
    return `project.${name}.at(${address})`;
  });
  return { source: count > 0 ? ensureApeImport(next, ["project"]) : next, count };
}

function convertWeb3ContractFactory(source: string): TransformResult {
  let count = 0;
  const next = source.replace(/\bweb3\.eth\.contract\(/g, () => {
    count += 1;
    return "Contract(";
  });
  return { source: count > 0 ? ensureApeImport(next, ["Contract"]) : next, count };
}

function convertContractNames(source: string): TransformResult {
  const contractNames = collectContractNames(source);
  let count = 0;
  let next = source;
  for (const name of contractNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next
      .replace(new RegExp(`(?<!\\.)\\b${escaped}\\[-1\\]`, "g"), () => {
        count += 1;
        return `project.${name}.deployments[-1]`;
      })
      .replace(new RegExp(`(?<!\\.)\\b${escaped}\\.deploy\\(`, "g"), () => {
        count += 1;
        return `project.${name}.deploy(`;
      })
      .replace(new RegExp(`(:\\s*)${escaped}(\\s*[,}])`, "g"), (_match, before: string, after: string) => {
        count += 1;
        return `${before}project.${name}${after}`;
      });
  }
  if (count > 0) next = ensureApeImport(next, ["project"]);
  return { source: next, count };
}

function convertRemainingEdges(source: string): TransformResult {
  let count = 0;
  let next = source.replace(/\bexceptions\.VirtualMachineError\b/g, () => {
    count += 1;
    return "ContractLogicError";
  });
  next = next.replace(/\bbrownie\.convert\.to_uint\b/g, () => {
    count += 1;
    return "int  # TODO(apeshift): brownie.convert.to_uint → use int() or ape.convert()";
  });
  next = next.replace(/\bbrownie\.convert\b/g, () => {
    count += 1;
    return "convert  # TODO(apeshift): verify brownie.convert migration to ape.convert()";
  });
  next = next.replace(/\bbrownie\.multicall\b/g, () => {
    count += 1;
    return "# TODO(apeshift): brownie.multicall has no direct Ape equivalent; use ape-safe or manual batching";
  });

  if (source !== next) {
    if (next.includes("ContractLogicError")) next = ensureExceptionImport(next);
  }
  return { source: next, count };
}

function convertContractDeployments(source: string): TransformResult {
  const contractNames = collectContractNames(source);
  let count = 0;
  let next = source;
  for (const name of contractNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(`(?<!\\.)\\b${escaped}\\[-1\\]`, "g"), () => {
      count += 1;
      return `project.${name}.deployments[-1]`;
    });
  }
  if (count > 0) next = ensureApeImport(next, ["project"]);
  return { source: next, count };
}

function normalizeApeImports(source: string): TransformResult {
  const lines = source.split(/\r?\n/);
  const names = new Set<string>();
  const output: string[] = [];
  let removed = 0;
  const insertAt = lines[0]?.startsWith("#!") ? 1 : 0;
  let inMultilineImport = false;

  for (const line of lines) {
    // Inside a multiline "from ape import (\n    name,\n)" block
    if (inMultilineImport) {
      removed += 1;
      if (line.trim() === ")") {
        inMultilineImport = false;
      } else {
        const name = line.trim().replace(/,$/, "");
        if (name && name !== "interface") names.add(name);
      }
      continue;
    }

    // Opening of a multiline block: "from ape import ("
    if (/^from ape import \(\s*$/.test(line)) {
      inMultilineImport = true;
      removed += 1;
      continue;
    }

    // Single-line: "from ape import name1, name2"
    const match = line.match(/^from ape import (.+)$/);
    if (match) {
      removed += 1;
      for (const name of parseImportNames(match[1] ?? "")) {
        if (name !== "interface") names.add(name);
      }
      continue;
    }

    output.push(line);
  }

  if (names.size === 0) return { source, count: 0 };
  const importLine = `from ape import ${[...names].sort().join(", ")}`;
  output.splice(insertAt, 0, importLine);
  return { source: output.join("\n"), count: Math.max(removed - 1, 0) };
}

const cleanupSteps = [
  convertWei,
  convertSenderDicts,
  convertPlainBrownieImports,
  convertAccounts,
  convertAccountsAt,
  convertChainSleep,
  convertHistory,
  convertNetworks,
  convertAdditionalPatterns,
  convertInterfaceCalls,
  convertWeb3ContractFactory,
  convertContractNames,
  convertProjectDeploys,
  convertContractDeployments,
  convertRemainingEdges,
  removeMigratedBrownieImports,
  convertMultilineBrownieImports,
  removeMigratedBrownieImports,
  normalizeApeImports,
];

export const cleanupTransform: TransformModule = {
  name: "cleanup",
  rulePath: "src/transforms/cleanup/index.ts",
  apply(source) {
    let count = 0;
    let next = source;
    for (const step of cleanupSteps) {
      const result = step(next);
      next = result.source;
      count += result.count;
    }
    return { source: next, count };
  },
};

export default cleanupTransform;
