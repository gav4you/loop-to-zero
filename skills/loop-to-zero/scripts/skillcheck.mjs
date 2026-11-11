#!/usr/bin/env node
// skillcheck: lint the skill's own markdown against the tool kit. Node >= 18, no dependencies.
// Usage: node <skill>/scripts/skillcheck.mjs [--root <skill folder>]
// Reports each finding as file:line: [check] message, and exits non-zero on any finding:
//   [a] "ltz <word>" / "ltz.mjs <word>" where <word> is not a command
//   [b] a unit status or queue state token (closed-*, stopped-*, dropped-*, final-*) the code doesn't define
//   [c] a verdict value used inconsistently, or a repeatReason / foundBy value the code doesn't accept
//   [d] a config key (camelCase next to "config", config.<key>, or a key in a config.json example) the code doesn't read
//   [e] a file name in backticks (.md .json .jsonl .txt) that is neither in references/state-template.md nor a skill file
//   [f] a pointer such as `references/x.md` ("Section") whose file or heading doesn't exist
//   [file] a file the check expects is missing
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS } from './ltz.mjs';
import { UNIT_STATUSES, CONFIG_KEYS, UNIT_CONFIG_KEYS, SOURCE_CONFIG_KEYS } from './lib/state.mjs';
import { STATES } from './lib/queue.mjs';
import { VERDICTS, REPEAT_REASONS, FOUND_BY } from './lib/record.mjs';

const KNOWN_TOKENS = [...UNIT_STATUSES, ...STATES];
const KNOWN_KEYS = new Set([...CONFIG_KEYS, ...UNIT_CONFIG_KEYS, ...SOURCE_CONFIG_KEYS]);
const FILE_TOKEN = /[\w<>{}*~.\/-]*[\w>}*]\.(?:md|jsonl|json|txt)(?![\w])/g;
const PLACEHOLDER = /<[^>]*>|\{[^}]*\}|\*/g;

/** The files linted, relative to the skill folder. */
export function lintedFiles(root) {
  const refs = fs.existsSync(path.join(root, 'references'))
    ? fs.readdirSync(path.join(root, 'references')).filter((f) => f.endsWith('.md')).sort().map((f) => `references/${f}`)
    : [];
  return ['SKILL.md', 'lessons.md', ...refs, 'tests/README.md', 'scripts/README.md', 'scripts/hooks/README.md'];
}

