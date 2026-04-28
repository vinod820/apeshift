import fs from "node:fs/promises";
import path from "node:path";
import { generatePrContent } from "./pr-generator.js";
import { generateReport } from "./reporter.js";
import { transforms } from "./transforms/index.js";
import { validateProject, type ValidationResult } from "./validator.js";

export interface MigrationResult {
  filesScanned: number;
  filesChanged: number;
  patternsTotal: number;
  patternsAutomated: number;
  transformCounts: Record<string, number>;
  reportDir: string;
  confidenceScore: number;
  validation: ValidationResult;
}

async function listPythonFiles(dir: string): Promise<string[]> {
  const files = await listProjectFiles(dir);
  return files.filter((file) => file.endsWith(".py"));
}

async function listProjectFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if ([".git", "node_modules", ".venv", "venv", "apeshift-report"].includes(entry.name)) return [];
        return listProjectFiles(full);
      }
      return entry.isFile() ? [full] : [];
    }),
  );
  return files.flat();
}

async function countBrowniePatterns(files: string[]): Promise<number> {
  const signatures = [/brownie\./g, /from brownie import/g, /brownie-config/g];
  let count = 0;

  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    for (const signature of signatures) {
      count += source.match(signature)?.length ?? 0;
      signature.lastIndex = 0;
    }
  }

  return count;
}

function parseImportNames(line: string, moduleName: string): string[] | null {
  const match = line.match(new RegExp(`^from ${moduleName} import (.+)$`));
  if (!match) return null;
  return match[1]
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function cleanupDuplicateImports(source: string): string {
  const lines = source.split(/\r?\n/);
  const apeNames = new Set<string>();
  for (const line of lines) {
    const names = parseImportNames(line, "ape");
    if (names) {
      for (const name of names) apeNames.add(name);
    }
  }

  return lines
    .filter((line) => {
      const names = parseImportNames(line, "brownie");
      return !(names && names.length > 0 && names.every((name) => apeNames.has(name)));
    })
    .join("\n");
}

function cleanupImportSyntax(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      if (!/^\s*(from\s+\S+\s+)?import\b/.test(line)) return line;
      return line
        .replace(/,,+/g, ",")
        .replace(/\bimport\s*,\s*/g, "import ")
        .replace(/,\s*$/g, "");
    })
    .filter((line) => !/^\s*from\s+\S+\s+import\s*$/.test(line) && !/^\s*import\s*$/.test(line))
    .join("\n");
}

async function cleanupBaseCodemodOutput(files: string[]): Promise<void> {
  for (const file of files) {
    const original = await fs.readFile(file, "utf8");
    const cleaned = cleanupImportSyntax(cleanupDuplicateImports(original));
    if (cleaned !== original) {
      await fs.writeFile(file, cleaned, "utf8");
    }
  }
}

function cleanupRuntimeSafetyByPath(file: string, source: string): string {
  const normalized = file.replace(/\\/g, "/");
  let next = source.replace(/^\s*[A-Za-z_][A-Za-z0-9_]*\.wait\([^)\n]*\)\s*$/gm, "");
  next = next.replace(/\b(\d+)e(\d+)\b/g, (_match, coefficient: string, exponent: string) => `${coefficient} * 10**${exponent}`);
  next = next.replace(/\blen\(([A-Z][A-Za-z0-9_]*)\)/g, (_match, contract: string) => `len(project.${contract}.deployments)`);
  next = next.replace(
    /(LOCAL_BLOCKCHAIN_ENVIRONMENTS\s*=\s*\[)([^\]\n]*)(\])/g,
    (match, prefix: string, values: string, suffix: string) =>
      values.includes('"local"') || values.includes("'local'") ? match : `${prefix}${values}, "local"${suffix}`,
  );
  if (!/\/tests?\//.test(normalized)) return next;
  next = next.replace(/^(\s*def\s+[A-Za-z_][A-Za-z0-9_]*\()([^)]*)(\):)$/gm, (_line, start: string, rawArgs: string, end: string) => {
    const args = rawArgs
      .split(",")
      .map((arg) => arg.trim())
      .filter((arg) => arg && !/^[A-Z][A-Za-z0-9_]*$/.test(arg));
    return `${start}${args.join(", ")}${end}`;
  });
  if (/\bdef\s+[A-Za-z_][A-Za-z0-9_]*\([^)]*\baccounts\b/.test(next)) {
    next = next.replace(/\baccounts\.test_accounts\[(\d+)\]/g, "accounts[$1]");
  }
  return next;
}

