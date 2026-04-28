import type { TransformModule } from "../types.js";

const safeApeImports = new Set(["accounts", "chain", "config", "Contract", "convert", "networks", "project"]);

function mapName(name: string): string {
  return name === "network" ? "networks" : name;
}

export const importsTransform: TransformModule = {
  name: "imports",
  rulePath: "src/transforms/imports/rule.yaml",
  apply(source) {
    let count = 0;
    const next = source.replace(/^from brownie import ([^\n()]+)$/gm, (line, raw: string) => {
      const names = raw.split(",").map((name) => name.trim());
      if (names.includes("*")) {
        count += 1;
        return `${line}  # TODO(apeshift): replace wildcard Brownie import with explicit Ape/project imports`;
      }
      const mapped = names.map(mapName);
      if (mapped.every((name) => safeApeImports.has(name))) {
        count += 1;
        return `from ape import ${mapped.join(", ")}`;
      }
      return line;
    });
    return { source: next, count };
  },
};

export default importsTransform;
