import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
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

async function runBaseCodemod(projectDir: string): Promise<void> {
  try {
    await execa("npx", ["codemod", "brownie-to-ape", "-t", projectDir], {
      cwd: projectDir,
      stdio: "ignore",
      timeout: 30_000,
    });
  } catch {
    await stopBaseCodemodChildren(projectDir);
    console.log("⚠️  brownie-to-ape base codemod timed out or unavailable — running ApeShift transforms only");
  }
}

async function stopBaseCodemodChildren(projectDir: string): Promise<void> {
  if (process.platform !== "win32") return;
  const escaped = projectDir.replace(/'/g, "''");
  const command = [
    "Get-CimInstance Win32_Process",
    `Where-Object { $_.CommandLine -like '*brownie-to-ape*' -and $_.CommandLine -like '*${escaped}*' -and ($_.Name -match 'node|codemod') }`,
    "ForEach-Object { Stop-Process -Id $_.ProcessId -Force }",
  ].join(" | ");
  try {
    await execa("powershell", ["-NoProfile", "-Command", command], { stdio: "ignore", timeout: 5_000 });
  } catch {
    // Best-effort cleanup only; migration continues in degraded mode.
  }
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

export async function migrate(projectDir: string, options: { runBase?: boolean; skipValidation?: boolean } = {}): Promise<MigrationResult> {
  const root = path.resolve(projectDir);
  const projectFiles = await listProjectFiles(root);
  const patternsTotal = await countBrowniePatterns(projectFiles);
  const files = await listPythonFiles(root);
  const transformCounts: Record<string, number> = Object.fromEntries(transforms.map((t) => [t.name, 0]));
  let filesChanged = 0;
  let patternsAutomated = 0;

  if (options.runBase ?? true) {
    await runBaseCodemod(root);
    await cleanupBaseCodemodOutput(files);
  }

  for (const file of files) {
    const original = await fs.readFile(file, "utf8");
    let source = original;
    for (const transform of transforms) {
      const result = transform.apply(source);
      source = result.source;
      transformCounts[transform.name] += result.count;
      patternsAutomated += result.count;
    }
    if (source !== original) {
      filesChanged += 1;
      await fs.writeFile(file, source, "utf8");
    }
  }

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
