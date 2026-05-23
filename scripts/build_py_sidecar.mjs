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
// const args = [
//   "-m",
//   "PyInstaller",
//   entry,
//   "--collect-all",
//   "numpy",
//   "--collect-all",
//   "pandas",
//   "--collect-all",
//   "weasyprint",
//   "--name",
//   "python-sidecar",
//   "--onefile",
//   "--distpath",
//   distPath,
//   "--clean",
// ];

const args = [
  "-m", "nuitka",
  "--standalone",
  "--onefile",
  "--cache-mode=all", // enable caching features
  "--file-reference-choice=runtime", // Force Nuitka to reuse previously compiled modules
  "--include-data-dir=src-python/ble/dataset=dataset",
  "--include-onefile-external-data=dataset", // Crucial for --onefile mode
  "--include-data-dir=src-python/pdf_engine/templates=templates",
  "--include-onefile-external-data=templates",
  "--include-data-dir=src-python/pdf_engine/assets=assets",
  "--include-onefile-external-data=assets",
  "--include-data-files=public/ssc.svg=ssc.svg",
  "--include-onefile-external-data=ssc.svg",
  "--plugin-enable=numpy",
  "--include-package=weasyprint",
  "--include-package=jinja2",
  "--output-filename=python-sidecar-x86_64-unknown-linux-gnu",
  "--output-dir=" + distPath,
  entry
];


const result = spawnSync(pythonExe, args, { stdio: "inherit" });
if (result.error) {
  fail(String(result.error));
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

// Tauri's bundler looks for external binaries with the target triple suffix:
// e.g. python-sidecar-x86_64-unknown-linux-gnu
const targetTriple =
  process.env.TAURI_ENV_TARGET_TRIPLE ||
  process.env.TARGET ||
  process.env.SSC_TARGET_TRIPLE ||
  (isWindows ? "x86_64-pc-windows-msvc" : "x86_64-unknown-linux-gnu");

const baseName = "python-sidecar";
const ext = isWindows ? ".exe" : "";
const builtPath = path.join(distPath, `${baseName}${ext}`);
const suffixedPath = path.join(distPath, `${baseName}-${targetTriple}${ext}`);

if (!fs.existsSync(builtPath)) {
  // fail(`Expected PyInstaller output not found: ${builtPath}`);
  fail(`Expected Nuitka output not found: ${builtPath}`);
}

try {
  fs.copyFileSync(builtPath, suffixedPath);
} catch (e) {
  fail(`Failed to create Tauri-suffixed sidecar binary: ${String(e)}`);
}

process.exit(0);
