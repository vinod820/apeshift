#!/usr/bin/env node
import path from "node:path";
import { Command } from "commander";
import { formatAutomationSummary } from "./reporter.js";
import { migrate } from "./runner.js";

const program = new Command();

program
  .name("apeshift")
  .description("ApeShift - self-sufficient Brownie to Ape migration workflow")
  .version("0.1.0");

program
  .command("migrate")
  .argument("<project>", "Brownie project directory")
  .option("--skip-validation", "skip ape compile and ape test validation")
  .option("-y, --yes", "confirm migration when the project has more than 100 Python files (required without a TTY)")
  .action(async (project: string, options: { skipValidation?: boolean; yes?: boolean }) => {
    console.log("🔍 ApeShift — Brownie → Ape Migration");
    console.log("======================================");
    const resolved = path.resolve(project);
    const result = await migrate(project, {
      skipValidation: options.skipValidation,
      yes: options.yes,
      onScanProgress: (n) => {
        process.stdout.write(`\r\x1b[K📁 Scanning: ${resolved}... (found ${n} .py files so far)`);
      },
    });
    process.stdout.write("\n");

    console.log(`   Found ${result.filesScanned} files, ${result.patternsTotal} Brownie patterns`);
    console.log("");
    console.log("⚙️  ApeShift deterministic transforms");
    for (const [name, count] of Object.entries(result.transformCounts)) {
      console.log(`   ✓ ${name.padEnd(14)} — ${count} patterns`);
    }
    console.log("");
    const compileStatus = result.validation.skipped ? "SKIPPED" : result.validation.compileSuccess ? "PASSED" : "FAILED";
    const testStatus = result.validation.skipped
      ? "SKIPPED"
      : `${result.validation.testsPassed} passed, ${result.validation.testsFailed} failed`;
    const compilePts = result.validation.compileSuccess ? 20 : 0;
    const totalTests = result.validation.testsPassed + result.validation.testsFailed;
    const testPts = totalTests > 0 ? Math.round((result.validation.testsPassed / totalTests) * 10) : 0;
    console.log("✅ Validation");
    console.log(`   ape compile: ${compileStatus}`);
    console.log(`   ape test:    ${testStatus}`);
    console.log("");
    console.log(`📊 Confidence Score: ${result.confidenceScore}%`);
    console.log(`   Automated: ${formatAutomationSummary(result.patternsTotal, result.patternsAutomated)}`);
    console.log(`   Compile:   +${compilePts} pts`);
    console.log(`   Tests:     +${testPts} pts`);
    console.log("");
    console.log(`📄 Report: ${path.join(result.reportDir, "migration-report.md")}`);
    console.log(`🔀 PR:     ${path.join(result.reportDir, "pr")}`);
    console.log("");
    console.log("✨ Done!");
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
