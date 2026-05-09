import type { TransformModule, TransformResult } from "../types.js";
import {
  findClosingParenBalanced,
  getPythonMaskedRanges,
  overlapsMasked,
  replaceAllRegexOutsideComments,
  replaceAllRegexOutsideMasked,
} from "../py-mask.js";

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

function convertSenderDicts(source: string): TransformResult {
  let total = 0;
  const patterns: Array<[RegExp, string]> = [
    [/,?\s*\{\s*["']from["']\s*:\s*([^,}\n]+)\s*,\s*["']value["']\s*:\s*([^,}\n]+)\s*\}/g, ", value=$2, sender=$1"],
    [/,?\s*\{\s*["']value["']\s*:\s*([^,}\n]+)\s*,\s*["']from["']\s*:\s*([^,}\n]+)\s*\}/g, ", value=$1, sender=$2"],
    [/,?\s*\{\s*["']from["']\s*:\s*([^,}\n]+)\s*,\s*["']gas_limit["']\s*:\s*([^,}\n]+)\s*\}/g, ", gas_limit=$2, sender=$1"],
    [/,?\s*\{\s*["']from["']\s*:\s*([^,}\n]+)\s*,\s*["']gas_price["']\s*:\s*([^,}\n]+)\s*\}/g, ", gas_price=$2, sender=$1"],
    [/,?\s*\{\s*["']from["']\s*:\s*([^,}\n]+)\s*\}/g, ", sender=$1"],
  ];
  let next = source;
  for (const [pattern, replacement] of patterns) {
    const r = replaceAllRegexOutsideComments(next, pattern, (m) =>
      replacement.replace(/\$(\d+)/g, (_token, index) => m[Number(index)] ?? ""),
    );
    next = r.source;
    total += r.count;
  }
  const paren = replaceAllRegexOutsideComments(next, /\(\s*,\s*(sender|value|gas_limit|gas_price)=/g, (m) => `(${m[1]}=`);
  next = paren.source;
  total += paren.count;
  return { source: next, count: total };
}

/** When sender= was merged into trailing #-comment text, move it to a real continuation line. */
function repairSenderKwargTrappedInComment(source: string): TransformResult {
  const lines = source.split(/\r?\n/);
  let count = 0;
  const out = lines.map((line) => {
    const idx = line.indexOf("#");
    if (idx === -1) return line;
    const beforeHash = line.slice(0, idx);
    const afterHash = line.slice(idx + 1);
    const sm = afterHash.match(/^(.*?),\s*sender\s*=\s*([A-Za-z_]\w*)\s*,?\s*$/);
    if (!sm) return line;
    const commentLead = sm[1]?.trim() ?? "";
    if (!commentLead) return line;
    const senderName = sm[2] ?? "";
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch?.[1] ?? "";
    count += 1;
    return `${beforeHash}# ${commentLead}\n${indent}sender=${senderName},`;
  });
  return { source: out.join("\n"), count };
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
  next = next.replace(/\bnetwork\s*\.\s*show_active\s*\(\s*\)/g, () => {
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
  // Leave Brownie `priority_fee` imports/calls untouched — replacing calls with TODO-only lines is unsafe (FP3).
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
  const { source: next, count } = replaceAllRegexOutsideMasked(
    source,
    /\binterface\.([A-Za-z_][A-Za-z0-9_]*)\(([^)\n]+)\)/g,
    (m) => `project.${m[1] ?? ""}.at(${m[2] ?? ""})`,
  );
  return { source: count > 0 ? ensureApeImport(next, ["project"]) : next, count };
}

function splitTopLevelArgs(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let inStr: '"' | "'" | null = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inStr) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === "(" || ch === "[") depth += 1;
    if (ch === ")" || ch === "]") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(inner.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

function convertContractFromAbi(source: string): TransformResult {
  const ranges = getPythonMaskedRanges(source);
  const needle = /\bContract\.from_abi\s*\(/g;
  let count = 0;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = needle.exec(source)) !== null) {
    const idx = m.index;
    if (overlapsMasked(idx, m[0].length, ranges)) continue;
    const openParen = idx + m[0].length - 1;
    const closeIdx = findClosingParenBalanced(source, openParen, ranges);
    if (closeIdx === null) continue;
    const inner = source.slice(openParen + 1, closeIdx);
    const args = splitTopLevelArgs(inner);
    if (args.length < 2) continue;
    const addr = args[1]!.trim();
    out += source.slice(last, idx);
    out += `Contract.at(${addr})  # TODO(apeshift): verify ABI — contract_type._name and .abi ignored`;
    last = closeIdx + 1;
    count += 1;
  }
  out += source.slice(last);
  const next = count > 0 ? ensureApeImport(out, ["Contract"]) : out;
  return { source: next, count };
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

/** Bare contract-class uses that must be project.-qualified (publish_source, verification, subscripts). */
function prefixBareContractArtifacts(source: string): TransformResult {
  const contractNames = collectContractNames(source);
  let total = 0;
  let next = source;
  for (const name of contractNames) {
    if (name === "Contract") continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const [pattern, repl] of [
      [new RegExp(`(?<!\\.)\\b${escaped}\\.publish_source\\(`, "g"), `project.${name}.publish_source(`],
      [new RegExp(`(?<!\\.)\\b${escaped}\\.get_verification_info\\(`, "g"), `project.${name}.get_verification_info(`],
      [new RegExp(`(?<!\\.)\\b${escaped}\\[`, "g"), `project.${name}[`],
    ] as const) {
      const r = replaceAllRegexOutsideMasked(next, pattern, () => repl);
      next = r.source;
      total += r.count;
    }
  }
  return { source: total > 0 ? ensureApeImport(next, ["project"]) : next, count: total };
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
  convertSenderDicts,
  repairSenderKwargTrappedInComment,
  convertPlainBrownieImports,
  convertAccounts,
  convertNetworks,
  convertInterfaceCalls,
  convertContractFromAbi,
  convertWeb3ContractFactory,
  convertContractNames,
  convertProjectDeploys,
  prefixBareContractArtifacts,
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
