import type { TransformModule } from "../types.js";

const apeNames = new Set(["accounts", "chain", "Contract", "convert", "network", "reverts", "web3"]);

function mapName(name: string): string {
  return name === "network" ? "networks" : name;
}

export const importsMultilineTransform: TransformModule = {
  name: "imports-multiline",
  rulePath: "src/transforms/imports-multiline/rule.yaml",
  apply(source) {
    let count = 0;
    const next = source.replace(/^from brownie import \(\r?\n([\s\S]*?)^\)$/gm, (block, body: string) => {
      const names = body
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/,$/, ""))
        .filter(Boolean);
      const convertible = names.filter((name) => apeNames.has(name));
      if (convertible.length === 0 || convertible.length !== names.length) return block;
      count += 1;
      return `from ape import (\n${convertible.map((name) => `    ${mapName(name)},`).join("\n")}\n)`;
    });
    return { source: next, count };
  },
};

export default importsMultilineTransform;
