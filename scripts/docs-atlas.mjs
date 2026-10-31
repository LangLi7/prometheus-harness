#!/usr/bin/env node
/**
 * Builds the documentation atlas for the Obsidian vault.
 *
 * Every markdown file below docs/ becomes one note. Links between documents come
 * from the relative links in the documents themselves; code anchors come from the
 * Graphify graph: a symbol counts only when the document mentions it in backticks
 * and the graph knows it as a node of a real source file. The document-to-code
 * edges of the graph are deliberately unused — they are noise (one persistence
 * document "references" assets.mjs 135 times).
 *
 * Usage:
 *   node scripts/docs-atlas.mjs                      # preview into .tmp/docs-atlas/out
 *   node scripts/docs-atlas.mjs --out <dir>          # preview into <dir>
 *   node scripts/docs-atlas.mjs --vault <vault dir>  # write into <vault dir>
 *
 * Existing notes are never overwritten unless --force is given.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, relative, dirname, resolve, sep, basename } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const force = args.includes('--force');
const ROOT = process.cwd();
const GRAPH_PATH = join(ROOT, 'graphify-out', 'graph.json');
const DOCS_DIR = join(ROOT, 'docs');
const VAULT_SUBDIR = 'PMH/Docs';
const HUB_NAME = 'Doku-Atlas';

const vaultRoot = flag('vault');
const outRoot = vaultRoot ? join(resolve(vaultRoot), ...VAULT_SUBDIR.split('/')) : join(ROOT, '.tmp', 'docs-atlas', 'out');

// ---------------------------------------------------------------- graph facts
const graph = JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
const codeSymbols = new Map(); // label -> definition site
const docNodeCount = new Map(); // docs path -> number of graph nodes

const SOURCE = /^(packages|apps|services|units|native)\/.+\.(ts|tsx|go|rs|mjs|js|c|h|sql)$/;
const NOT_SOURCE = /(^|\/)(tests?|node_modules|dist|build|cache|\.agents|website)\//;
const isAnchorShaped = (label) => {
  if (label.length < 6 || label.length > 64) return false;
  if (!/^[A-Za-z_$][A-Za-z0-9_$.]*$/.test(label)) return false;
  if (/\.(ts|tsx|go|rs|mjs|js|c|h|sql|md|json|yaml|yml|toml)$/.test(label)) return false; // file names
  return /[A-Z]/.test(label.slice(1)) || label.includes('_') || label.includes('.') || /^[A-Z0-9_]{6,}$/.test(label);
};

for (const n of graph.nodes) {
  const f = n.source_file;
  if (typeof f !== 'string') continue;
  if (f.startsWith('docs/')) {
    docNodeCount.set(f, (docNodeCount.get(f) ?? 0) + 1);
    continue;
  }
  if (n.file_type !== 'code' || !SOURCE.test(f) || NOT_SOURCE.test(f)) continue;
  const label = String(n.label ?? '').replace(/\(\)$/, '').trim();
  if (!isAnchorShaped(label)) continue;
  if (!codeSymbols.has(label)) codeSymbols.set(label, { label, file: f, line: n.source_location ?? '' });
}

// ---------------------------------------------------------------- read docs
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const docs = [];
for (const abs of walk(DOCS_DIR).sort()) {
  const rel = relative(ROOT, abs).split(sep).join('/');
  const text = readFileSync(abs, 'utf8');
  const lines = text.split(/\r?\n/);
  const h1 = lines.find((l) => /^#\s+/.test(l));
  const title = h1 ? h1.replace(/^#\s+/, '').trim() : basename(rel, '.md');
  const bodyStart = h1 ? lines.indexOf(h1) + 1 : 0;
  let bodyEnd = lines.findIndex((l, i) => i > bodyStart && /^##\s+/.test(l));
  if (bodyEnd < 0) bodyEnd = Math.min(lines.length, bodyStart + 25);

  const counts = new Map();
  const pathCounts = new Map();
  for (const span of text.matchAll(/`([^`\n]{1,120})`/g)) {
    const raw = span[1].trim();
    if (/^[\w./-]+\.(ts|tsx|go|rs|mjs|js|c|h|sql|json|yaml|yml|md|toml)$/.test(raw) && !raw.startsWith('/')) {
      const abs2 = resolve(ROOT, raw);
      if (abs2.startsWith(ROOT) && existsSync(abs2)) {
        const r2 = relative(ROOT, abs2).split(sep).join('/');
        if (!r2.startsWith('docs/')) pathCounts.set(r2, (pathCounts.get(r2) ?? 0) + 1);
      }
    }
    for (const tok of raw.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*/g)) {
      if (codeSymbols.has(tok[0])) counts.set(tok[0], (counts.get(tok[0]) ?? 0) + 1);
    }
  }

  const links = new Set();
  for (const m of text.matchAll(/\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g)) {
    if (/^[a-z]+:/i.test(m[1])) continue;
    const rel2 = relative(ROOT, resolve(dirname(abs), m[1])).split(sep).join('/');
    if (rel2.startsWith('docs/')) links.add(rel2);
  }

  docs.push({
    path: rel,
    title,
    words: text.split(/\s+/).filter(Boolean).length,
    lead: lines.slice(bodyStart, bodyEnd).join('\n').trim(),
    symbols: [...counts.entries()]
      .map(([tok, count]) => ({ ...codeSymbols.get(tok), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    files: [...pathCounts.entries()]
      .map(([file, count]) => ({ file, count }))
      .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file)),
    links: [...links],
  });
}

