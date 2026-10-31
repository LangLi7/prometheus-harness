#!/usr/bin/env node
/**
 * Slop guard — the three review costs that a machine can measure.
 *
 * Checks an added-lines diff for:
 *   1. type silence: `: any`, `as any`, `@ts-ignore`, `@ts-expect-error`
 *   2. review size: too many added code lines, doc lines, or touched files
 *   3. an unpinned dependency: package.json changes without a lockfile change
 *
 * A violation can be accepted in place with `slop-ok: <reason>` on the same line.
 * The rules and their rationale live in docs/status/slop-vorgaben.md.
 *
 * Usage:
 *   node scripts/slop-check.mjs                    # staged changes only
 *   node scripts/slop-check.mjs --range main...HEAD
 *   node scripts/slop-check.mjs --diff some.patch  # analyze a saved diff
 *   node scripts/slop-check.mjs --json
 *
 * Exit codes: 0 no findings, 1 findings, 2 usage or git error.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|go|rs|c|h|sql|astro|vue|svelte)$/;
const DOC_FILE = /\.(md|mdx)$/;
const LOCKFILES = new Set(['bun.lock', 'bun.lockb', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);

export const LIMITS = {
  codeLines: 400,
  docLines: 1200,
  files: 25,
};

const SILENCE = /(:\s*any\b|\bas\s+any\b|@ts-ignore|@ts-expect-error)/;

// The guard and its fixtures name these patterns by design; only the source itself is exempt.
const SELF = new Set(['scripts/slop-check.mjs', 'scripts/tests/slop-check.test.mjs']);

/** Turn a unified diff into per-file added lines with their new-file line numbers. */
export function parseDiff(text) {
  const files = new Map();
  let current = null;
  let inHeader = false;
  let newLine = 0;

  for (const raw of text.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      inHeader = true;
      current = null;
      continue;
    }

    if (raw.startsWith('--- ')) {
      inHeader = true;
      continue;
    }

    if (raw.startsWith('+++ ') && inHeader) {
      const target = raw.slice(4).trim();
      const path = target === '/dev/null' ? null : target.replace(/^b\//, '');
      current = path ? files.get(path) ?? { path, added: [], removed: 0 } : null;
      if (current) files.set(current.path, current);
      continue;
    }

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      inHeader = false;
      newLine = Number(hunk[1]);
      continue;
    }

    if (inHeader || !current) continue;

    if (raw.startsWith('+')) {
      current.added.push({ line: newLine, text: raw.slice(1) });
      newLine += 1;
    } else if (raw.startsWith('-')) {
      current.removed += 1;
    } else if (raw.startsWith(' ')) {
      newLine += 1;
    }
  }

  return [...files.values()];
}

const base = (path) => path.split('/').pop();

/** Analyze a diff. Pure function: no filesystem, no git. */
export function analyzeDiff(text, limits = LIMITS) {
  const parsed = parseDiff(text);
  const findings = [];
  const changed = parsed.map((file) => file.path);

  let codeLines = 0;
  let docLines = 0;
  let hasLockfile = false;

  for (const file of parsed) {
    const isCode = CODE_FILE.test(file.path);
    const isDoc = DOC_FILE.test(file.path);
    const isPackage = /(^|\/)package\.json$/.test(file.path);
    const isSelf = SELF.has(file.path);
    if (LOCKFILES.has(base(file.path))) hasLockfile = true;
    if (isCode) codeLines += file.added.length;
    if (isDoc) docLines += file.added.length;

    for (const { line, text: content } of file.added) {
      if (content.includes('slop-ok')) continue;
      if (isCode && !isSelf && SILENCE.test(content)) {
        findings.push({
          rule: 'type-silence',
          path: file.path,
          line,
          message: '`any` or a ts-ignore silences the checker; fix the type or add `slop-ok: <reason>`',
        });
      }
      if (isPackage) {
        const entry = /^\s*"([^"]+)"\s*:\s*"([~^]?\d[^"]*|workspace:[^"]*|file:[^"]*)"/.exec(content);
        if (entry && entry[1] !== 'version') {
          findings.push({
            rule: 'dependency-without-lock',
            path: file.path,
            line,
            message: 'dependency added; a lockfile change must be in the same diff',
            dependency: entry[1],
          });
        }
      }
    }
  }

  if (codeLines > limits.codeLines) {
    findings.push({
      rule: 'diff-too-large',
      path: '(diff)',
      line: 0,
      message: `${codeLines} added code lines (limit ${limits.codeLines}); split the change`,
    });
  }
  if (docLines > limits.docLines) {
    findings.push({
      rule: 'docs-too-large',
      path: '(diff)',
      line: 0,
      message: `${docLines} added doc lines (limit ${limits.docLines}); split the change`,
    });
  }
  if (changed.length > limits.files) {
    findings.push({
      rule: 'file-spread',
      path: '(diff)',
      line: 0,
      message: `${changed.length} files touched (limit ${limits.files}); one purpose per change`,
    });
  }

  const hasDependency = findings.some((finding) => finding.rule === 'dependency-without-lock');
  const filtered = hasDependency && !hasLockfile
    ? findings
    : findings.filter((finding) => finding.rule !== 'dependency-without-lock');

  return { findings: filtered, stats: { files: changed.length, codeLines, docLines } };
}

function gitDiff(args) {
  return execFileSync('git', ['diff', '--unified=0', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function parseArgs(argv) {
  const options = { limits: { ...LIMITS }, json: false, diffPath: null, range: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--diff') options.diffPath = argv[++i];
    else if (arg === '--range') options.range = argv[++i];
    else if (arg === '--limit-code') options.limits.codeLines = Number(argv[++i]);
    else if (arg === '--limit-docs') options.limits.docLines = Number(argv[++i]);
    else if (arg === '--limit-files') options.limits.files = Number(argv[++i]);
    else if (arg === '--help' || arg === '-h') options.help = true;
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]);
    return 0;
  }

  let diff = '';
  try {
    if (options.diffPath) diff = readFileSync(options.diffPath, 'utf8');
    else if (options.range) diff = gitDiff([options.range]);
    else diff = gitDiff(['--cached']);
  } catch (error) {
    console.error(`slop-check: cannot read the diff: ${error.message}`);
    return 2;
  }

  if (!diff.trim()) {
    if (options.range) {
      console.log(`slop-check: no changes in ${options.range}`);
      return 0;
    }
    console.log('slop-check: no staged changes — stage the change, or pass --range <rev> / --diff <file>');
    return 0;
  }

  const { findings, stats } = analyzeDiff(diff, options.limits);

  if (options.json) {
    console.log(JSON.stringify({ findings, stats }, null, 2));
  } else {
    for (const finding of findings) {
      const where = finding.line > 0 ? `${finding.path}:${finding.line}` : finding.path;
      console.log(`${where}  [${finding.rule}]  ${finding.message}`);
    }
    console.log(
      `slop-check: ${findings.length} finding(s) — ${stats.codeLines} code lines, ` +
        `${stats.docLines} doc lines, ${stats.files} file(s)`,
    );
  }

  return findings.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