async function ensurePythonPathConftest(projectDir: string): Promise<void> {
  try {
    await fs.access(path.join(projectDir, "scripts"));
  } catch {
    return;
  }

  const conftestPath = path.join(projectDir, "conftest.py");
  try {
    await fs.access(conftestPath);
    return;
  } catch {
    await fs.writeFile(
      conftestPath,
      [
        "import sys",
        "from pathlib import Path",
        "",
        "ROOT = Path(__file__).resolve().parent",
        "if str(ROOT) not in sys.path:",
        "    sys.path.insert(0, str(ROOT))",
        "",
      ].join("\n"),
      "utf8",
    );
  }
}

function dependencyAlias(repository: string): string {
  const repo = repository.split("/").pop() ?? repository;
  return repo
    .replace(/[^A-Za-z0-9_]/g, "_");
}

function convertBrownieConfigToApe(source: string): string {
  const dependencyMatches = [...source.matchAll(/^\s*-\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([^\s#]+)\s*$/gm)];
  const dependencies = dependencyMatches.map((match) => {
    const repository = match[1] ?? "";
    const version = match[2] ?? "";
    return { name: dependencyAlias(repository), repository, version };
  });

  const remappingMatches = [...source.matchAll(/^\s*-\s*["']?([^=\s"']+)=([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([^"'\s]+)["']?\s*$/gm)];
  const remappings = remappingMatches.map((match) => {
    const prefix = match[1] ?? "";
    const repository = match[2] ?? "";
    const version = match[3] ?? "";
    return `    - "${prefix}=${dependencyAlias(repository)}/v${version}"`;
  });

  const lines = ["name: migrated-ape-project", "plugins:", "  - name: solidity"];
  if (dependencies.length > 0) {
    lines.push("dependencies:");
    for (const dependency of dependencies) {
      lines.push(`  - name: ${dependency.name}`);
      lines.push(`    github: ${dependency.repository}`);
      lines.push(`    version: ${dependency.version}`);
    }
  }
  if (remappings.length > 0) {
    lines.push("solidity:");
    lines.push("  import_remapping:");
    lines.push(...remappings);
  }
  lines.push("ethereum:");
  lines.push("  default_network: local");
  lines.push("# TODO: Brownie `wallets.from_key` is intentionally not copied.");
  lines.push("# Import the key once with `ape accounts import <alias>` and use `accounts.load(\"<alias>\")`.");
  return `${lines.join("\n")}\n`;
}

async function migrateConfigFile(projectDir: string): Promise<void> {
  const brownieConfigPath = path.join(projectDir, "brownie-config.yaml");
  const apeConfigPath = path.join(projectDir, "ape-config.yaml");
  try {
    const source = await fs.readFile(brownieConfigPath, "utf8");
    await fs.writeFile(apeConfigPath, convertBrownieConfigToApe(source), "utf8");
  } catch {
    // Config migration is best-effort; many Brownie projects have no config.
  }
}

function skippedValidationResult(skipReason: string): ValidationResult {
  return {
    compileSuccess: false,
    compileErrors: [],
    testsPassed: 0,
    testsFailed: 0,
    testErrors: [],
    skipped: true,
    skipReason,
  };
}

export async function migrate(projectDir: string, options: { skipValidation?: boolean } = {}): Promise<MigrationResult> {
  const root = path.resolve(projectDir);
  const projectFiles = await listProjectFiles(root);
  const patternsTotal = await countBrowniePatterns(projectFiles);
  const files = await listPythonFiles(root);
  const transformCounts: Record<string, number> = Object.fromEntries(transforms.map((t) => [t.name, 0]));
  let filesChanged = 0;
  let patternsAutomated = 0;

  await cleanupBaseCodemodOutput(files);

  for (const file of files) {
    const original = await fs.readFile(file, "utf8");
    let source = original;
    for (const transform of transforms) {
      const result = transform.apply(source);
      source = result.source;
      transformCounts[transform.name] += result.count;
      patternsAutomated += result.count;
    }
    const finalSource = cleanupRuntimeSafetyByPath(file, source);
    if (finalSource !== original) {
      filesChanged += 1;
      await fs.writeFile(file, finalSource, "utf8");
    }
  }

  await migrateConfigFile(root);
  await ensurePythonPathConftest(root);

  const validation = options.skipValidation
    ? skippedValidationResult("validation skipped by --skip-validation")
    : await validateProject(root);
  const reportDir = path.join(root, "apeshift-report");
  await generatePrContent(path.join(reportDir, "pr"));
  const report = await generateReport(
    {
      projectName: path.basename(root),
      apeshiftVersion: "0.1.0",
      filesChanged,
      patternsAutomated,
      patternsTotal,
      transforms: transforms.map((t) => ({
        name: t.name,
        before: transformCounts[t.name],
        after: 0,
        automated: transformCounts[t.name],
      })),
      validation,
      remainingPatterns: [],
    },
    reportDir,
  );

  return {
    filesScanned: files.length,
    filesChanged,
    patternsTotal,
    patternsAutomated,
    transformCounts,
    reportDir,
    confidenceScore: report.score,
    validation,
  };
}
