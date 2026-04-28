import type { TransformModule } from "../types.js";

function identifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?(?:\[\d+\])?$/.test(value.trim());
}

export const accountsTransform: TransformModule = {
  name: "accounts",
  rulePath: "src/transforms/accounts/rule.yaml",
  apply(source) {
    let count = 0;
    const next = source.replace(
      /(\b[A-Za-z_][A-Za-z0-9_.]*\s*\()([^()\n]*?)(?:,\s*)?\{\s*['"]from['"]\s*:\s*([^,}\n]+)(?:,\s*['"]value['"]\s*:\s*([^,}\n]+)|,\s*['"]gas_limit['"]\s*:\s*([^,}\n]+))?\s*\}\s*\)/g,
      (match, prefix: string, existingArgs: string, account: string, value?: string, gas?: string) => {
        if (!identifier(account)) {
          return `${match}  # TODO(apeshift): verify sender dict migration`;
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
    return { source: next, count };
  },
};

export default accountsTransform;
