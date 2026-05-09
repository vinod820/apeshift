#!/usr/bin/env bash
# Syncs the version field in each codemod's codemod.yaml with its package.json.
# Run after `changeset version` to keep both files in sync.

set -euo pipefail

for pkg_json in codemods/*/package.json; do
  dir="$(dirname "$pkg_json")"
  codemod_yaml="$dir/codemod.yaml"

  if [ ! -f "$codemod_yaml" ]; then
    continue
  fi

  version="$(node -p "require('./$pkg_json').version")"
  node -e "const fs=require('fs'); const p=process.argv[1]; const ver=process.argv[2]; let s=fs.readFileSync(p,'utf8'); s=s.replace(/^version: .*/m, 'version: \"'+ver+'\"'); fs.writeFileSync(p,s);" "$codemod_yaml" "$version"

  echo "Synced $codemod_yaml to version $version"
done
