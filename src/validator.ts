import { execa } from "execa";

export interface ValidationResult {
  compileSuccess: boolean;
  compileErrors: string[];
  testsPassed: number;
  testsFailed: number;
  testErrors: string[];
  skipped: boolean;
  skipReason?: string;
}

const emptyResult = (skipReason?: string): ValidationResult => ({
  compileSuccess: false,
  compileErrors: [],
  testsPassed: 0,
  testsFailed: 0,
  testErrors: [],
  skipped: Boolean(skipReason),
  skipReason,
});

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parsePytestCounts(output: string): Pick<ValidationResult, "testsPassed" | "testsFailed"> {
  const passed = output.match(/(\d+)\s+passed/);
  const failed = output.match(/(\d+)\s+failed/);
  return {
    testsPassed: passed ? Number(passed[1]) : 0,
    testsFailed: failed ? Number(failed[1]) : 0,
  };
}

export async function validateProject(projectDir: string): Promise<ValidationResult> {
  try {
    await execa("ape", ["--version"], { cwd: projectDir });
  } catch {
    return emptyResult("ape CLI is not installed or not available on PATH");
  }

  const result = emptyResult();
  result.skipped = false;

  try {
    await execa("ape", ["compile"], { cwd: projectDir, all: true });
    result.compileSuccess = true;
  } catch (error) {
    result.compileSuccess = false;
    const err = error as { all?: string; stderr?: string; stdout?: string };
    result.compileErrors = lines(err.all ?? `${err.stdout ?? ""}\n${err.stderr ?? ""}`);
  }

  try {
    const test = await execa("ape", ["test"], { cwd: projectDir, all: true });
    Object.assign(result, parsePytestCounts(test.all ?? test.stdout));
  } catch (error) {
    const err = error as { all?: string; stderr?: string; stdout?: string };
    const output = err.all ?? `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
    Object.assign(result, parsePytestCounts(output));
    result.testErrors = lines(output);
  }

  return result;
}
