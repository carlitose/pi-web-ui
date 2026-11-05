// dist/ is versioned so that installs from a GitHub archive (which carries only tracked
// files and runs no build) still get the compiled bridge. This script keeps it honest:
//   node scripts/check-dist.mjs           fails when dist/ differs from a fresh build of src/
//   node scripts/check-dist.mjs --write   rebuilds dist/ from scratch
// Compiled tests (dist/**/test/) are ignored by Git and by this comparison, as by npm.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
// Same depth as dist/, so the relative source paths inside the .map files are identical.
const scratch = join(root, '.dist-check');
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');

function compile(outDir) {
  const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.json', '--outDir', outDir], { cwd: root, stdio: 'inherit' });
  return result.status === 0;
}

function listFiles(dir) {
  const files = new Map();
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'test') walk(path);
      } else {
        files.set(relative(dir, path).split(sep).join('/'), readFileSync(path));
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return files;
}

function check() {
  rmSync(scratch, { recursive: true, force: true });
  try {
    if (!compile(scratch)) return 1;
    const expected = listFiles(scratch);
    const actual = listFiles(dist);
    const problems = [];
    for (const [path, bytes] of expected) {
      if (!actual.has(path)) problems.push(`missing dist/${path}`);
      else if (!actual.get(path).equals(bytes)) problems.push(`stale   dist/${path}`);
    }
    for (const path of actual.keys()) {
      if (!expected.has(path)) problems.push(`extra   dist/${path}`);
    }
    if (problems.length > 0) {
      console.error(`dist/ does not match a fresh build (${problems.length} files):\n${problems.join('\n')}\nRun: npm run build:dist`);
      return 1;
    }
    console.log(`dist/ matches a fresh build (${expected.size} files).`);
    return 0;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function write() {
  rmSync(dist, { recursive: true, force: true });
  return compile(dist) ? 0 : 1;
}

process.exitCode = process.argv.includes('--write') ? write() : check();
