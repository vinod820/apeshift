// @ts-nocheck — JSSG ast-grep Python node kinds extend beyond the bundled `Kinds<>` union.
import type { Codemod, Edit, SgNode } from "codemod:ast-grep";
import { useMetricAtom } from "codemod:metrics";
import { isInsideApeFixture } from "./utils/accounts.ts";
import { isAlreadyProjectPrefixed } from "./utils/contracts.ts";
import {
  buildApeImport,
  dottedAsNameToImportedSymbol,
  getModuleDottedName,
  isContractClass,
  isKnownApeExport,
  isWildcardFromBrownie,
  listDottedAsNames,
  mapToApe,
  priorityFeeTodoText,
  wildcardFromBrownieLine,
} from "./utils/imports.ts";
import {
  getCallFunctionNode,
  getDictionaryPairStringKey,
  getDictionaryPairValueNode,
  splitPairKeyValue,
  stripPythonStringLiteral,
} from "./utils/python.ts";

const migratedImport = useMetricAtom("migrated_import");
const migratedSender = useMetricAtom("migrated_sender");
const migratedAccount = useMetricAtom("migrated_account");
const normalizedImports = useMetricAtom("normalized_imports");

function isBindingInsideBrownieFromImport(id: SgNode<"python">): boolean {
  let p: SgNode<"python"> | null = id.parent();
  while (p) {
    if (p.kind() === "import_from_statement") {
      const mod = getModuleDottedName(p);
      return mod === "brownie";
    }
    p = p.parent();
  }
  return false;
}

function contractClassUsedOutsideBrownieImport(
  root: SgNode<"python">,
  name: string,
): boolean {
  for (const id of root.findAll({ rule: { kind: "identifier" } })) {
    if (id.text() !== name) continue;
    if (isBindingInsideBrownieFromImport(id)) continue;
    return true;
  }
  return false;
}

function fileUsesVirtualMachineError(root: SgNode<"python">): boolean {
  for (const node of root.findAll({ rule: { kind: "attribute" } })) {
    if (isAttributeAccessNode(node, ["exceptions", "VirtualMachineError"])) return true;
    if (isAttributeAccessNode(node, ["brownie", "exceptions", "VirtualMachineError"])) return true;
  }
  return false;
}

function fileUsesBrownieQualifiedVmError(root: SgNode<"python">): boolean {
  for (const node of root.findAll({ rule: { kind: "attribute" } })) {
    if (isAttributeAccessNode(node, ["brownie", "exceptions", "VirtualMachineError"])) return true;
  }
  return false;
}

function parseAttributeChain(node: SgNode<"python">): string[] {
  const parts: string[] = [];
  let cur: SgNode<"python"> | null = node;
  while (cur) {
    if (cur.kind() === "attribute") {
      const attrField = cur.field("attribute");
      const attrName =
        (attrField?.kind() === "identifier" ? attrField.text() : attrField?.text()) ??
        cur.child(2)?.text();
      if (!attrName) break;
      parts.push(attrName);
      const objField = cur.field("object");
      cur = (objField as SgNode<"python"> | null) ?? (cur.child(0) as SgNode<"python"> | null);
      continue;
    }
    if (cur.kind() === "identifier") {
      parts.push(cur.text());
      break;
    }
    break;
  }
  return parts.reverse();
}

function isCallToDotted(call: SgNode<"python">, parts: string[]): boolean {
  if (call.kind() !== "call") return false;
  const fn = getCallFunctionNode(call);
  if (!fn) return false;
  const chain = parseAttributeChain(fn);
  if (chain.length !== parts.length) return false;
  for (let i = 0; i < parts.length; i++) {
    if (chain[i] !== parts[i]) return false;
  }
  return true;
}

function isAttributeAccessNode(node: SgNode<"python">, parts: string[]): boolean {
  const chain = parseAttributeChain(node);
  if (chain.length !== parts.length) return false;
  for (let i = 0; i < parts.length; i++) {
    if (chain[i] !== parts[i]) return false;
  }
  return true;
}

function isUnderArgumentList(node: SgNode<"python">): boolean {
  let p: SgNode<"python"> | null = node.parent();
  while (p) {
    if (p.kind() === "argument_list") return true;
    p = p.parent();
  }
  return false;
}