const byPath = new Map(docs.map((d) => [d.path, d]));
const known = new Set(docs.map((d) => d.path));

/** Canonical representative of a document across its language mirrors. */
function canonicalPath(p) {
  if (!p.startsWith('docs/dsh/translation_')) return p;
  const original = p.replace(/^docs\/dsh\/translation_(en|de)\//, 'docs/dsh/original/');
  return known.has(original) ? original : p;
}

const mirrors = new Map();
for (const d of docs) {
  const c = canonicalPath(d.path);
  if (!mirrors.has(c)) mirrors.set(c, []);
  if (c !== d.path) mirrors.get(c).push(d.path);
}

const canonical = [...new Set(docs.map((d) => canonicalPath(d.path)))].sort();
const anchoredCanonical = canonical.filter((c) => {
  const d = byPath.get(c);
  return d && (d.symbols.length > 0 || d.files.length > 0);
}).length;
const notePathOf = (docPath) => `${docPath.replace(/^docs\//, '')}`;

const basenameCount = new Map();
for (const c of canonical) {
  const b = basename(c, '.md');
  basenameCount.set(b.toLowerCase(), (basenameCount.get(b.toLowerCase()) ?? 0) + 1);
}
/** Unambiguous wikilink target: bare basename when unique, otherwise the vault path. */
const linkTarget = (docPath) => {
  const c = canonicalPath(docPath);
  const b = basename(c, '.md');
  return (basenameCount.get(b.toLowerCase()) ?? 0) > 1 ? `${VAULT_SUBDIR}/${notePathOf(c).replace(/\.md$/, '')}` : b;
};

// ---------------------------------------------------------------- note text
const yaml = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n+/g, ' ');
const num = (n) => n.toLocaleString('de-DE');
const areaOf = (docPath) => {
  const segs = docPath.split('/');
  return segs[1] === 'dsh' ? 'dsh' : segs.length === 2 ? '(root)' : segs[1];
};

