import type { TransformModule, TransformResult } from "../types.js";

const brownieNames = new Set([
  "accounts",
  "chain",
  "config",
  "Contract",
  "convert",
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
  const needed = names.filter((name) => !new RegExp(`^from ape import .*\\b${name}\\b`, "m").test(source));
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
  let count = 0;
  let next = source.replace(/\baccounts\[(\d+)\]/g, (_match, index: string) => {
    count += 1;
    return `accounts.test_accounts[${index}]`;
  });
  if (count > 0) next = ensureApeImport(next, ["accounts"]);
  return { source: next, count };
}

function convertNetworks(source: string): TransformResult {
  let count = 0;
  let next = source.replace(/^import brownie\.network as network$/gm, () => {
    count += 1;
    return "from ape import networks";
  });
  next = next.replace(/\bnetwork\.show_active\(\)/g, () => {
    count += 1;
    return "networks.provider.network.name";
  });
  if (count > 0) next = ensureApeImport(next, ["networks"]);
  return { source: next, count };
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
  let insertAt = lines[0]?.startsWith("#!") ? 1 : 0;

  for (const line of lines) {
    const match = line.match(/^from ape import (.+)$/);
    if (!match) {
      output.push(line);
      continue;
    }
    removed += 1;
    for (const name of parseImportNames(match[1] ?? "")) {
      if (name !== "interface") names.add(name);
    }
  }

  if (names.size === 0) return { source, count: 0 };
  const importLine = `from ape import ${[...names].sort().join(", ")}`;
  output.splice(insertAt, 0, importLine);
  return { source: output.join("\n"), count: Math.max(removed - 1, 0) };
}

const cleanupSteps = [
  convertSenderDicts,
  convertPlainBrownieImports,
  convertAccounts,
  convertNetworks,
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
