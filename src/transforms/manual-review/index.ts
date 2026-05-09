import type { TransformModule } from "../types.js";

function appendTodo(line: string, todo: string): string {
  return line.includes(todo) ? line : `${line}  ${todo}`;
}

export const manualReviewTransform: TransformModule = {
  name: "manual-review",
  rulePath: "src/transforms/manual-review/rule.yaml",
  apply(source) {
    let count = 0;
    const next = source
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trimStart();
        if (trimmed.startsWith("#")) {
          return line;
        }
        if (/tx\.events\[0\]\["[A-Za-z_][A-Za-z0-9_]*"\]/.test(line) && !line.includes("TODO(apeshift)")) {
          count += 1;
          return appendTodo(line, "# TODO(apeshift): use tx.events.filter(Contract.EventName)[0].field");
        }
        if (line.includes("exceptions.VirtualMachineError") && !line.includes("TODO(apeshift)")) {
          count += 1;
          return appendTodo(line, "# TODO(apeshift): verify ContractLogicError replacement");
        }
        return line;
      })
      .join("\n");
    return { source: next, count };
  },
};

export default manualReviewTransform;