function abstractOf(doc) {
  const cleaned = doc.lead
    .split(/\r?\n/)
    .map((l) => l.replace(/^>\s?/, ''))
    .filter((l) => !/^```/.test(l) && !/^\s*\|/.test(l) && !/^!\[/.test(l) && !/^<img/.test(l) && !/^-{3,}\s*$/.test(l));
  let text = cleaned.join('\n').replace(/\n{2,}/g, '\n\n').trim();
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g, (m, label, target) => {
    if (/^[a-z]+:/i.test(target) || target.startsWith('/')) return m;
    const rel = relative(ROOT, resolve(dirname(join(ROOT, doc.path)), target)).split(sep).join('/');
    if (!known.has(rel) && !known.has(canonicalPath(rel))) return m;
    return `[[${linkTarget(rel)}|${label}]]`;
  });
  if (text.length > 650) text = text.slice(0, 650).replace(/\s+\S*$/, '') + ' …';
  return text;
}

function noteFor(docPath) {
  const d = byPath.get(docPath);
  const area = areaOf(docPath);
  const dir = dirname(notePathOf(docPath)).split(sep).join('/');
  const isRootDir = dir === '.';
  const registerTarget = isRootDir ? `${VAULT_SUBDIR}/${HUB_NAME}` : `${VAULT_SUBDIR}/${dir}/Register`;
  const registerLabel = area === '(root)' ? 'Wurzel' : dir;
  const docMirrors = (mirrors.get(docPath) ?? []).slice().sort();
  const graphNodes = docNodeCount.get(docPath) ?? 0;

  const out = [];
  out.push('---');
  out.push(`title: ${yaml(d.title)}`);
  out.push(`quelle: ${yaml(docPath)}`);
  out.push(`bereich: ${yaml(area)}`);
  out.push(`woerter: ${d.words}`);
  out.push(`graphknoten: ${graphNodes}`);
  out.push('stand: 2026-10-21');
  out.push('tags:');
  out.push('  - pmh/docs');
  out.push(`  - pmh/docs/${area === '(root)' ? 'root' : area}`);
  out.push('---');
  out.push('');
  out.push(`# ${d.title}`);
  out.push('');
  out.push('> [!info] Herkunft');
  out.push(`> Quelle: \`${docPath}\` · ${num(d.words)} Wörter · Register [[${registerTarget}|${registerLabel}]]`);
  out.push(`> Im Graph: ${num(graphNodes)} Knoten (Abschnitte) · Atlas [[${VAULT_SUBDIR}/${HUB_NAME}|Doku-Atlas]]`);
  out.push('');

  if (docMirrors.length) {
    out.push('> [!note] Sprachfassungen');
    for (const m of docMirrors) out.push(`> - \`${m.replace(/^docs\//, '')}\``);
    out.push('');
  }

  const abstract = abstractOf(d);
  if (abstract) {
    out.push('## Kurzfassung');
    out.push('');
    out.push(abstract);
    out.push('');
  }

  if (d.symbols.length) {
    out.push('## Code-Anker');
    out.push('');
    out.push('| Symbol | Fundstelle | Nennungen |');
    out.push('|---|---|---:|');
    for (const s of d.symbols.slice(0, 15)) out.push(`| \`${cell(s.label)}\` | \`${s.file}:${String(s.line).replace(/^L/, '')}\` | ${s.count} |`);
    if (d.symbols.length > 15) out.push('');
    if (d.symbols.length > 15) out.push(`… und ${d.symbols.length - 15} weitere Symbole.`);
    out.push('');
  }

  if (d.files.length) {
    out.push('## Berührte Dateien');
    out.push('');
    out.push('| Datei | Nennungen |');
    out.push('|---|---:|');
    for (const f of d.files.slice(0, 12)) out.push(`| \`${cell(f.file)}\` | ${f.count} |`);
    out.push('');
  }

  const links = [...new Set(d.links.filter((l) => known.has(l) || known.has(canonicalPath(l))))].filter((l) => canonicalPath(l) !== docPath);
  if (links.length) {
    out.push('## Verweise');
    out.push('');
    for (const l of links) {
      const t = byPath.get(canonicalPath(l)) ?? byPath.get(l);
      out.push(`- [[${linkTarget(l)}|${t.title}]]`);
    }
    out.push('');
  }

  out.push('---');
  out.push(`Zurück: [[${registerTarget}|${registerLabel}]] · [[${VAULT_SUBDIR}/${HUB_NAME}|Doku-Atlas]]`);
  return { path: `${notePathOf(docPath)}`, content: out.join('\n') };
}

// ---------------------------------------------------------------- registers
function buildRegisters() {
  const dirs = new Map();
  for (const c of canonical) {
    const dir = dirname(notePathOf(c)).split(sep).join('/');
    if (!dirs.has(dir)) dirs.set(dir, []);
    dirs.get(dir).push(c);
  }
  // Ancestors that hold no document of their own still need a register, otherwise
  // the child registers point at nothing.
  for (const dir of [...dirs.keys()]) {
    let parent = dirname(dir).split(sep).join('/');
    while (parent !== '.' && parent !== '') {
      if (!dirs.has(parent)) dirs.set(parent, []);
      parent = dirname(parent).split(sep).join('/');
    }
  }

  const registers = [];
  for (const [dir, members] of dirs) {
    const isRoot = dir === '.';
    const dirLabel = isRoot ? 'Wurzel' : dir;
    const subdirs = [...dirs.keys()].filter((d) => d !== dir && (dir === '.' ? !d.includes('/') : dirname(d) === dir)).sort();
    const childCount = (d) => [...dirs.entries()].filter(([k]) => k === d || k.startsWith(`${d}/`)).reduce((s, [, v]) => s + v.length, 0);
    const registerPath = isRoot ? `${HUB_NAME}.md` : `${dir}/Register.md`;
    const parent = dir === '.' ? null : dirname(dir) === '.' ? `${HUB_NAME}` : `${dirname(dir)}/Register`;

    members.sort((a, b) => byPath.get(a).title.localeCompare(byPath.get(b).title, 'de'));

    const out = [];
    out.push('---');
    out.push(`title: ${yaml(isRoot ? 'Doku-Atlas — Prometheus Harness' : `Register ${dir}`)}`);
    out.push(`bereich: ${yaml(isRoot ? 'atlas' : dir)}`);
    out.push('stand: 2026-10-21');
    out.push('tags:');
    out.push('  - pmh/docs');
    out.push('  - pmh/docs/register');
    out.push('---');
    out.push('');
    out.push(`# ${isRoot ? 'Doku-Atlas — Prometheus Harness' : `Register ${dir}`}`);
    out.push('');

    if (isRoot) {
      out.push('Eine Notiz je Dokument aus `docs/`, dazu die Fundstellen im Code. Der Atlas ist nicht');
      out.push('die Dokumentation — er ist die Landkarte davor.');
      out.push('');
      out.push('## Wie verknüpft wird');
      out.push('');
      out.push('| Verbindung | Herkunft | Regel |');
      out.push('|---|---|---|');
      out.push('| Dokument → Dokument | `docs/` selbst | jeder relative `.md`-Verweis wird ein Wikilink |');
      out.push('| Dokument → Symbol | Graphify-Graph | nur Symbole, die **in Backticks** stehen **und** als Knoten einer Quelldatei existieren |');
      out.push('| Dokument → Datei | Dateisystem | nur Pfade, die im Arbeitsbaum wirklich existieren |');
      out.push('');
      out.push('**Nicht** benutzt: die Doku→Code-Kanten des Graphen. Sie sind Rauschen — ein');
      out.push('Persistenz-Dokument „verweist" dort 135-mal auf `assets.mjs`. Die Knoten tragen, die Kanten nicht.');
      out.push('');
      out.push('## Zahlen');
      out.push('');
      out.push('| Größe | Wert |');
      out.push('|---|---:|');
      out.push(`| Dokumente in \`docs/\` | ${num(docs.length)} |`);
      out.push(`| Notizen (ohne Sprachfassungen) | ${num(canonical.length)} |`);
      out.push(`| Sprachfassungen (nur verwiesen) | ${num([...mirrors.values()].reduce((s, v) => s + v.length, 0))} |`);
      out.push(`| Dokumente mit Code-Ankern | ${num(anchoredCanonical)} |`);
      out.push(`| Knoten im Graphen | ${num(graph.nodes.length)} |`);
      out.push(`| Kanten im Graphen | ${num((graph.links ?? []).length)} |`);
      out.push('');
      out.push('Erzeugt mit `node scripts/docs-atlas.mjs --vault <vault>`. Der Graph ist **code-only** plus');
      out.push('Markdown-Abschnitte; Dokumente ohne Backtick-Symbole bleiben bewusst ohne Anker.');
      out.push('');
    }

    out.push(
      members.length === 1
        ? '**1** Dokument in diesem Ordner.'
        : members.length === 0
          ? 'Keine Dokumente direkt in diesem Ordner — nur Unterordner.'
          : `**${num(members.length)}** Dokumente in diesem Ordner.`,
    );
    out.push('');

    if (subdirs.length) {
      out.push('## Unterordner');
      out.push('');
      for (const s of subdirs) out.push(`- [[${VAULT_SUBDIR}/${s}/Register|${s}]] — ${num(childCount(s))} Dokumente`);
      out.push('');
    }

    out.push('## Dokumente');
    out.push('');
    out.push('| Dokument | Wörter | Anker | Graph | Sprachfassungen |');
    out.push('|---|---:|---:|---:|---:|');
    for (const c of members) {
      const d = byPath.get(c);
      out.push(
        `| [[${linkTarget(c)}|${cell(d.title)}]] | ${num(d.words)} | ${d.symbols.length + d.files.length} | ${num(docNodeCount.get(c) ?? 0)} | ${(mirrors.get(c) ?? []).length} |`,
      );
    }
    out.push('');
    out.push(isRoot ? 'Zurück: [[PMH/Index|PMH — Projektgedächtnis]]' : `Zurück: [[${parent}|${parent === HUB_NAME ? 'Doku-Atlas' : dirname(dir)}]] · [[${VAULT_SUBDIR}/${HUB_NAME}|Doku-Atlas]]`);
    registers.push({ path: registerPath, content: out.join('\n') });
  }
  return registers;
}

// ---------------------------------------------------------------- write
const notes = canonical.map(noteFor);
const registers = buildRegisters();
mkdirSync(outRoot, { recursive: true });

let written = 0;
let skipped = 0;
for (const n of [...notes, ...registers]) {
  const abs = join(outRoot, n.path);
  if (existsSync(abs) && !force) {
    skipped += 1;
    continue;
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, n.content, 'utf8');
  written += 1;
}

console.log(
  JSON.stringify(
    {
      target: outRoot,
      notes: notes.length,
      registers: registers.length,
      written,
      skipped,
      graph: { nodes: graph.nodes.length, edges: (graph.links ?? []).length, builtAt: graph.built_at_commit?.slice(0, 7) },
    },
    null,
    2,
  ),
);