function fileHasBrownieImport(root: SgNode<"python">): boolean {
  for (const imp of root.findAll({ rule: { kind: "import_from_statement" } })) {
    if (getModuleDottedName(imp) === "brownie") return true;
  }
  for (const imp of root.findAll({ rule: { kind: "import_statement" } })) {
    const mod = firstDeepDottedName(imp);
    if (mod === "brownie") return true;
  }
  return false;
}

function subscriptValueNode(sub: SgNode<"python">): SgNode<"python"> | null {
  const v =
    (sub.field("value") as SgNode<"python"> | null | undefined) ??
    (sub.field("object") as SgNode<"python"> | null | undefined);
  if (v) return v;
  return sub.child(0) as SgNode<"python"> | null;
}

function intLiteralIndexText(sub: SgNode<"python">): string | null {
  const sliceNode =
    (sub.field("subscript") as SgNode<"python"> | null | undefined) ??
    (sub.field("slice") as SgNode<"python"> | null | undefined);
  const walk = (n: SgNode<"python">): string | null => {
    if (n.kind() === "integer") return n.text();
    // e.g. `-1` is often parsed as unary_operator `-` + integer `1`
    if (n.kind() === "unary_operator") {
      for (const ch of n.children()) {
        if (ch.kind() === "integer") {
          const raw = n.text().trim();
          if (raw.startsWith("-")) return `-${ch.text()}`;
        }
      }
    }
    for (const ch of n.children()) {
      const t = walk(ch as SgNode<"python">);
      if (t) return t;
    }
    return null;
  };
  if (sliceNode) {
    const w = walk(sliceNode as SgNode<"python">);
    if (w) return w;
  }
  let inBracket = false;
  for (const ch of sub.children()) {
    if (ch.text() === "[") {
      inBracket = true;
      continue;
    }
    if (ch.text() === "]") break;
    if (!inBracket) continue;
    if (ch.kind() === "integer") return ch.text();
    if (ch.kind() === "unary_operator") {
      const w = walk(ch as SgNode<"python">);
      if (w) return w;
    }
    const t = ch.text().trim();
    if (/^-?\d+$/.test(t)) return t;
  }
  return null;
}

function isFromDictAccountsSubscript(sub: SgNode<"python">): boolean {
  const p = sub.parent();
  if (!p || p.kind() !== "pair") return false;
  return getDictionaryPairStringKey(p) === "from";
}

function rewriteFromValueForSender(valNode: SgNode<"python">): string {
  if (
    valNode.kind() === "subscript" &&
    subscriptValueNode(valNode)?.text() === "accounts" &&
    intLiteralIndexText(valNode) &&
    !isInsideApeFixture(valNode)
  ) {
    const idx = intLiteralIndexText(valNode);
    return `accounts.test_accounts[${idx}]`;
  }
  return valNode.text();
}

function immediateStringKeyForSubscript(sub: SgNode<"python">): string | null {
  let seenBracket = false;
  for (const ch of sub.children()) {
    if (ch.text() === "[") seenBracket = true;
    if (seenBracket && ch.kind() === "string") {
      return stripPythonStringLiteral(ch.text());
    }
  }
  return null;
}

function immediateIntegerForSubscript(sub: SgNode<"python">): string | null {
  for (const ch of sub.children()) {
    if (ch.kind() === "integer") return ch.text();
  }
  return null;
}

function isTxEventsAttribute(node: SgNode<"python">): boolean {
  if (node.kind() !== "attribute") return false;
  const o = node.child(0);
  const a = node.field("attribute")?.text() ?? node.child(2)?.text();
  return o?.text() === "tx" && a === "events";
}

function tryReplaceLongTxEventChain(
  sub: SgNode<"python">,
  edits: Edit[],
  inc: () => void,
): boolean {
  if (sub.kind() !== "subscript") return false;
  const fieldName = immediateStringKeyForSubscript(sub);
  if (fieldName === null) return false;
  const mid = sub.child(0);
  if (!mid || mid.kind() !== "subscript") return false;
  const idx0Text = immediateIntegerForSubscript(mid);
  if (!idx0Text || idx0Text !== "0") return false;
  const inner = mid.child(0);
  if (!inner || inner.kind() !== "subscript") return false;
  const eventName = immediateStringKeyForSubscript(inner);
  if (!eventName) return false;
  const base = inner.child(0);
  if (!base || !isTxEventsAttribute(base)) return false;
  const replacement = `tx.events.filter(contract.${eventName})[0].${fieldName}`;
  edits.push(sub.replace(replacement));
  inc();
  return true;
}