function walk(root, rel = '', out = []) {
  for (const d of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${d.name}` : d.name;
    if (d.name === '.git' || d.name === 'node_modules' || r === 'scripts/test/tmp') continue;
    if (d.isDirectory()) walk(root, r, out);
    else out.push(r);
  }
  return out;
}

/** Lines, with which are inside fenced code blocks, and the line each block opened on. */
function parse(text) {
  const lines = text.split(/\r?\n/);
  const info = [];
  let open = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      info.push({ fence: true, fenced: false, start: open < 0 ? i : open });
      open = open < 0 ? i : -1;
      continue;
    }
    info.push({ fence: false, fenced: open >= 0, start: open });
  }
  return { lines, info };
}

/** Inline code spans of a (non-fenced) line: [{text, index}]. */
function spans(line) {
  const out = [];
  const re = /`([^`]+)`/g;
  let m;
  while ((m = re.exec(line))) out.push({ text: m[1], index: m.index });
  return out;
}

const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[`*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.:;,]+$/, '');

/** Headings and bold run-in labels of a markdown file, normalised. */
function headings(text) {
  const out = [];
  for (const l of text.split(/\r?\n/)) {
    const h = /^#{1,6}\s+(.*)$/.exec(l);
    if (h) out.push(norm(h[1]));
    const b = /^\s*(?:[-*]\s+|\d+\.\s+)?\*\*([^*]+?)\*\*/.exec(l);
    if (b) out.push(norm(b[1]));
  }
  return out;
}

function placeholderRe(name) {
  const parts = name.split(PLACEHOLDER).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${parts.join('[^/]*')}$`);
}

export function skillcheck(root) {
  const findings = [];
  const add = (file, line, check, msg) => findings.push({ file, line, check, msg });
  // How many things each check examined, so a clean run shows it checked something.
  const seen = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 };
  const files = lintedFiles(root);
  const real = walk(root);
  const realSet = new Set(real);
  const realBase = new Set(real.map((r) => r.split('/').pop()));

  // [e] allowlist: every file name state-template.md lists.
  const tplPath = path.join(root, 'references', 'state-template.md');
  const allow = [];
  if (fs.existsSync(tplPath)) {
    for (const m of fs.readFileSync(tplPath, 'utf8').matchAll(FILE_TOKEN)) allow.push(m[0].split('/').pop());
  }
  const allowRes = allow.map((a) => ({ name: a, re: placeholderRe(a) }));
  // Returns null when the name is known (or not a file name), else the name to report.
  const fileUnknown = (token, dir) => {
    // Inside a placeholder such as <pattern.json|classfile> or <transcript.jsonl>: not a file name.
    const opens = (token.match(/</g) || []).length;
    const closes = (token.match(/>/g) || []).length;
    if (opens > closes) return null;
    // Claude Code's own files (a project's .claude/settings.json, the user's ~/...): not skill files.
    if (/^(?:~\/|\.claude\/)/.test(token)) return null;
    const t = token.slice(closes > opens ? token.lastIndexOf('>') + 1 : 0).replace(/^~\//, '').replace(/^\//, '');
    const base = t.split('/').pop();
    if (!base.replace(PLACEHOLDER, '').replace(/\.(md|jsonl|json|txt)$/, '').replace(/[-_.]/g, '')) return null; // a pure placeholder
    if (realSet.has(t) || realSet.has(path.posix.normalize(path.posix.join(dir, t))) || realBase.has(base)) return null;
    const mine = placeholderRe(base);
    return allowRes.some((a) => a.re.test(base) || mine.test(a.name)) ? null : (closes > opens ? '...' : '') + t;
  };

  for (const file of files) {
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) {
      add(file, 0, 'file', `${file} not found`);
      continue;
    }
    const text = fs.readFileSync(abs, 'utf8');
    const { lines, info } = parse(text);
    const dir = path.posix.dirname(file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ln = i + 1;
      if (info[i].fence) continue;
      const fenced = info[i].fenced;
      const codeParts = fenced ? [{ text: line, index: 0 }] : spans(line);

      // [a] ltz <word>
      for (const m of line.matchAll(/\bltz(?:\.mjs)?[ \t]+([A-Za-z][\w-]*)/g)) {
        seen.a++;
        if (!COMMANDS.includes(m[1])) add(file, ln, 'a', `"${m[0].trim()}": "${m[1]}" is not an ltz command (${COMMANDS.join(', ')})`);
      }

      // [b] status and state tokens in code
      for (const c of codeParts) {
        for (const m of c.text.matchAll(/(?<![\w.\/-])((?:closed|stopped|dropped|final)-[a-z*][a-z*-]*)(?![\w\/-])(?!\.[A-Za-z])/g)) {
          seen.b++;
          const tok = m[1].replace(/-+$/, '');
          const ok = tok.includes('*') ? KNOWN_TOKENS.some((k) => k.startsWith(tok.split('*')[0])) : KNOWN_TOKENS.includes(tok);
          if (!ok) add(file, ln, 'b', `"${tok}" is not a unit status or queue state the code defines`);
        }
      }

      // [c] verdicts, repeatReason, foundBy
      const values = (s) => {
        // Placeholders such as <value> or ... are not values.
        const v = s.split(/[|,/\s]+/).filter((x) => x && !x.includes('<') && !/^\.+$/.test(x));
        seen.c += v.length;
        return v;
      };
      for (const m of line.matchAll(/"verdict"\s*:\s*"([^"]*)"/g)) {
        for (const v of values(m[1])) if (!VERDICTS.includes(v)) add(file, ln, 'c', `verdict "${v}" is not one of ${VERDICTS.join(', ')}`);
      }
      for (const m of line.matchAll(/\bverdicts?\s*(?:is\s+|of\s+|:\s*|=\s*|\(\s*)?`([a-z][a-z|-]*)`/gi)) {
        for (const v of values(m[1])) if (!VERDICTS.includes(v)) add(file, ln, 'c', `verdict "${v}" is not one of ${VERDICTS.join(', ')}`);
      }
      for (const c of codeParts) {
        if (/^(?:pending[_ ]owner|pendingOwner|PendingOwner|pending-owners|Pending-Owner)$/.test(c.text.trim())) {
          add(file, ln, 'c', `"${c.text}" is spelled inconsistently; the verdict is "pending-owner"`);
        }
      }
      for (const [key, allowed] of [['repeatReason', REPEAT_REASONS], ['foundBy', FOUND_BY]]) {
        const re = new RegExp(`\`?"?${key}"?\`?\\s*[:=]?\\s*["\`]([a-z][a-z|-]*)["\`]`, 'g');
        for (const m of line.matchAll(re)) {
          for (const v of values(m[1])) if (!allowed.includes(v)) add(file, ln, 'c', `${key} "${v}" is not accepted by the code (${allowed.join(', ')})`);
        }
      }

      // [d] config keys
      for (const m of line.matchAll(/\bconfig\.([A-Za-z_]\w*)\b/g)) {
        if (m[1] !== 'json') seen.d++;
        if (m[1] !== 'json' && !KNOWN_KEYS.has(m[1])) add(file, ln, 'd', `config key "${m[1]}" is not read by the code`);
      }
      if (!fenced && /config/i.test(line)) {
        for (const s of spans(line)) {
          if (!/^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/.test(s.text)) continue;
          // Next to "config": "config `x`", "config.json's `x`", "config key `x`", or "`x` in config.json".
          const before = line.slice(0, s.index);
          const after = line.slice(s.index + s.text.length + 2);
          const next =
            /config(?:\.json)?`?(?:'s)?\s*(?:(?:keys?|settings?|fields?|options?)\s*)?[:(]?\s*$/i.test(before) ||
            /^\s*[(,]?\s*(?:in|from|of)\s+`?(?:S\/)?config/i.test(after);
          if (!next) continue;
          seen.d++;
          if (!KNOWN_KEYS.has(s.text)) add(file, ln, 'd', `config key "${s.text}" is not read by the code`);
        }
      }
      if (fenced) {
        const st = info[i].start;
        const before = lines.slice(Math.max(0, st - 3), st + 1).join('\n');
        if (/config\.json/.test(before)) {
          for (const m of line.matchAll(/"([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)"\s*:/g)) {
            seen.d++;
            if (!KNOWN_KEYS.has(m[1])) add(file, ln, 'd', `config key "${m[1]}" (in a config.json example) is not read by the code`);
          }
        }
      }

      // [e] file names in backticks
      if (!fenced) {
        for (const s of spans(line)) {
          for (const m of s.text.matchAll(FILE_TOKEN)) {
            seen.e++;
            const bad = fileUnknown(m[0], dir);
            if (bad) add(file, ln, 'e', `file name "${bad}" is neither in references/state-template.md nor a skill file`);
          }
        }
      }
    }

    // [f] pointers (over the whole text: a quoted section may wrap onto the next line)
    const re = /((?:\.\.\/)*(?:references|tests|scripts|hooks)\/[\w.\/-]*?\.md)`?(?:(?:\s*\(\s*|\s*,\s*)["“]([^"”]{1,160})["”])?/g;
    for (const m of text.matchAll(re)) {
      const ln = text.slice(0, m.index).split(/\r?\n/).length;
      seen.f++;
      const target = [m[1], path.posix.join(dir, m[1])].map((p) => path.posix.normalize(p)).find((p) => fs.existsSync(path.join(root, p)));
      if (!target) {
        add(file, ln, 'f', `${m[1]} does not exist`);
        continue;
      }
      if (m[2]) {
        const want = norm(m[2]);
        const hs = headings(fs.readFileSync(path.join(root, target), 'utf8'));
        if (!hs.some((h) => h === want || h.startsWith(want) || h.includes(want))) add(file, ln, 'f', `${m[1]} has no heading "${m[2].replace(/\s+/g, ' ')}"`);
      }
    }
  }
  findings.sort((a, b) => (a.file === b.file ? a.line - b.line : files.indexOf(a.file) - files.indexOf(b.file)));
  return { findings, files, seen };
}

function main(argv) {
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root' && argv[i + 1]) root = path.resolve(argv[++i]);
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('node <skill>/scripts/skillcheck.mjs [--root <skill folder>]\n  Lint the skill\'s markdown against the tool kit (checks a-f, see the file header).');
      return 0;
    } else {
      console.error(`ERROR: unknown argument ${argv[i]}`);
      return 1;
    }
  }
  if (!fs.existsSync(root)) {
    console.error(`ERROR: skill folder not found: ${root}`);
    return 1;
  }
  const { findings, files, seen } = skillcheck(root);
  for (const f of findings) console.log(`${f.file}:${f.line}: [${f.check}] ${f.msg}`);
  const by = {};
  for (const f of findings) by[f.check] = (by[f.check] || 0) + 1;
  const desc = Object.keys(by).sort().map((k) => `${k} ${by[k]}`).join(', ');
  const exam = `examined: ltz mentions ${seen.a}, status/state tokens ${seen.b}, verdict/reason values ${seen.c}, config keys ${seen.d}, file names ${seen.e}, pointers ${seen.f}`;
  console.log(`skillcheck: ${files.length} files, ${findings.length} finding(s)${desc ? ` (${desc})` : ''}; ${exam} -> ${findings.length ? 'FAIL' : 'PASS'}`);
  return findings.length ? 1 : 0;
}

const self = fileURLToPath(import.meta.url);
const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (process.platform === 'win32' ? entry.toLowerCase() === self.toLowerCase() : entry === self) {
  process.exitCode = main(process.argv.slice(2));
}
