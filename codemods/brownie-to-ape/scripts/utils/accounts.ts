// @ts-nocheck — JSSG ast-grep Python node kinds extend beyond the bundled `Kinds<>` union.
import type { SgNode } from "codemod:ast-grep";

// Returns true if the node is inside a function that has 'accounts' as a parameter
// (meaning it's the Ape pytest fixture, not Brownie accounts)
export function isInsideApeFixture(node: SgNode<"python">): boolean {
  let current: SgNode<"python"> | null = node.parent();
  while (current) {
    if (current.kind() === "function_definition") {
      const params = current.find({ rule: { kind: "parameters" } });
      if (params && params.text().includes("accounts")) return true;
      return false;
    }
    current = current.parent();
  }
  return false;
}
