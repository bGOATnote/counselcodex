import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directories = ["src", "scripts", "tests"];
const files = [];

for (const directory of directories) {
  const entries = await readdir(resolve(root, directory), { recursive: true });
  for (const entry of entries) {
    if (entry.endsWith(".mjs")) files.push(resolve(root, directory, entry));
  }
}

for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Syntax checked ${files.length} JavaScript modules.`);

