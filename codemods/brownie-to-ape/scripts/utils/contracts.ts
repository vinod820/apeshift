// @ts-nocheck — JSSG ast-grep Python node kinds extend beyond the bundled `Kinds<>` union.
import type { SgNode } from "codemod:ast-grep";

// Returns true if the node is already prefixed with 'project.'
export function isAlreadyProjectPrefixed(node: SgNode<"python">): boolean {
  const parent = node.parent();
  if (!parent) return false;
  if (parent.kind() === "attribute") {
    const attrText = parent.text();
    if (attrText.startsWith("project.")) return true;
  }
  return false;
}
