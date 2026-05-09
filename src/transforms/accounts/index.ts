import type { TransformModule } from "../types.js";
import { replaceAllRegexOutsideComments } from "../py-mask.js";

function identifier(value: string): boolean {
  const v = value.trim();
  if (/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?(?:\[\d+\])?$/.test(v)) return true;
  // Simple call forms: get_account(), accounts[0] already covered; allow foo() senders
  return /^[A-Za-z_][A-Za-z0-9_.]*\([^)]*\)$/.test(v);
}

export const accountsTransform: TransformModule = {
  name: "accounts",
  rulePath: "src/transforms/accounts/rule.yaml",
  apply(source) {
    let count = 0;
    const first = replaceAllRegexOutsideComments(
      source,
      /(\b[A-Za-z_][A-Za-z0-9_.]*\s*\()([^()\n]*?)(?:,\s*)?\{\s*['"]from['"]\s*:\s*([^,}\n]+)(?:,\s*['"]value['"]\s*:\s*([^,}\n]+)|,\s*['"]gas_limit['"]\s*:\s*([^,}\n]+))?\s*\}\s*\)/g,
      (match: RegExpExecArray) => {
        const prefix = match[1] ?? "";
        const existingArgs = match[2] ?? "";
        const account = match[3] ?? "";
        const value = match[4];
        const gas = match[5];
        if (!identifier(account)) {
          return `${match[0]}  # TODO(apeshift): verify sender dict migration`;
        }
        count += 1;
        const senderArgs = value
          ? `value=${value.trim()}, sender=${account.trim()}`
          : gas
            ? `gas_limit=${gas.trim()}, sender=${account.trim()}`
            : `sender=${account.trim()}`;
        const args = existingArgs.trim() ? `${existingArgs.trim()}, ${senderArgs}` : senderArgs;
        return `${prefix}${args})`;
      },
    );
    let next = first.source;

    const multiline = replaceAllRegexOutsideComments(
      next,
      /,(\s*\n)(\s*)\{\s*['"]from['"]\s*:\s*([^,}\n]+?)\}\s*,?(\s*\n)(\s*)\)/g,
      (m: RegExpExecArray) => {
        const gap1 = m[1] ?? "";
        const ind1 = m[2] ?? "";
        const account = m[3] ?? "";
        const gap2 = m[4] ?? "";
        const indClose = m[5] ?? "";
        if (!identifier(account)) {
          return m[0];
        }
        count += 1;
        const acc = account.trim();
        return `,${gap1}${ind1}sender=${acc}${gap2}${indClose})`;
      },
    );
    next = multiline.source;
    return { source: next, count };
  },
};

export default accountsTransform;