function tryReplaceTxEventsBracket(
  sub: SgNode<"python">,
  edits: Edit[],
  inc: () => void,
): boolean {
  if (sub.parent()?.kind() === "subscript") return false;
  const obj = sub.child(0);
  if (!obj || !isTxEventsAttribute(obj)) return false;
  const ev = immediateStringKeyForSubscript(sub);
  if (!ev) return false;
  const replacement = `tx.events.filter(contract.${ev})`;
  edits.push(sub.replace(replacement));
  inc();
  return true;
}

function firstDeepDottedName(node: SgNode<"python">): string | null {
  const queue: SgNode<"python">[] = [node];
  while (queue.length) {
    const n = queue.shift()!;
    if (n.kind() === "dotted_name") return n.text();
    for (const c of n.children()) queue.push(c);
  }
  return null;
}

function collectDictionaryNodes(rootNode: SgNode<"python">): SgNode<"python">[] {
  const byStart = new Map<number, SgNode<"python">>();
  const add = (n: SgNode<"python"> | null | undefined) => {
    if (!n || n.kind() !== "dictionary") return;
    byStart.set(n.range().start.index, n);
  };
  for (const d of rootNode.findAll({ rule: { kind: "dictionary" } })) {
    add(d);
  }
  for (const call of rootNode.findAll({ rule: { kind: "call" } })) {
    const al = call.find({ rule: { kind: "argument_list" } });
    if (!al) continue;
    for (const ch of al.children()) {
      add(ch as SgNode<"python">);
    }
  }
  return [...byStart.values()];
}

