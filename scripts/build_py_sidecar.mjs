import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const repoRoot = process.cwd();
const isWindows = process.platform === "win32";

const venvPython = path.join(
  repoRoot,
  "src-python",
  ".venv",
  isWindows ? "Scripts" : "bin",
  isWindows ? "python.exe" : "python"
);

const pythonExe = process.env.PYTHON_EXE || venvPython;
if (!fs.existsSync(pythonExe)) {
  fail(
    [
      "Python executable not found for build:py.",
      `Looked for: ${pythonExe}`,
      "Fix options:",
      "- Create the venv at src-python/.venv",
      "- Or set PYTHON_EXE to your python path for the venv",
    ].join("\n")
  );
}

const entry = path.join(repoRoot, "src-python", "main.py");
if (!fs.existsSync(entry)) {
  fail(`Entry file missing: ${entry}`);
}

const distPath = path.join(repoRoot, "src-tauri");
const args = [
  "-m",
  "PyInstaller",
  entry,
  "--name",
  "python-sidecar",
  "--onefile",
  "--distpath",
  distPath,
  "--clean",
];

const result = spawnSync(pythonExe, args, { stdio: "inherit" });
if (result.error) {
  fail(String(result.error));
}
process.exit(result.status ?? 1);

