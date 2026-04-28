#!/usr/bin/env node
import path from "node:path";
import { Command } from "commander";
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
  .action(async (project: string, options: { skipValidation?: boolean }) => {
    console.log("🔍 ApeShift — Brownie → Ape Migration");
    console.log("======================================");
    console.log(`📁 Scanning: ${project}`);

    const result = await migrate(project, { skipValidation: options.skipValidation });

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
    const automatedPct = result.patternsTotal > 0 ? Math.min(Math.round((result.patternsAutomated / result.patternsTotal) * 100), 100) : 0;
    console.log("✅ Validation");
    console.log(`   ape compile: ${compileStatus}`);
    console.log(`   ape test:    ${testStatus}`);
    console.log("");
    console.log(`📊 Confidence Score: ${result.confidenceScore}%`);
    console.log(`   Automated: ${result.patternsAutomated}/${result.patternsTotal} patterns (${automatedPct}%)`);
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
