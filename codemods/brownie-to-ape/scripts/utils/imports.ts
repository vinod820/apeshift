// @ts-nocheck — JSSG ast-grep Python node kinds extend beyond the bundled `Kinds<>` union.
import type { SgNode } from "codemod:ast-grep";

// Known Brownie→Ape name mappings
export const BROWNIE_TO_APE: Record<string, string> = {
  accounts: "accounts",
  chain: "chain",
  config: "config",
  Contract: "Contract",
  convert: "convert",
  network: "networks",
  project: "project",
  reverts: "reverts",
};

// Returns true if name is a known Ape export
export function isKnownApeExport(name: string): boolean {
  return name in BROWNIE_TO_APE;
}

// Returns true if name looks like a contract class (starts with uppercase)
export function isContractClass(name: string): boolean {
  return /^[A-Z]/.test(name) && name !== "Contract";
}

// Maps a brownie import name to its ape equivalent
export function mapToApe(name: string): string {
  return BROWNIE_TO_APE[name] ?? name;
}

// Builds "from ape import X, Y, Z" line from list of names
export function buildApeImport(names: string[]): string {
  return `from ape import ${[...new Set(names)].sort().join(", ")}`;
}

const TODO_WILDCARD =
  "from brownie import *  # TODO(brownie-to-ape): replace wildcard import with explicit ape imports";

export function wildcardFromBrownieLine(): string {
  return TODO_WILDCARD;
}

const TODO_PRIORITY =
  "# TODO(brownie-to-ape): replace Brownie priority_fee with Ape provider fee configuration";

export function priorityFeeTodoText(): string {
  return TODO_PRIORITY;
}

export function getImportKeywordIndex(importFrom: SgNode<"python">): number {
  const children = importFrom.children();
  for (let i = 0; i < children.length; i++) {
    if (children[i]!.text() === "import") return i;
  }
  return -1;
}

export function getModuleDottedName(importFrom: SgNode<"python">): string | null {
  const chs = importFrom.children();
  const importIdx = getImportKeywordIndex(importFrom);
  if (importIdx <= 0) return null;
  for (let i = 0; i < importIdx; i++) {
    const c = chs[i]!;
    const t = c.text().trim();
    if (t === "from") continue;
    if (c.kind() === "dotted_name" || c.kind() === "relative_import") return c.text();
    const nested = firstDottedNameInTree(c);
    if (nested) return nested;
  }
  return null;
}

export function isWildcardFromBrownie(importFrom: SgNode<"python">): boolean {
  const module = getModuleDottedName(importFrom);
  if (module !== "brownie") return false;
  const importIdx = getImportKeywordIndex(importFrom);
  if (importIdx < 0) return false;
  const after = importFrom.children().slice(importIdx + 1);
  for (const c of after) {
    if (c.kind() === "wildcard_import") return true;
    if (c.text() === "*") return true;
  }
  return false;
}

export function firstDottedNameInTree(node: SgNode<"python">): string | null {
  const q: SgNode<"python">[] = [node];
  while (q.length) {
    const n = q.shift()!;
    if (n.kind() === "dotted_name") return n.text();
    for (const c of n.children()) q.push(c);
  }
  return null;
}

export function listDottedAsNames(importFrom: SgNode<"python">): SgNode<"python">[] {
  const importIdx = getImportKeywordIndex(importFrom);
  if (importIdx < 0) return [];
  const result: SgNode<"python">[] = [];
  const after = importFrom.children().slice(importIdx + 1);
  for (const c of after) {
    if (c.kind() === "wildcard_import") continue;
    const raw = c.text().trim();
    if (raw === "(" || raw === ")" || raw === ",") continue;
    if (c.kind() === "import_from_as_names" || c.kind() === "dotted_as_names") {
      for (const ch of c.children()) {
        const txt = ch.text().trim();
        if (txt === "," || txt.length === 0) continue;
        result.push(ch);
      }
      continue;
    }
    result.push(c);
  }
  return result;
}

export function dottedAsNameToLocalName(dottedAsName: SgNode<"python">): string | null {
  const asKw = dottedAsName.children().find((ch) => ch.text() === "as");
  if (asKw) {
    const after = dottedAsName.children().filter(
      (ch) => ch.range().start.index > asKw.range().start.index,
    );
    const lastId = [...after].reverse().find((ch) => ch.kind() === "identifier");
    return lastId?.text() ?? null;
  }
  const sym = firstDottedNameInTree(dottedAsName);
  if (!sym) return null;
  return sym.split(".").pop() ?? null;
}

export function dottedAsNameToImportedSymbol(dottedAsName: SgNode<"python">): string | null {
  const asKw = dottedAsName.children().find((ch) => ch.text() === "as");
  if (!asKw) {
    return firstDottedNameInTree(dottedAsName);
  }
  const before = dottedAsName.children().filter(
    (ch) => ch.range().start.index < asKw.range().start.index,
  );
  for (const ch of before) {
    const dn = firstDottedNameInTree(ch);
    if (dn) return dn;
  }
  return firstDottedNameInTree(dottedAsName);
}