const codemod: Codemod<"python"> = async (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  const pushReplace = (node: SgNode<"python">, text: string, metric?: () => void) => {
    edits.push(node.replace(text));
    metric?.();
  };

  function collectBrownieContractNames(root: SgNode<"python">): Set<string> {
    const names = new Set<string>();
    for (const imp of root.findAll({ rule: { kind: "import_from_statement" } })) {
      if (getModuleDottedName(imp) !== "brownie") continue;
      for (const da of listDottedAsNames(imp)) {
        const sym = dottedAsNameToImportedSymbol(da);
        if (sym && isContractClass(sym)) names.add(sym);
        else if (da.kind() === "identifier" && isContractClass(da.text())) names.add(da.text());
      }
    }
    return names;
  }

  const brownieContractNames = collectBrownieContractNames(rootNode);
  const hasBrownieImport = fileHasBrownieImport(rootNode);

  for (const imp of rootNode.findAll({ rule: { kind: "import_from_statement" } })) {
    const mod = getModuleDottedName(imp);
    if (mod !== "brownie") continue;
    const names = listDottedAsNames(imp);
    const syms = names.map(dottedAsNameToImportedSymbol).filter(Boolean);
    const onlyRevertImport =
      (syms.length === 1 && syms[0] === "reverts") ||
      (names.length === 1 &&
        names[0]!.kind() === "identifier" &&
        names[0]!.text() === "reverts");
    if (onlyRevertImport) {
      pushReplace(imp, "from ape import reverts", () => migratedImport.increment());
    }
  }

  for (const importFrom of rootNode.findAll({
    rule: { kind: "import_from_statement" },
  })) {
    const module = getModuleDottedName(importFrom);
    if (!module) continue;

    if (module === "brownie.network") {
      if (importFrom.text().includes("priority_fee")) {
        pushReplace(importFrom, priorityFeeTodoText(), () => migratedImport.increment());
      }
      continue;
    }

    if (module !== "brownie") continue;

    if (isWildcardFromBrownie(importFrom)) {
      pushReplace(importFrom, wildcardFromBrownieLine(), () => migratedImport.increment());
      continue;
    }

    const dottedPre = listDottedAsNames(importFrom);
    if (dottedPre.length === 1) {
      const d0 = dottedPre[0]!;
      const s0 = dottedAsNameToImportedSymbol(d0);
      const isExceptionsOnly =
        s0 === "exceptions" || (d0.kind() === "identifier" && d0.text() === "exceptions");
      if (isExceptionsOnly && fileUsesVirtualMachineError(rootNode)) continue;
    }

    const dotted = listDottedAsNames(importFrom);
    const apeNames = new Set<string>();
    let needsProject = false;

    for (const da of dotted) {
      const sym = dottedAsNameToImportedSymbol(da);
      if (!sym) continue;

      if (sym === "web3") {
        apeNames.add("chain");
        apeNames.add("networks");
        apeNames.add("provider");
        continue;
      }

      if (isKnownApeExport(sym)) {
        apeNames.add(mapToApe(sym));
        continue;
      }

      if (isContractClass(sym)) {
        if (contractClassUsedOutsideBrownieImport(rootNode, sym)) needsProject = true;
        continue;
      }

      needsProject = true;
    }

    if (needsProject) apeNames.add("project");
    if (apeNames.size === 0) continue;
    pushReplace(importFrom, buildApeImport([...apeNames]), () => migratedImport.increment());
  }

  for (const imp of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    const mod = firstDeepDottedName(imp);
    if (mod === "brownie") {
      if (fileUsesBrownieQualifiedVmError(rootNode)) {
        pushReplace(
          imp,
          "import ape\nfrom ape.exceptions import ContractLogicError",
          () => migratedImport.increment(),
        );
      } else {
        pushReplace(imp, "import ape", () => migratedImport.increment());
      }
      continue;
    }
    if (mod === "brownie.network") {
      pushReplace(imp, "", () => migratedImport.increment());
    }
  }

  if (fileUsesVirtualMachineError(rootNode)) {
    for (const importFrom of rootNode.findAll({
      rule: { kind: "import_from_statement" },
    })) {
      if (getModuleDottedName(importFrom) !== "brownie") continue;
      if (!importFrom.text().includes("exceptions")) continue;
      const names = listDottedAsNames(importFrom);
      const sym = dottedAsNameToImportedSymbol(names[0]!);
      const onlyExceptions =
        names.length === 1 &&
        (sym === "exceptions" ||
          (names[0]!.kind() === "identifier" && names[0]!.text() === "exceptions"));
      if (onlyExceptions) {
        pushReplace(
          importFrom,
          "from ape.exceptions import ContractLogicError",
          () => migratedImport.increment(),
        );
      }
    }

    for (const attr of rootNode.findAll({ rule: { kind: "attribute" } })) {
      if (
        !isAttributeAccessNode(attr, ["exceptions", "VirtualMachineError"]) &&
        !isAttributeAccessNode(attr, ["brownie", "exceptions", "VirtualMachineError"])
      )
        continue;
      pushReplace(attr, "ContractLogicError");
    }
  }

  for (const sub of rootNode.findAll({ rule: { kind: "subscript" } })) {
    const obj = subscriptValueNode(sub);
    if (!obj || obj.kind() !== "identifier" || obj.text() !== "accounts") continue;
    if (!hasBrownieImport) continue;
    const intText = intLiteralIndexText(sub);
    if (!intText) continue;
    if (isInsideApeFixture(sub)) continue;
    if (isFromDictAccountsSubscript(sub)) continue;
    pushReplace(sub, `accounts.test_accounts[${intText}]`, () =>
      migratedAccount.increment(),
    );
  }

  const seenDict = new Set<number>();
  for (const dict of collectDictionaryNodes(rootNode)) {
    if (
      !dict.text().includes("'from'") &&
      !dict.text().includes('"from"')
    )
      continue;
    if (!isUnderArgumentList(dict)) continue;
    const start = dict.range().start.index;
    if (seenDict.has(start)) continue;

    let pairs = dict.findAll({ rule: { kind: "pair" } });
    if (pairs.length === 0) {
      pairs = dict
        .children()
        .filter((c) => {
          const t = c.text().trim();
          return t !== "{" && t !== "}" && t !== "," && t.length > 0;
        }) as SgNode<"python">[];
    }
    if (pairs.length === 0) continue;

    let fromVal: string | null = null;
    const otherKwargs: { key: string; value: string }[] = [];
    let hasFrom = false;

    for (const pr of pairs) {
      const split = splitPairKeyValue(pr);
      const kRaw = split.key?.text() ?? "";
      const k =
        split.key?.kind() === "string"
          ? stripPythonStringLiteral(kRaw)
          : split.key?.kind() === "identifier"
            ? split.key.text()
            : stripPythonStringLiteral(kRaw) ?? getDictionaryPairStringKey(pr);
      if (!k) continue;
      if (k === "from") {
        hasFrom = true;
        const valNode = split.value ?? getDictionaryPairValueNode(pr);
        if (
          valNode &&
          valNode.kind() === "subscript" &&
          subscriptValueNode(valNode)?.text() === "accounts" &&
          intLiteralIndexText(valNode) &&
          !isInsideApeFixture(valNode)
        ) {
          migratedAccount.increment();
        }
        fromVal = valNode ? rewriteFromValueForSender(valNode) : "";
        continue;
      }
      if (k === "value" || k === "gas_limit" || k === "gas_price") {
        const valNode = split.value ?? getDictionaryPairValueNode(pr);
        otherKwargs.push({ key: k, value: valNode?.text() ?? "" });
      }
    }
    if (!hasFrom) continue;
    seenDict.add(start);

    const kwPieces: string[] = [];
    for (const ok of otherKwargs) {
      kwPieces.push(`${ok.key}=${ok.value}`);
    }
    kwPieces.push(`sender=${fromVal}`);
    pushReplace(dict, kwPieces.join(", "), () => migratedSender.increment());
  }

  for (const call of rootNode.findAll({ rule: { kind: "call" } })) {
    if (!isCallToDotted(call, ["network", "show_active"])) continue;
    if (!hasBrownieImport) continue;
    pushReplace(call, "networks.provider.network.name");
  }

  for (const call of rootNode.findAll({ rule: { kind: "call" } })) {
    const fn = getCallFunctionNode(call);
    if (!fn || !isAttributeAccessNode(fn, ["brownie", "reverts"])) continue;
    const args = call.find({ rule: { kind: "argument_list" } });
    const argText = args?.text() ?? "()";
    pushReplace(call, `ape.reverts${argText}`);
  }

  for (const call of rootNode.findAll({ rule: { kind: "call" } })) {
    const fn = getCallFunctionNode(call);
    if (!fn || fn.kind() !== "attribute") continue;
    const name = fn.field("attribute")?.text() ?? fn.child(2)?.text();
    if (name !== "deploy") continue;
    const obj = (fn.field("object") ?? fn.child(0)) as SgNode<"python"> | null;
    if (!obj || obj.kind() !== "identifier") continue;
    const typeName = obj.text();
    if (!brownieContractNames.has(typeName)) continue;
    if (isAlreadyProjectPrefixed(fn)) continue;
    // Replace only the callee (`Token.deploy` → `project.Token.deploy`) so sender-dict
    // and other argument rewrites stay valid and are not overwritten by a full-call replace.
    pushReplace(fn, `project.${typeName}.deploy`);
  }

  for (const sub of rootNode.findAll({ rule: { kind: "subscript" } })) {
    const obj = subscriptValueNode(sub);
    if (!obj || obj.kind() !== "identifier") continue;
    const ix = intLiteralIndexText(sub);
    if (!ix || ix !== "-1") continue;
    const typeName = obj.text();
    if (!brownieContractNames.has(typeName)) continue;
    if (isAlreadyProjectPrefixed(obj)) continue;
    pushReplace(sub, `project.${typeName}.deployments[-1]`);
  }

  for (const call of rootNode.findAll({ rule: { kind: "call" } })) {
    const fn = getCallFunctionNode(call);
    if (!fn || fn.kind() !== "attribute") continue;
    const obj = (fn.field("object") ?? fn.child(0)) as SgNode<"python"> | null;
    const attr = fn.field("attribute")?.text() ?? fn.child(2)?.text();
    if (!obj || obj.kind() !== "identifier" || obj.text() !== "interface") continue;
    if (!attr || !brownieContractNames.has(attr)) continue;
    const args = call.find({ rule: { kind: "argument_list" } });
    const inner = args?.text() ?? "()";
    const innerArgs =
      inner.startsWith("(") && inner.endsWith(")") ? inner.slice(1, -1) : inner;
    pushReplace(call, `project.${attr}.at(${innerArgs})`);
  }

  for (const call of rootNode.findAll({ rule: { kind: "call" } })) {
    if (!isCallToDotted(call, ["web3", "eth", "getBalance"])) continue;
    const args = call.find({ rule: { kind: "argument_list" } });
    const inner = args?.text() ?? "()";
    pushReplace(call, `provider.get_balance${inner}`);
  }

  for (const node of rootNode.findAll({ rule: { kind: "attribute" } })) {
    if (isAttributeAccessNode(node, ["web3", "eth", "blockNumber"])) {
      pushReplace(node, "chain.blocks.head.number");
    } else if (isAttributeAccessNode(node, ["web3", "eth", "chainId"])) {
      pushReplace(node, "networks.provider.network.chain_id");
    }
  }

  const subscripts = rootNode.findAll({ rule: { kind: "subscript" } });
  for (const sub of subscripts) {
    tryReplaceLongTxEventChain(sub, edits, () => {});
  }
  for (const sub of subscripts) {
    tryReplaceTxEventsBracket(sub, edits, () => {});
  }

  for (const call of rootNode.findAll({ rule: { kind: "call" } })) {
    if (!isCallToDotted(call, ["accounts", "add"])) continue;
    const line = call.text();
    if (line.includes("TODO(brownie-to-ape): accounts.add")) continue;
    pushReplace(
      call,
      `${line}  # TODO(brownie-to-ape): accounts.add(key) not valid in Ape; use accounts.load("account-name") after: ape accounts import <name>`,
    );
  }

  for (const call of rootNode.findAll({ rule: { kind: "call" } })) {
    if (!isCallToDotted(call, ["web3", "eth", "contract"])) continue;
    const line = call.text();
    if (line.includes("TODO(brownie-to-ape): replace with ape contract")) continue;
    pushReplace(
      call,
      `${line}  # TODO(brownie-to-ape): replace with ape contract pattern`,
    );
  }

  for (const call of rootNode.findAll({ rule: { kind: "call" } })) {
    const fn = getCallFunctionNode(call);
    if (!fn || fn.kind() !== "identifier" || fn.text() !== "priority_fee") continue;
    pushReplace(call, priorityFeeTodoText());
  }

  for (const call of rootNode.findAll({ rule: { kind: "call" } })) {
    if (!isCallToDotted(call, ["chain", "sleep"])) continue;
    const args = call.find({ rule: { kind: "argument_list" } });
    const inner = args?.text() ?? "()";
    pushReplace(call, `chain.mine${inner}`);
  }

  for (const call of rootNode.findAll({ rule: { kind: "call" } })) {
    if (!isCallToDotted(call, ["chain", "revert"])) continue;
    const args = call.find({ rule: { kind: "argument_list" } });
    const inner = args?.text() ?? "()";
    pushReplace(call, `chain.restore${inner}`);
  }

  for (const call of rootNode.findAll({ rule: { kind: "call" } })) {
    if (!isCallToDotted(call, ["brownie", "network", "connect"])) continue;
    const args = call.find({ rule: { kind: "argument_list" } });
    const inner = args?.text() ?? "()";
    pushReplace(call, `networks.connect${inner}`);
  }

  for (const call of rootNode.findAll({ rule: { kind: "call" } })) {
    if (!isCallToDotted(call, ["network", "connect"])) continue;
    const args = call.find({ rule: { kind: "argument_list" } });
    const inner = args?.text() ?? "()";
    pushReplace(call, `networks.connect${inner}`);
  }

  for (const call of rootNode.findAll({ rule: { kind: "call" } })) {
    if (!isCallToDotted(call, ["brownie", "network", "disconnect"])) continue;
    pushReplace(call, `networks.disconnect()`);
  }

  for (const call of rootNode.findAll({ rule: { kind: "call" } })) {
    if (!isCallToDotted(call, ["network", "disconnect"])) continue;
    pushReplace(call, `networks.disconnect()`);
  }

  for (const id of rootNode.findAll({ rule: { kind: "identifier" } })) {
    if (id.text() !== "fn_isolation") continue;
    if (isBindingInsideBrownieFromImport(id)) continue;
    const parent = id.parent();
    if (!parent) continue;
    const line = parent.text();
    if (line.includes("TODO(brownie-to-ape)")) continue;
    pushReplace(
      id,
      `fn_isolation  # TODO(brownie-to-ape): remove fn_isolation — Ape handles test isolation natively via its pytest plugin`,
    );
  }

  for (const node of rootNode.findAll({ rule: { kind: "float" } })) {
    const t = node.text();
    if (!/[eE]/.test(t)) continue;
    const match = t.match(/^(\d+(?:\.\d+)?)[eE]([+-]?\d+)$/);
    if (!match) continue;
    const coef = match[1]!;
    const exp = match[2]!.replace(/^\+/, "");
    const replacement = coef === "1" ? `10**${exp}` : `(${coef} * 10**${exp})`;
    pushReplace(node, replacement);
  }

  for (const call of rootNode.findAll({ rule: { kind: "call" } })) {
    const fn = getCallFunctionNode(call);
    if (!fn) continue;
    if (!isAttributeAccessNode(fn, ["Contract", "from_abi"])) continue;
    const args = call.find({ rule: { kind: "argument_list" } });
    if (!args) continue;
    const argChildren = args.children().filter((c) => {
      const t = c.text();
      return t !== "(" && t !== ")" && t !== ",";
    });
    const addrNode = argChildren[1];
    if (!addrNode) continue;
    pushReplace(
      call,
      `Contract.at(${addrNode.text()})  # TODO(brownie-to-ape): verify ABI — original contract_type name and .abi ignored`,
    );
  }

  for (const call of rootNode.findAll({ rule: { kind: "call" } })) {
    if (!isCallToDotted(call, ["pytest", "raises"])) continue;
    const args = call.find({ rule: { kind: "argument_list" } });
    if (!args) continue;
    const stack: SgNode<"python">[] = [args];
    const attrNodes: SgNode<"python">[] = [];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur.kind() === "attribute") attrNodes.push(cur);
      for (const ch of cur.children()) stack.push(ch as SgNode<"python">);
    }
    for (const attr of attrNodes) {
      if (!isAttributeAccessNode(attr, ["exceptions", "VirtualMachineError"])) continue;
      pushReplace(attr, "ContractLogicError");
    }
  }

  for (const call of rootNode.findAll({ rule: { kind: "call" } })) {
    const fn = getCallFunctionNode(call);
    if (!fn || fn.kind() !== "attribute") continue;
    const methodName =
      (
        fn.field("attribute") as SgNode<"python"> | null | undefined
      )?.text() ?? fn.child(2)?.text();
    if (methodName !== "publish_source" && methodName !== "get_verification_info") continue;
    const obj = (fn.field("object") ?? fn.child(0)) as SgNode<"python"> | null;
    if (!obj || obj.kind() !== "identifier") continue;
    const typeName = obj.text();
    if (!brownieContractNames.has(typeName)) continue;
    if (isAlreadyProjectPrefixed(fn)) continue;
    pushReplace(fn, `project.${typeName}.${methodName}`);
  }

  for (const call of rootNode.findAll({ rule: { kind: "call" } })) {
    const fn = getCallFunctionNode(call);
    if (!fn || fn.text() !== "len") continue;
    const args = call.find({ rule: { kind: "argument_list" } });
    if (!args) continue;
    const argChildren = args.children().filter((c) => {
      const t = c.text();
      return t !== "(" && t !== ")" && t !== ",";
    });
    if (argChildren.length !== 1) continue;
    const arg = argChildren[0]!;
    if (arg.kind() !== "identifier") continue;
    const typeName = arg.text();
    if (!brownieContractNames.has(typeName)) continue;
    pushReplace(arg, `project.${typeName}.deployments`);
  }

  // Normalize: merge all `from ape import X` lines into one sorted import
  const allImportFromApe: SgNode<"python">[] = [];
  for (const imp of rootNode.findAll({ rule: { kind: "import_from_statement" } })) {
    const mod = getModuleDottedName(imp);
    if (mod !== "ape") continue;
    allImportFromApe.push(imp);
  }
  if (allImportFromApe.length > 1) {
    const allNames = new Set<string>();
    for (const imp of allImportFromApe) {
      const names = listDottedAsNames(imp);
      for (const n of names) {
        const sym = dottedAsNameToImportedSymbol(n);
        if (sym) allNames.add(sym);
        else if (n.kind() === "identifier") allNames.add(n.text());
      }
    }
    const merged = `from ape import ${[...allNames].sort().join(", ")}`;
    pushReplace(allImportFromApe[0]!, merged, () => normalizedImports.increment());
    for (const imp of allImportFromApe.slice(1)) {
      pushReplace(imp, "");
    }
  }

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default codemod;
