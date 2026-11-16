// main.ts — token-radar-01 entrypoint.
//
// Reads one sealed DefiLlama snapshot, runs the radar model over it, and
// writes the entry's output directory:
//
//   board.json     the ranked board (pretty JSON, one row per protocol)
//   data.js        the dashboard's whole dataset as window.RADAR
//   dashboard/     a copy of this repo's dashboard/ (the page's source)
//   screenshots/   a copy of this repo's screenshots/ (the cover images)
//   dossier.json   the make.fun dossier of the output directory
//
// The dossier is built last, from the output directory itself, so the copy
// of the dossier the scorer rebuilds from the same directory is identical.
//
// Usage:
//   node main.ts [--input snapshot.json] [--output dir]
// With no flags the grader's paths apply: /input/snapshot.json -> /output.

import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDossier } from './vendor/makefun-board.ts';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';

// The repo root: the directory this file lives in. The dashboard and the
// screenshots are copied from here, so the run works from any cwd.
const REPO_ROOT = dirname(fileURLToPath(import.meta.url));

// The grader's paths when no flags are given.
const FALLBACK_INPUT = '/input/snapshot.json';
const FALLBACK_OUTPUT = '/output';

// The dossier's text cap, in UTF-8 bytes: the same cap the gate rebuilds
// with, so the dossier written here is the dossier the gate expects.
const DOSSIER_TEXT_MAX_BYTES = 65536;

interface CliOptions {
  inputPath: string;
  outputDir: string;
}

// One flag, in either spelling: --input path or --input=path. Anything else
// that starts with -- is rejected rather than silently ignored.
function parseCli(argv: string[]): CliOptions {
  const options: CliOptions = { inputPath: FALLBACK_INPUT, outputDir: FALLBACK_OUTPUT };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? null : arg.slice(eq + 1);
    const takeValue = (): string => {
      if (inline !== null) return inline;
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`main.ts: ${flag} needs a value`);
      }
      i++;
      return next;
    };
    if (flag === '--input') options.inputPath = takeValue();
    else if (flag === '--output') options.outputDir = takeValue();
    else throw new Error(`main.ts: unknown flag ${flag}`);
  }
  return options;
}

// The output directory, ready to receive files: the root plus the two
// subdirectories the dossier reads back.
function prepareOutputDir(outputDir: string): void {
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(join(outputDir, 'dashboard'), { recursive: true });
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
}

function main(): void {
  const { inputPath, outputDir } = parseCli(process.argv.slice(2));

  // The snapshot, parsed and refused unless it is the shape the model scores.
  const snapshot = parseSnapshot(readFileSync(inputPath, 'utf8'));

  // The board and the dashboard's dataset, from the snapshot alone.
  const { board, radar } = buildRadar(snapshot);

  // The gate's own board rule, applied before anything is written.
  const issue = boardIssue(board, snapshot);
  if (issue !== null) throw new Error(`main.ts: board rejected: ${issue}`);

  prepareOutputDir(outputDir);

  // The ranked board, pretty-printed; the file ends with a newline.
  writeFileSync(join(outputDir, 'board.json'), `${JSON.stringify(board, null, 2)}\n`, 'utf8');

  // The dashboard's dataset, as one script the page loads with no fetch.
  writeFileSync(join(outputDir, 'data.js'), dataScript(radar), 'utf8');

  // The page's source and the cover images, copied whole from this repo.
  cpSync(join(REPO_ROOT, 'dashboard'), join(outputDir, 'dashboard'), { recursive: true });
  cpSync(join(REPO_ROOT, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });

  // The dossier, built from the finished output directory so it describes
  // exactly what was written — dashboard source, screenshots and all.
  const dossier = buildDossier(outputDir, { text_max_bytes: DOSSIER_TEXT_MAX_BYTES });
  writeFileSync(join(outputDir, 'dossier.json'), dossier);

  console.log(
    `token-radar: ${board.length} rows (${radar.above_floor_size} above the floor, ` +
      `${radar.early_size} early), ${radar.live_size} live tokens set aside, ` +
      `wrote ${outputDir}`,
  );
}

main();
