import { describe, expect, it } from 'bun:test';
import { analyzeDiff, parseDiff } from '../slop-check.mjs';

const fileDiff = (path, added, start = 1) =>
  [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -0,0 +${start},${added.length} @@`,
    ...added.map((line) => `+${line}`),
  ].join('\n');

const rules = (diff) => analyzeDiff(diff).findings.map((finding) => finding.rule);

describe('parseDiff', () => {
  it('numbers added lines from the hunk header', () => {
    const [file] = parseDiff(fileDiff('src/a.ts', ['const a = 1;', 'const b = 2;'], 10));
    expect(file.path).toBe('src/a.ts');
    expect(file.added.map((entry) => entry.line)).toEqual([10, 11]);
  });

  it('does not treat added text that looks like a file header as one', () => {
    const [file] = parseDiff(fileDiff('src/a.ts', ['const s = "+++ not a header";']));
    expect(file.path).toBe('src/a.ts');
    expect(file.added).toHaveLength(1);
  });
});

describe('type silence', () => {
  it('flags an added `as any` with its line number', () => {
    const { findings } = analyzeDiff(fileDiff('src/a.ts', ['const a = 1;', 'const b = input as any;']));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: 'type-silence', path: 'src/a.ts', line: 2 });
  });

  it('flags a `: any` annotation', () => {
    expect(rules(fileDiff('src/a.ts', ['function f(x: any) {}']))).toEqual(['type-silence']);
  });

  it('flags @ts-ignore and @ts-expect-error', () => {
    expect(rules(fileDiff('src/a.ts', ['// @ts-ignore']))).toEqual(['type-silence']);
    expect(rules(fileDiff('src/a.ts', ['// @ts-expect-error']))).toEqual(['type-silence']);
  });

  it('ignores removed lines', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,1 +1,1 @@',
      '-const b = input as any;',
      '+const b = input as string;',
    ].join('\n');
    expect(rules(diff)).toEqual([]);
  });

  it('accepts a violation with a stated reason', () => {
    expect(rules(fileDiff('src/a.ts', ['const b = legacy as any; // slop-ok: vendor typings are wrong']))).toEqual([]);
  });

  it('does not check prose in documents', () => {
    expect(rules(fileDiff('docs/x.md', ['| `as any` | stellt den Prüfer stumm |']))).toEqual([]);
  });

  it('exempts only its own source, not other code', () => {
    expect(rules(fileDiff('scripts/slop-check.mjs', ['const b = x as any;']))).toEqual([]);
    expect(rules(fileDiff('scripts/other.mjs', ['const b = x as any;']))).toEqual(['type-silence']);
  });
});

describe('review size', () => {
  it('passes at the limit and fails above it', () => {
    expect(rules(fileDiff('src/a.ts', Array(400).fill('const a = 1;')))).toEqual([]);
    expect(rules(fileDiff('src/a.ts', Array(401).fill('const a = 1;')))).toEqual(['diff-too-large']);
  });

  it('uses a separate limit for documents', () => {
    expect(rules(fileDiff('docs/x.md', Array(1200).fill('Zeile')))).toEqual([]);
    expect(rules(fileDiff('docs/x.md', Array(1201).fill('Zeile')))).toEqual(['docs-too-large']);
  });

  it('flags a change that touches too many files', () => {
    const diff = Array.from({ length: 26 }, (_, index) => fileDiff(`src/f${index}.ts`, ['const a = 1;'])).join('\n');
    expect(rules(diff)).toEqual(['file-spread']);
  });

  it('counts code and docs separately', () => {
    const { stats } = analyzeDiff(
      [fileDiff('src/a.ts', ['const a = 1;']), fileDiff('docs/x.md', ['Text'])].join('\n'),
    );
    expect(stats).toMatchObject({ files: 2, codeLines: 1, docLines: 1 });
  });
});

describe('dependencies', () => {
  const packageDiff = ['diff --git a/package.json b/package.json', '--- a/package.json', '+++ b/package.json', '@@ -1,1 +1,1 @@', '+    "left-pad": "^1.3.0",'].join('\n');

  it('flags a dependency without a lockfile change', () => {
    const { findings } = analyzeDiff(packageDiff);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: 'dependency-without-lock', dependency: 'left-pad' });
  });

  it('accepts a dependency when the lockfile changes in the same diff', () => {
    expect(rules([packageDiff, fileDiff('bun.lock', ['left-pad@1.3.0'])].join('\n'))).toEqual([]);
  });

  it('does not mistake the package version for a dependency', () => {
    expect(rules(['diff --git a/package.json b/package.json', '--- a/package.json', '+++ b/package.json', '@@ -1,1 +1,1 @@', '+  "version": "1.2.3",'].join('\n'))).toEqual([]);
  });
});
