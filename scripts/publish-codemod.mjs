/**
 * Stage a small tree (no root devDependencies) and publish to Codemod.
 * Run from repo root after `npx codemod login` (publish uses cwd for auth).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const stage = path.join(root, "_codemod_staging");

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

rmrf(stage);
fs.mkdirSync(stage, { recursive: true });
copyDir(path.join(root, "dist"), path.join(stage, "dist"));
copyDir(path.join(root, "docs"), path.join(stage, "docs"));
fs.mkdirSync(path.join(stage, "src"), { recursive: true });
copyDir(path.join(root, "src", "transforms"), path.join(stage, "src", "transforms"));
for (const f of [
  "package.json",
  "package-lock.json",
  ".codemodrc.json",
  "workflow.yaml",
  "codemod.yaml",
]) {
  fs.copyFileSync(path.join(root, f), path.join(stage, f));
}

execSync("npm ci --omit=dev", { cwd: stage, stdio: "inherit" });
execSync("npx --yes codemod@latest publish _codemod_staging", {
  cwd: root,
  stdio: "inherit",
});
rmrf(stage);
