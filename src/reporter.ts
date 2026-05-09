import fs from "node:fs/promises";
import path from "node:path";
import Handlebars from "handlebars";
import type { ValidationResult } from "./validator.js";

export interface TransformBreakdown {
  name: string;
  before: number;
  after: number;
  automated: number;
}

export interface ReportInput {
  projectName: string;
  apeshiftVersion: string;
  filesChanged: number;
  patternsAutomated: number;
  patternsTotal: number;
  transforms: TransformBreakdown[];
  validation: ValidationResult;
  remainingPatterns: Array<{ pattern: string; docsUrl: string }>;
}

export interface ReportOutput {
  score: number;
  markdownPath: string;
  jsonPath: string;
}

/**
 * CLI / report line: Brownie pattern hits detected vs transform applications (can exceed pattern count).
 */
export function formatAutomationSummary(patternsDetected: number, transformApplications: number): string {
  const pct =
    patternsDetected > 0
      ? `${Math.min(Math.round((transformApplications / patternsDetected) * 100), 100)}%`
      : "N/A";
  return `${patternsDetected} patterns detected, ${transformApplications} transforms applied (${pct})`;
}

export function calculateConfidenceScore(input: Pick<ReportInput, "patternsAutomated" | "patternsTotal" | "validation">): number {
  const automationRatio = input.patternsTotal > 0 ? Math.min(input.patternsAutomated / input.patternsTotal, 1) : 0;
  const base = automationRatio * 70;
  const compile = input.validation.compileSuccess ? 20 : 0;
  const totalTests = input.validation.testsPassed + input.validation.testsFailed;
  const tests = totalTests > 0 ? (input.validation.testsPassed / totalTests) * 10 : 0;
  return Math.round(base + compile + tests);
}

const template = Handlebars.compile(`# ApeShift Migration Report

Project: {{projectName}}
Date: {{date}}
ApeShift: {{apeshiftVersion}}

## Summary

| Metric | Value |
|---|---:|
| Files changed | {{filesChanged}} |
| Automation | {{patternsAutomatedSummary}} |
| Confidence score | {{score}}% |

## Transform Breakdown

| Transform | Before | After | Automated |
|---|---:|---:|---:|
{{#each transforms}}
| {{name}} | {{before}} | {{after}} | {{automated}} |
{{/each}}

## Validation

| Check | Result |
|---|---|
| ape compile | {{compileStatus}} |
| ape test | {{testsPassed}} passed, {{testsFailed}} failed |

{{#if validation.skipReason}}
Validation skipped: {{validation.skipReason}}
{{/if}}

## Manual Review Checklist

{{#each remainingPatterns}}
- [ ] Review \`{{pattern}}\` against {{docsUrl}}
{{/each}}
{{#unless remainingPatterns.length}}
- [x] No remaining known Brownie edge patterns detected.
{{/unless}}

## Next Steps

1. Review any TODO comments left by ApeShift.
2. Run \`ape compile\` and \`ape test\` in your target environment.
3. Commit the migration with the generated CI workflow and report.
`);

export async function generateReport(input: ReportInput, outputDir: string): Promise<ReportOutput> {
  await fs.mkdir(outputDir, { recursive: true });
  const score = calculateConfidenceScore(input);
  const automatedPercent =
    input.patternsTotal > 0 ? Math.min(Math.round((input.patternsAutomated / input.patternsTotal) * 100), 100) : null;
  const patternsAutomatedSummary = formatAutomationSummary(input.patternsTotal, input.patternsAutomated);
  const view = {
    ...input,
    date: new Date().toISOString(),
    score,
    automatedPercent,
    patternsAutomatedSummary,
    compileStatus: input.validation.skipped ? "SKIPPED" : input.validation.compileSuccess ? "PASSED" : "FAILED",
    testsPassed: input.validation.testsPassed,
    testsFailed: input.validation.testsFailed,
  };

  const markdownPath = path.join(outputDir, "migration-report.md");
  const jsonPath = path.join(outputDir, "migration-report.json");
  await fs.writeFile(markdownPath, template(view), "utf8");
  await fs.writeFile(jsonPath, JSON.stringify({ ...view, score }, null, 2), "utf8");
  return { score, markdownPath, jsonPath };
}
