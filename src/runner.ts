import fs from "node:fs/promises";
import path from "node:path";
import { generatePrContent } from "./pr-generator.js";
import { generateReport } from "./reporter.js";
import { transforms } from "./transforms/index.js";
import { validateProject, type ValidationResult } from "./validator.js";

/** Directories skipped entirely during discovery (heavy vendor/build trees). */
export const SKIP_PROJECT_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "apeshift-report",
  ".build",
  ".cache",
  "__pycache__",
  ".brownie",
  "dist",
  "build",
]);

const LARGE_PROJECT_PY_THRESHOLD = 100;

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

export interface MigrateOptions {
  skipValidation?: boolean;
  /** Skip the large-project confirmation prompt (required in non-TTY when >100 Python files). */
  yes?: boolean;
  /** Throttled progress while collecting `.py` files; final argument is the total count. */
  onScanProgress?: (pyCountSoFar: number) => void;
}

/**
 * Recursively collect `.py` paths only — never enumerates `.sol`/`.vy`/etc., and skips heavy dirs.
 * @param onScanProgress optional; called with running count (throttled) and once with final total.
 */
export async function collectPythonFiles(
  dir: string,
  onScanProgress?: (pyCountSoFar: number) => void,
): Promise<string[]> {
  const out: string[] = [];
  let lastReported = 0;
  const report = () => {
    if (!onScanProgress) return;
    const n = out.length;
    if (n === 1 || n - lastReported >= 10) {
      lastReported = n;
      onScanProgress(n);
    }
  };

  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_PROJECT_DIR_NAMES.has(entry.name)) continue;
        await walk(full);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".py")) {
        out.push(full);
        report();
      }
    }
  }

  await walk(path.resolve(dir));
  onScanProgress?.(out.length);
  return out.sort();
}

async function confirmLargeProject(pyCount: number, options: { yes?: boolean }): Promise<void> {
  if (pyCount <= LARGE_PROJECT_PY_THRESHOLD) return;
  console.warn(
    `⚠️  Large project: ${pyCount} Python files (threshold: ${LARGE_PROJECT_PY_THRESHOLD}). Migration will touch many files.`,
  );
  if (options.yes) return;
  if (process.stdin.isTTY && process.stdout.isTTY) {
    const readline = await import("node:readline/promises");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await rl.question("Continue migration? [y/N] ");
      if (!/^y(es)?$/i.test(answer.trim())) {
        throw new Error("Migration cancelled.");
      }
    } finally {
      rl.close();
    }
  } else {
    throw new Error(
      `Non-interactive environment: ${pyCount} Python files exceeds threshold. Re-run with --yes to confirm.`,
    );
  }
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

function migrateAccountsAdd(source: string, normalizedPath: string): string {
  let next = source.replace(
    /accounts\.add\s*\(\s*config\s*\[\s*["']wallets["']\s*\]\s*\[\s*["']from_key["']\s*\]\s*\)(\s*#\s*TODO\(apeshift\)[^\n]*)?/g,
    () => `accounts.load("deployer")`,
  );
  const isTestFile = /\/tests?\//.test(normalizedPath);
  next = next.replace(/\baccounts\.add\s*\(\s*\)(\s*#\s*TODO\(apeshift\)[^\n]*)?/g, () =>
    isTestFile ? `accounts.test_accounts[1]` : `accounts.load("deployer")`,
  );
  return next;
}

function cleanupRuntimeSafetyByPath(file: string, source: string): string {
  const normalized = file.replace(/\\/g, "/");
  let next = migrateAccountsAdd(source, normalized);
  next = next.replace(/^\s*.+\.wait\s*\([^)]*\)\s*$/gm, "");
  // Scientific notation normalization is handled in numericTransform (avoid `/ 1e8` → `/ 1 * 10**8`).
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

export async function migrate(projectDir: string, options: MigrateOptions = {}): Promise<MigrationResult> {
  const root = path.resolve(projectDir);
  const files = await collectPythonFiles(root, options.onScanProgress);
  await confirmLargeProject(files.length, { yes: options.yes });
  const patternsTotal = await countBrowniePatterns(files);
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
