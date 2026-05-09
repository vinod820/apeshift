// @ts-nocheck — JSSG ast-grep Python node kinds extend beyond the bundled `Kinds<>` union.
import type { SgNode } from "codemod:ast-grep";

export function stripPythonStringLiteral(text: string): string | null {
  if (text.length < 2) return null;
  const q = text[0];
  if ((q === "'" || q === '"') && text.endsWith(q)) {
    return text.slice(1, -1);
  }
  return null;
}

export function splitPairKeyValue(pair: SgNode<"python">): {
  key: SgNode<"python"> | null;
  value: SgNode<"python"> | null;
} {
  const kids = pair.children();
  const colonAt = kids.findIndex((k) => k.text() === ":");
  if (colonAt > 0) {
    return {
      key: kids[colonAt - 1] as SgNode<"python">,
      value: (kids[colonAt + 1] as SgNode<"python">) ?? null,
    };
  }
  const keyStr = pair.find({ rule: { kind: "string" } });
  const sub = pair.find({ rule: { kind: "subscript" } });
  if (keyStr && sub) {
    return { key: keyStr, value: sub };
  }
  return { key: null, value: null };
}

export function getDictionaryPairStringKey(pair: SgNode<"python">): string | null {
  const key = pair.child(0);
  if (!key) return null;
  if (key.kind() === "string") {
    return stripPythonStringLiteral(key.text());
  }
  if (key.kind() === "identifier") {
    return key.text();
  }
  const stripped = stripPythonStringLiteral(key.text());
  if (stripped) return stripped;
  const split = splitPairKeyValue(pair);
  const alt = split.key;
  if (!alt) return null;
  if (alt.kind() === "string") return stripPythonStringLiteral(alt.text());
  return alt.text();
}

export function getDictionaryPairValueNode(pair: SgNode<"python">): SgNode<"python"> | null {
  const split = splitPairKeyValue(pair);
  if (split.value) return split.value;
  const kids = pair.children();
  return (kids[kids.length - 1] as SgNode<"python">) ?? null;
}

export function getCallFunctionNode(call: SgNode<"python">): SgNode<"python"> | null {
  if (call.kind() !== "call") return null;
  return call.child(0) as SgNode<"python"> | null;
}

export function unwrapExpressionStatement(node: SgNode<"python">): SgNode<"python"> {
  if (node.kind() === "expression_statement") {
    const inner = node.child(0);
    return inner ?? node;
  }
  return node;
}
