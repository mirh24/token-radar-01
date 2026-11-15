// main.ts: the token radar's entrypoint (Node 22, no dependencies, TypeScript).
//
// Reads /input/snapshot.json, writes the ranked board to /output/board.json,
// the dashboard's data to /output/data.js, copies dashboard/ and screenshots/
// to /output, and writes /output/dossier.json.
//
//   node main.ts                          the sandbox's defaults, /input and /output
//   node main.ts --input snap.json        a local snapshot path
//   node main.ts --output out             a local output directory
//
// --output is where the files go; the snapshot is read from --input or from
// /input/snapshot.json (MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR still set the
// defaults, as in the starter).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-board.ts';
import { MODEL, MODEL_VERSION, boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

interface Flags {
  input: string | null;
  output: string | null;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { input: null, output: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--input' && i + 1 < argv.length) flags.input = argv[++i]!;
    else if (a === '--output' && i + 1 < argv.length) flags.output = argv[++i]!;
    else throw new Error(`unknown argument: ${a}`);
  }
  return flags;
}

/** The dashboard and screenshots as the entry ships them: main.ts's own directory. */
function entryDir(): string {
  return resolve(join(import.meta.url.replace(/^file:\/\//, ''), '..'));
}

/** Copies one plain file tree into another, quietly; a missing source directory is refused. */
function copyTreeFiles(src: string, dst: string): number {
  let n = 0;
  const walkTree = (a: string, b: string): void => {
    for (const e of readdirSync(a, { withFileTypes: true })) {
      const s = join(a, e.name);
      const d = join(b, e.name);
      if (e.isDirectory()) {
        mkdirSync(d, { recursive: true });
        walkTree(s, d);
      } else if (e.isFile()) {
        copyFileSync(s, d);
        n++;
      } else throw new Error(`${s} is neither a file nor a directory`);
    }
  };
  if (!existsSync(src)) throw new Error(`no ${src}: the dashboard ships in the entry`);
  mkdirSync(dst, { recursive: true });
  walkTree(src, dst);
  return n;
}

/** The board's own gate, before anything is written: coverage, ranks, order, farm steps, size. */
function assertBoardSize(board: { length: number }): void {
  if (board.length < 100) throw new Error(`the board holds ${board.length} rows, fewer than the gate's 100`);
  if (board.length > 4_000) throw new Error(`the board holds ${board.length} rows, more than the gate's 4,000`);
}

function main(): void {
  const flags = parseFlags(process.argv.slice(2));
  const input = flags.input ?? join(inputDir, 'snapshot.json');
  const output = resolve(flags.output ?? outputDir);
  const here = entryDir();

  const snapshot = parseSnapshot(readFileSync(input, 'utf8'));
  const { board, radar } = buildRadar(snapshot, MODEL);

  const issue = boardIssue(board, snapshot);
  if (issue !== null) throw new Error(`the board fails its own gate: ${issue}`);
  assertBoardSize(board);

  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'board.json'), `${JSON.stringify(board, null, 2)}\n`);
  writeFileSync(join(output, 'data.js'), dataScript(radar));
  const dashboardFiles = copyTreeFiles(join(here, 'dashboard'), join(output, 'dashboard'));
  const screenshotCount = existsSync(join(here, 'screenshots')) ? copyTreeFiles(join(here, 'screenshots'), join(output, 'screenshots')) : 0;
  writeFileSync(join(output, 'dossier.json'), buildDossier(output, { text_max_bytes: 65536 }));

  const top = board[0]!;
  const low = board[board.length - 1]!;
  const verdicts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) verdicts[r.farm_economics.verdict]++;
  console.log(`board: ${board.length} rows (${snapshot.watchlist.length} watchlist + ${radar.early_size} early)`);
  console.log(`  live set aside: ${radar.live_size} tokened protocols, by market cap`);
  console.log(`  top: ${top.name} ($${top.implied_value_usd.toLocaleString('en-US')})`);
  console.log(`  bottom: ${low.name} ($${low.implied_value_usd.toLocaleString('en-US')})`);
  console.log(`  model: ${MODEL_VERSION}; global multiple ${radar.global_multiple}; ${radar.comparables.length} categories with comparables`);
  console.log(`  backtest: LOO n=${radar.backtest.n}, median error x${radar.backtest.median_error_factor}, within 2x ${(radar.backtest.within_2x * 100).toFixed(0)}%, band x${radar.backtest.band_factor}`);
  console.log(`  verdicts: FARM ${verdicts.FARM}, THIN ${verdicts.THIN}, SKIP ${verdicts.SKIP}`);
  console.log(`  dashboard: ${dashboardFiles} files; screenshots: ${screenshotCount} images`);
  console.log(`  wrote: ${join(output, 'board.json')}, ${join(output, 'data.js')}, ${join(output, 'dossier.json')}`);
}

main();
