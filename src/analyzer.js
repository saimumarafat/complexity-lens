'use strict';
/*
 * Complexity Lens – static, heuristic complexity analyzer for DSA-style code.
 * Pure JavaScript, zero dependencies, no access to the VS Code API (so it is unit-testable in Node).
 *
 * It works on a comment/string-stripped copy of the source and estimates, per function:
 *   - time complexity  (loop nesting, loop bounds, library-call costs, recursion recurrences)
 *   - space complexity (allocations, growing containers, recursion depth, memo tables)
 * Results are ESTIMATES: the goal is to be right for textbook DSA code and to explain *why*.
 */

/* ───────────────────────── complexity algebra ───────────────────────── */

const poly = (n = 0, log = 0) => ({ kind: 'poly', n, log });
const expo = (base = 2, n = 0) => ({ kind: 'exp', base, n, log: 0 });
const fact = (n = 0) => ({ kind: 'fact', n, log: 0 });
const ONE = poly(0, 0);
const LOGN = poly(0, 1);
const LIN = poly(1, 0);
const NLOGN = poly(1, 1);
const SQRT = poly(0.5, 0);
const EPS = 1e-9;

const rank = (c) => (c.kind === 'fact' ? 3 : c.kind === 'exp' ? 2 : 1);

function cmp(a, b) {
  const d = rank(a) - rank(b);
  if (d) return d;
  if (a.kind === 'exp' && a.base !== b.base) return a.base - b.base;
  if (Math.abs((a.n || 0) - (b.n || 0)) > EPS) return (a.n || 0) - (b.n || 0);
  return (a.log || 0) - (b.log || 0);
}
const maxC = (a, b) => (cmp(a, b) >= 0 ? a : b);
const isConst = (c) => c.kind === 'poly' && !c.n && !c.log;

function mul(a, b) {
  if (rank(a) === 1 && rank(b) === 1) return poly(a.n + b.n, (a.log || 0) + (b.log || 0));
  const hi = cmp(a, b) >= 0 ? a : b;
  const lo = hi === a ? b : a;
  const out = { kind: hi.kind, base: hi.base, n: hi.n || 0, log: 0 };
  if (rank(lo) === 1) out.n += lo.n;
  return out;
}

const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (k) => String(k).split('').map((d) => SUP[d] || d).join('');

function fmtTerm(c) {
  if (c.label) return c.label;
  if (c.kind === 'poly') {
    const p = [];
    if (c.n) p.push(c.n === 0.5 ? '√n' : c.n === 1 ? 'n' : Number.isInteger(c.n) ? 'n' + sup(c.n) : 'n^' + +c.n.toFixed(2));
    if (c.log) p.push(c.log === 1 ? 'log n' : 'log' + sup(c.log) + ' n');
    return p.length ? p.join(' ') : '1';
  }
  const pre = c.n ? (c.n === 1 ? 'n·' : 'n' + sup(c.n) + '·') : '';
  return c.kind === 'exp' ? pre + c.base + 'ⁿ' : pre + 'n!';
}
const fmt = (c) => 'O(' + fmtTerm(c) + ')';
const ser = (c) => ({ kind: c.kind, n: c.n || 0, log: c.log || 0, base: c.base || 0, str: fmtTerm(c), big: fmt(c) });

/* ───────────────────────── text helpers ───────────────────────── */

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const indentOf = (l) => l.match(/^\s*/)[0].length;
const count = (s, ch) => { let n = 0; for (let i = 0; i < s.length; i++) if (s[i] === ch) n++; return n; };

function normLang(id) {
  if (id === 'python') return 'python';
  if (/^(javascript|typescript|javascriptreact|typescriptreact|js|ts)$/.test(id)) return 'js';
  if (id === 'java' || id === 'csharp') return 'java';
  return 'cpp';
}

/** Blank out comments and string contents, preserving line structure. */
function clean(text, lang) {
  const py = lang === 'python';
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    const two = text.substr(i, 2);
    const three = text.substr(i, 3);
    if (py ? ch === '#' : two === '//') {
      while (i < n && text[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (!py && two === '/*') {
      out += '  '; i += 2;
      while (i < n && text.substr(i, 2) !== '*/') { out += text[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2;
      continue;
    }
    if (py && (three === '"""' || three === "'''")) {
      out += '   '; i += 3;
      while (i < n && text.substr(i, 3) !== three) { out += text[i] === '\n' ? '\n' : ' '; i++; }
      out += '   '; i += 3;
      continue;
    }
    if (ch === '"' || ch === "'" || (ch === '`' && !py)) {
      out += ch; i++;
      while (i < n && text[i] !== ch) {
        if (text[i] === '\n' && ch !== '`') break;
        if (text[i] === '\\') { out += '  '; i += 2; continue; }
        out += text[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < n && text[i] === ch) { out += ch; i++; }
      continue;
    }
    out += ch; i++;
  }
  return out;
}

function matchParen(s, open) {
  let d = 0;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') d++;
    else if (ch === ')' || ch === ']' || ch === '}') { d--; if (d === 0) return i; }
  }
  return -1;
}

function splitArgs(s) {
  const out = [];
  let d = 0;
  let cur = '';
  for (const ch of s) {
    if ('([{'.includes(ch)) d++;
    else if (')]}'.includes(ch)) d--;
    if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim() || out.length) out.push(cur.trim());
  return out;
}

function parseParams(header) {
  const open = header.indexOf('(');
  if (open < 0) return [];
  const close = matchParen(header, open);
  const inner = header.slice(open + 1, close < 0 ? undefined : close);
  return splitArgs(inner)
    .map((p) => {
      p = p.replace(/=.*$/s, '').replace(/:\s*[^,]*$/s, '').trim();
      const ids = p.match(/[A-Za-z_$][\w$]*/g);
      return ids ? ids[ids.length - 1] : null;
    })
    .filter((x) => x && !['self', 'cls', 'this'].includes(x));
}

/* ───────────────────────── function extraction ───────────────────────── */

const C_KW = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'else', 'sizeof', 'new', 'delete', 'throw', 'case', 'goto',
  'yield', 'await', 'typeof', 'do', 'try', 'using', 'typedef', 'elif', 'with', 'assert', 'synchronized', 'lock', 'foreach', 'when',
  'fixed', 'unsafe', 'checked', 'nameof', 'this', 'super', 'function', 'defined', 'static_assert']);
const BAD_TYPE = new Set(['return', 'else', 'new', 'throw', 'delete', 'case', 'goto', 'using', 'typedef', 'await', 'yield', 'typeof', 'do', 'in', 'of']);

function matchBraceHeader(l) {
  let m;
  if ((m = /\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/.exec(l))) return { name: m[1], at: m.index + m[0].length - 1 };
  if ((m = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b[^(]*\(|\()/.exec(l))) {
    return { name: m[1], at: m.index + m[0].length - 1 };
  }
  if ((m = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>/.exec(l))) {
    return { name: m[1], at: -1 };
  }
  // class method without return type (JS/TS/Java ctor)
  if ((m = /^\s*(?:(?:public|private|protected|static|async|readonly|override|abstract|get|set|export|default)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>()]*>)?\s*\(/.exec(l)) &&
      !C_KW.has(m[1]) && /\{\s*$/.test(l)) {
    return { name: m[1], at: m.index + m[0].length - 1 };
  }
  // typed (Java / C / C++ / C#)
  if ((m = /^\s*((?:[\w:<>,.\[\]*&?~]+\s+)+)[*&]*\s*([A-Za-z_~][\w:~]*)\s*\(/.exec(l))) {
    const toks = m[1].trim().split(/\s+/);
    const name = m[2].split('::').pop();
    if (!C_KW.has(name) && !BAD_TYPE.has(toks[0]) && !/=/.test(m[1]) && !/^(?:else|return)\b/.test(l.trim())) {
      return { name, at: m.index + m[0].length - 1 };
    }
  }
  return null;
}

function extractFunctions(lines, lang) {
  const fns = [];
  if (lang === 'python') {
    for (let i = 0; i < lines.length; i++) {
      const m = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\(/.exec(lines[i]);
      if (!m) continue;
      const indent = m[1].length;
      let j = i;
      let bal = 0;
      let seen = false;
      let header = '';
      for (; j < lines.length; j++) {
        header += lines[j] + '\n';
        for (const ch of lines[j]) { if (ch === '(') { bal++; seen = true; } else if (ch === ')') bal--; }
        if (seen && bal <= 0) break;
      }
      let end = j;
      for (let k = j + 1; k < lines.length; k++) {
        if (!lines[k].trim()) continue;
        if (indentOf(lines[k]) <= indent) break;
        end = k;
      }
      const decos = [];
      for (let k = i - 1; k >= 0 && /^\s*@/.test(lines[k]); k--) decos.push(lines[k]);
      // inline body:  def f(x): return x
      const after = lines[j].slice(lines[j].lastIndexOf(')') + 1);
      const inline = /:\s*\S/.test(after);
      fns.push({
        name: m[2], start: i, end: inline ? j : end, bodyStart: inline ? j : j + 1, bodyEnd: inline ? j : end,
        params: parseParams(header.slice(header.indexOf('('))), decorators: decos.join(' '), inlineBody: inline,
      });
      void indent;
    }
    return fns;
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || /^\s*(?:#|import|using|package)\b/.test(l)) continue;
    const h = matchBraceHeader(l);
    if (!h) continue;
    const chunk = lines.slice(i, i + 8).join('\n');
    const lineStart = 0;
    let open = h.at >= 0 ? lineStart + h.at : -1;
    let arrow = h.at < 0;
    let close = -1;
    let j;
    if (open >= 0) {
      close = matchParen(chunk, open);
      if (close < 0) continue;
      j = close + 1;
    } else {
      j = chunk.indexOf('=>') + 2;
    }
    let bracePos = -1;
    let exprBody = false;
    for (; j < chunk.length; j++) {
      if (chunk.startsWith('=>', j)) { arrow = true; j++; continue; }
      const ch = chunk[j];
      if (ch === '{') { bracePos = j; break; }
      if (ch === ';') break;
      if (arrow && !/\s/.test(ch) && ch !== '=' && ch !== '>' && ch !== '{') { exprBody = true; break; }
    }
    if (bracePos < 0 && !exprBody) continue;
    const header = chunk.slice(Math.max(0, open >= 0 ? open : 0), (close >= 0 ? close : chunk.indexOf('=>')) + 1);
    const params = open >= 0 ? parseParams(header) : [l.slice(l.indexOf('=') + 1, l.indexOf('=>')).trim()].filter(Boolean);
    if (exprBody) {
      fns.push({ name: h.name, start: i, end: i, bodyStart: i, bodyEnd: i, params, decorators: '', exprBody: true });
      continue;
    }
    const braceLine = i + count(chunk.slice(0, bracePos), '\n');
    let depth = 0;
    let end = -1;
    const colStart = bracePos - chunk.slice(0, bracePos).lastIndexOf('\n') - 1;
    for (let k = braceLine; k < lines.length; k++) {
      const seg = k === braceLine ? lines[k].slice(colStart) : lines[k];
      for (const ch of seg) { if (ch === '{') depth++; else if (ch === '}') depth--; }
      if (depth <= 0) { end = k; break; }
    }
    if (end < 0) end = lines.length - 1;
    fns.push({ name: h.name, start: i, end, bodyStart: braceLine + 1, bodyEnd: end - 1, params, decorators: '', braceLine });
    if (end === braceLine) { fns[fns.length - 1].bodyStart = braceLine; fns[fns.length - 1].bodyEnd = braceLine; fns[fns.length - 1].oneLiner = true; }
  }
  return fns;
}

/* ───────────────────────── pattern tables ───────────────────────── */

const HASHY = /^(?:set|map|dict|seen|visited|memo|cache|hash|table|lookup|counter|freq|counts?|index|pos|positions|vis|used|mp|hm|hs|dist|parent|prev|remaining|need|have|window|lookup)\w*$/i;
const QUEUEY = /\b(?:queue|que|q|stack|stk|st|deque|dq|heap|pq|frontier|todo|worklist|bfs|dfs|openset|open_set)\w*\b|\.empty\s*\(|\.isEmpty\s*\(/i;
const DIRS = /^(?:self\.)?(?:dirs?|directions?|deltas?|moves?|offsets?|DIRS|DIRECTIONS|dd|dxy|neighbou?r_?(?:offsets|deltas))$/i;
const ADJ = /(?:graph|adj\w*|edges?|neighbou?rs?|children|connections)\w*\s*(?:\[[^\]]*\]|\.get\s*\(|\.neighbou?rs?\b)|\.neighbou?rs?\b|\.children\b|\.adj\b/i;
const MEMO_RE = /@lru_cache|@cache\b|\bmemo\w*\b|\bcache\b|\bdp\b|\bvisited\b|\bseen\b|\bvis\b|\bcomputed\b|\bmemoize\b/;
const LINEAR_METHODS = new Set(['indexOf', 'lastIndexOf', 'includes', 'contains', 'containsAll', 'count', 'index', 'find', 'findIndex', 'remove',
  'reverse', 'join', 'concat', 'slice', 'splice', 'copy', 'clone', 'extend', 'toArray', 'split', 'substring', 'substr', 'replace',
  'replaceAll', 'toUpperCase', 'toLowerCase', 'toCharArray', 'stream', 'copyOf']);
const MEMBERSHIP = new Set(['indexOf', 'lastIndexOf', 'includes', 'contains', 'containsAll', 'count', 'index', 'find', 'findIndex', 'remove']);
const CB_METHODS = /\.(?:forEach|map|filter|reduce|reduceRight|some|every|flatMap|find|findIndex|findLast)\s*\(/;

/* ───────────────────────── declarations (hash / tree / growable containers) ───────────────────────── */

function scanDecls(body, lang, params) {
  const hash = new Set();
  const tree = new Set();
  const grow = new Set();
  const deque = new Set();
  const heap = new Set();
  const isEmptyPy = (r) => /^(?:\[\s*\]|\{\s*\}|set\s*\(\s*\)|list\s*\(\s*\)|dict\s*\(\s*\)|deque\s*\(|collections\.deque\s*\(|defaultdict\s*\(|collections\.defaultdict\s*\(|Counter\s*\(\s*\)|OrderedDict\s*\(\s*\)|''|"")\s*$/.test(r) ||
    (/^\[[^\]\n]*\]\s*$/.test(r) && !/\bfor\b/.test(r)) || /^deque\s*\(\s*\[/.test(r);
  const isHashPy = (r) => /^(?:\{\s*\}|set\s*\(|dict\s*\(|defaultdict\s*\(|collections\.defaultdict|Counter\s*\(|collections\.Counter|OrderedDict|\{[^}]*[:,][^}]*\}|\{[^}]*\bfor\b)/.test(r);
  for (const l of body) {
    if (lang === 'python') {
      const m = /^\s*([\w,\s]+?)\s*(?::[^=\n]+)?=\s*(?!=)(.+)$/.exec(l);
      if (!m) continue;
      const names = m[1].split(',').map((s) => s.trim());
      const rhs = m[2].trim();
      const rhss = names.length > 1 ? splitArgs(rhs) : [rhs];
      names.forEach((nm, idx) => {
        const r = rhss[idx] !== undefined ? rhss[idx] : rhs;
        if (!/^\w+$/.test(nm)) return;
        if (isHashPy(r)) hash.add(nm);
        if (isEmptyPy(r)) grow.add(nm);
        if (/^(?:collections\.)?deque\s*\(/.test(r)) deque.add(nm);
      });
    } else {
      let m = /\b(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(.+?);?\s*$/.exec(l);
      if (m && lang === 'js') {
        const r = m[2];
        if (/^(?:\[\s*\]|\{\s*\}|new\s+(?:Set|Map|WeakMap|Array)\s*\(\s*\)|""|''|``)$/.test(r) || (/^\[[^\]]*\]$/.test(r) && !/\.\.\./.test(r) && !/\bfor\b/.test(r))) grow.add(m[1]);
        if (/^(?:\{\s*\}|new\s+(?:Set|Map|WeakMap)\b|Object\.create)/.test(r)) hash.add(m[1]);
      }
      m = /(?:\b[\w<>,\[\]?. ]+\s+)?(\w+)\s*=\s*new\s+((?:\w+\.)*\w+)\s*(?:<[^>;]*>)?\s*\(([^)]*)\)/.exec(l);
      if (m && lang !== 'js') {
        const [, nm, cls, args] = m;
        if (/^(?:ArrayList|LinkedList|HashMap|HashSet|TreeMap|TreeSet|ArrayDeque|PriorityQueue|Stack|Vector|LinkedHashMap|LinkedHashSet|StringBuilder|Queue|Deque|List|Dictionary|HashSet|SortedSet|SortedDictionary)$/.test(cls) && (!args.trim() || /^\d+$/.test(args.trim()))) grow.add(nm);
        if (/Hash|Dictionary/.test(cls)) hash.add(nm);
        if (/Tree|Sorted/.test(cls)) tree.add(nm);
        if (/ArrayDeque|LinkedList|Deque|Queue/.test(cls)) deque.add(nm);
        if (/PriorityQueue/.test(cls)) heap.add(nm);
      }
      m = /\b(vector|deque|queue|stack|priority_queue|set|multiset|map|multimap|unordered_map|unordered_set|string|list)\s*(<[^;=()]*>)?\s+(\w+)\s*(;|\{\s*\}|=\s*\{\s*\})/.exec(l);
      if (m) {
        const [, ty, , nm] = m;
        grow.add(nm);
        if (/^unordered_/.test(ty)) hash.add(nm);
        if (/^(?:map|set|multiset|multimap)$/.test(ty)) tree.add(nm);
        if (/^(?:deque|queue|list)$/.test(ty)) deque.add(nm);
        if (ty === 'priority_queue') heap.add(nm);
      }
      m = /\b(?:StringBuilder|string|String)\s+(\w+)\s*=\s*(?:""|new StringBuilder\(\s*\))/.exec(l);
      if (m) grow.add(m[1]);
    }
  }
  for (const p of params || []) if (HASHY.test(p)) hash.add(p);
  return { hash, tree, grow, deque, heap };
}

/* ───────────────────────── allocation analysis ───────────────────────── */

const nonConst = (s) => !/^\s*\(?\s*-?\d+\s*\)?\s*$/.test(s);

function comprehensionDims(L) {
  if (!/\bfor\b/.test(L) || /^\s*(?:async\s+)?for\b/.test(L)) return 0;
  const parts = L.split(/\bfor\b/).slice(1);
  return parts.filter((p) => !/^\s*[\w,\s()*]+\s+in\s+(?:range\(\s*\d+\s*\)|\[[^\]]*\]|\([^)]*\)|["'])/.test(p)).length;
}

/** Size (as complexity) of an object allocated on this line: fixed-size arrays, copies, comprehensions. */
function allocOf(L, lang) {
  let k = 0;
  let note = '';
  const set = (n, t) => { if (n > k) { k = n; note = t; } };
  if (lang === 'python') {
    const bracketComp = /[\[{].*\bfor\b.*[\]}]/.test(L) && !/^\s*(?:async\s+)?for\b/.test(L);
    const kc = bracketComp ? comprehensionDims(L) : 0;
    let mulDim = 0;
    const mm = /\]\s*\*\s*([^\n]*)/.exec(L);
    if (mm && !/^\s*\(?\s*\d+\b/.test(mm[1])) mulDim = 1;
    const mm2 = /(?<![\w\])])\s*([A-Za-z_]\w*|\([^)]*\))\s*\*\s*\[/.exec(L);
    if (mm2 && nonConst(mm2[1])) mulDim = 1;
    if (kc + mulDim) set(kc + mulDim, 'allocates a list/table sized by the input');
    if (/\blist\s*\(\s*range\s*\(\s*(?!\d+\s*\))/.test(L)) set(1, 'list(range(n))');
    if (/(?<![\w.])(?:sorted|list|set|tuple|frozenset|dict|Counter|deepcopy|reversed)\s*\(\s*[^\s)]/.test(L) && !/(?:list|set|tuple)\s*\(\s*range\(\s*\d/.test(L)) set(1, 'builds a copy of its argument');
    if (/\.copy\s*\(|\[\s*:\s*\]/.test(L)) set(1, 'copies a list');
    if (/[\w\])]\s*\[[^\[\]\n?]*:[^\[\]\n]*\]/.test(L) && !/^\s*(?:def|class)\b/.test(L) && !/\blambda\b/.test(L)) set(1, 'slicing copies a sub-list');
    if (/\.join\s*\(|\.split\s*\(/.test(L)) set(1, 'creates a new string/list');
  } else {
    if (lang === 'js') {
      const dims = (L.match(/(?:new\s+)?Array\s*\(\s*(?!\d+\s*\))[^)]*\)|Array\.from\s*\(\s*\{\s*length\s*:\s*(?!\d)/g) || []).length;
      if (dims) set(dims, 'allocates an array sized by the input');
      if (/\.(?:slice|concat|map|filter|flatMap|split|toSorted|toReversed|flat)\s*\(|\[\s*\.\.\.|Object\.(?:keys|values|entries)\s*\(/.test(L)) set(1, 'creates a new array/copy');
    } else {
      const ndims = (L.match(/\bnew\s+[\w.<>]+\s*((?:\[[^\]]*\])+)/g) || [])
        .map((s) => (s.match(/\[([^\]]*)\]/g) || []).filter((b) => b.length > 2 && nonConst(b.slice(1, -1))).length);
      if (ndims.length) set(Math.max(...ndims), 'allocates an array sized by the input');
      if (/\.(?:toCharArray|clone|toArray|substring|split)\s*\(|Arrays\.copyOf(?:Range)?\s*\(|new\s+(?:ArrayList|HashSet|HashMap|LinkedList|ArrayDeque|TreeSet|TreeMap|PriorityQueue|String|StringBuilder)\s*(?:<[^>]*>)?\s*\(\s*[A-Za-z_]/.test(L)) set(1, 'copies a collection');
    }
    if (lang === 'cpp' || lang === 'java') {
      const mm = /^\s*(?:(?:const|static|unsigned|long|short)\s+)*([\w:<>]+)\s+\w+\s*((?:\[[^\]]+\])+)\s*(?:;|=|,)/.exec(L);
      if (mm && !BAD_TYPE.has(mm[1])) {
        const dims = (mm[2].match(/\[([^\]]*)\]/g) || []).filter((b) => nonConst(b.slice(1, -1))).length;
        if (dims) set(dims, 'declares an array sized by the input');
      }
      let vd = 0;
      const re = /\bvector\s*<[^()]*>\s*(?:\w+\s*)?\(\s*([^,)]+)/g;
      let m;
      while ((m = re.exec(L))) if (nonConst(m[1]) && !/^\s*vector/.test(m[1])) vd++;
      if (vd) set(vd, 'allocates a vector sized by the input');
    }
  }
  return { k, note };
}

/* ───────────────────────── per-line operation cost ───────────────────────── */

/** A name is hash-like if it was declared as a set/dict, or (when undeclared) is named like one. */
function isHashy(decl, nm) {
  if (decl.hash.has(nm)) return true;
  if (decl.grow.has(nm)) return false;          // declared as a plain list/array/string
  return HASHY.test(nm);
}

function opCost(L, o) {
  const { lang, decl, calleeOf, skipCb } = o;
  const py = lang === 'python';
  let best = ONE;
  let note = '';
  let tip = '';
  const up = (c, n, t) => { if (cmp(c, best) > 0) { best = c; note = n; tip = t || ''; } };

  if (/\b(?:sorted|nlargest|nsmallest)\s*\(|\.sort\s*\(|\.toSorted\s*\(|\bArrays\.sort\s*\(|\bCollections\.sort\s*\(|\bstd::sort\s*\(|\bstable_sort\s*\(|(?<![\w.])sort\s*\(/.test(L)) {
    up(NLOGN, 'sorting', 'Sorting inside a loop multiplies its O(n log n) cost – sort once outside if you can.');
  }
  if (/\b(?:heappush|heappop|heapreplace|heappushpop)\s*\(/.test(L)) up(LOGN, 'heap push/pop');
  if (/\bheapify\s*\(/.test(L)) up(LIN, 'heapify');
  if (/\b(?:bisect(?:_left|_right)?|binary_search|lower_bound|upper_bound|binarySearch)\s*\(/.test(L)) up(LOGN, 'binary search');
  if (/\bstd::(?:find|count|reverse|accumulate|min_element|max_element|unique|rotate|next_permutation|copy|iota|fill)\s*\(/.test(L)) up(LIN, 'STL algorithm scans its range');

  let m;
  const recvRe = /([A-Za-z_$][\w$]*)(?:\[[^\]]*\])*\s*(?:\.|->)\s*(\w+)\s*\(/g;
  while ((m = recvRe.exec(L))) {
    const recv = m[1];
    const meth = m[2];
    if (decl.heap.has(recv) && /^(push|pop|poll|offer|add|remove|insert|emplace|extract\w*)$/.test(meth)) up(LOGN, `${recv}.${meth}() on a heap`);
    else if (decl.tree.has(recv) && /^(put|get|add|remove|contains|containsKey|insert|find|count|erase|lower_bound|upper_bound|floor|ceiling|pollFirst|pollLast)$/.test(meth)) up(LOGN, `${recv}.${meth}() on an ordered tree`);
    else if (LINEAR_METHODS.has(meth)) {
      const hashy = isHashy(decl, recv);
      if (MEMBERSHIP.has(meth) && hashy) continue;
      if (MEMBERSHIP.has(meth) && decl.tree.has(recv)) continue;
      up(LIN, `${recv}.${meth}() scans/copies the whole collection`,
        MEMBERSHIP.has(meth) ? `Use a hash set/map for ${recv} to make \`${meth}\` O(1).` : '');
    }
  }
  const fm = /(\w+)\s*\.\s*(?:pop\s*\(\s*0\s*\)|insert\s*\(\s*0\s*,|shift\s*\(\s*\)|unshift\s*\(|remove\s*\(\s*0\s*\)|add\s*\(\s*0\s*,)/.exec(L);
  if (fm && !decl.deque.has(fm[1])) up(LIN, 'front insert/remove shifts every element', 'Use a deque (collections.deque / ArrayDeque) for O(1) operations at the front.');

  const re3 = /(?<![\w.])(sum|max|min|any|all)\s*\(/g;
  while ((m = re3.exec(L))) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(L, open);
    const args = splitArgs(L.slice(open + 1, close < 0 ? undefined : close));
    if (args.length === 1 && args[0] && !/^-?[\d.]+$/.test(args[0])) up(LIN, `${m[1]}() scans its argument`);
  }
  if (/Math\.(?:max|min)\s*\(\s*\.\.\./.test(L)) up(LIN, 'Math.max/min over a spread array');
  if (/(?<![\w.])(?:list|set|tuple|frozenset|dict|Counter|deepcopy|reversed)\s*\(\s*[^\s)]/.test(L) && py) up(LIN, 'copies/iterates its argument');
  if (/\.fill\s*\(|\bmemset\s*\(|\bArrays\.fill\s*\(|\bstd::fill\s*\(/.test(L)) up(LIN, 'fills a whole array');

  if (py) {
    const t = L.replace(/\bfor\s+[\w,\s()*]+?\s+in\s+/g, ' FOR ');
    const re2 = /\b(?:not\s+)?in\s+([A-Za-z_]\w*)\b(?![\w.(])/g;
    while ((m = re2.exec(t))) {
      const nm = m[1];
      if (isHashy(decl, nm)) continue;
      up(LIN, `\`in ${nm}\` scans the whole sequence`, `If \`${nm}\` is a list, convert it to a set for O(1) membership tests.`);
    }
    const cd = comprehensionDims(L);
    if (cd) up(poly(cd), cd > 1 ? `comprehension with ${cd} nested loops` : 'comprehension/generator iterates the whole input');
  }
  if (!skipCb && CB_METHODS.test(L)) up(LIN, 'callback method (map/filter/forEach…) visits every element');
  if (/\.stream\s*\(\s*\)/.test(L)) up(LIN, 'stream pipeline visits every element');

  const a = allocOf(L, lang);
  if (a.k) up(poly(a.k), a.note);

  const cc = calleeOf(L);
  if (cc && cmp(cc.cost, best) >= 0 && !isConst(cc.cost)) up(cc.cost, `calls ${cc.name}() which is ${fmt(cc.cost)}`);

  return { cost: best, note, tip, alloc: a };
}

/* ───────────────────────── loop analysis ───────────────────────── */

function iterInfo(it, ancestors) {
  const r = /^range\s*\((.*)\)$/.exec(it);
  if (r) {
    const args = splitArgs(r[1]);
    if (args.length && args.every((a) => /^-?\d+$/.test(a))) {
      const v = args.length === 1 ? +args[0] : Math.abs(+args[1] - +args[0]) / (args[2] ? Math.abs(+args[2]) || 1 : 1);
      return { f: ONE, mult: Math.max(1, Math.round(v)), note: 'fixed-size loop' };
    }
    if (/sqrt|isqrt|\*\*\s*0?\.5/.test(it)) return { f: SQRT, note: 'loop runs up to √n' };
    if (args.length === 3 && ancestors.some((v) => v && v === args[2])) return { f: LOGN, note: 'harmonic-series loop (sieve pattern) → n/i steps summed over i ≈ n log n' };
    return { f: LIN };
  }
  if (/^[\[(]/.test(it) && !/\bfor\b/.test(it) && !/^\(\s*\w+\s*\)$/.test(it)) {
    const items = splitArgs(it.slice(1, -1)).length || 1;
    return { f: ONE, mult: items, note: 'iterates a literal list' };
  }
  if (/^["'`]/.test(it)) return { f: ONE, mult: 2, note: 'iterates a short literal' };
  if (DIRS.test(it)) return { f: ONE, mult: 4, note: 'iterates a small fixed set of directions' };
  return { f: LIN };
}

function cForInfo(head, ancestors) {
  const parts = head.split(';');
  if (parts.length >= 3) {
    const init = parts[0].trim();
    const cond = parts[1].trim();
    const step = parts[2].trim();
    const varName = (/(\w+)\s*=/.exec(init) || [])[1];
    if (/\*=|<<=|\/=|>>=|=\s*\w+\s*[*\/]\s*[\w(]|=\s*\w+\s*(?:<<|>>)/.test(step)) return { f: LOGN, note: 'index doubles/halves each step', varName };
    if (/(\w+)\s*\*\s*\1\b/.test(cond) || /sqrt/.test(cond)) return { f: SQRT, note: 'loop runs up to √n', varName };
    const st = /(\w+)\s*\+=\s*(\w+)/.exec(step);
    if (st && ancestors.includes(st[2])) return { f: LOGN, note: 'harmonic-series loop (sieve pattern)', varName };
    const lit = /(?:<=?|>=?|!=)\s*(-?\d+)\s*$/.exec(cond);
    const initNum = /=\s*(-?\d+)\s*$/.exec(init);
    if (lit && initNum) return { f: ONE, mult: Math.max(1, Math.abs(+lit[1] - +initNum[1])), note: 'fixed-size loop', varName };
    return { f: LIN, varName };
  }
  const m = /^(.*?)(?:\s*:\s*|\s+of\s+|\s+in\s+)(.*)$/s.exec(head);
  if (m) {
    const info = iterInfo(m[2].trim(), ancestors);
    info.varName = (m[1].match(/[A-Za-z_$][\w$]*/g) || []).pop();
    info.iter = m[2].trim();
    return info;
  }
  return { f: LIN };
}

function whileInfo(cond, bodyText) {
  const t = cond + '\n' + bodyText;
  if (/\b(\w+)\s*(?:\/\/|\/|>>)=\s*\d+/.test(t) || /\b(\w+)\s*=\s*\1\s*(?:\/\/|\/|>>|\*|<<)\s*\d+/.test(t) || /\b(\w+)\s*(?:\*|<<)=\s*\d+/.test(t)) {
    return { f: LOGN, note: 'value is halved/doubled every iteration' };
  }
  if (/\bmid\w*\s*=/.test(t) && /\b(?:lo|low|left|l|start|begin|hi|high|right|r|end|j|i)\w*\s*=\s*mid\w*\b/.test(t)) {
    return { f: LOGN, note: 'binary-search style: search range halves each iteration' };
  }
  if (/(\w+)\s*,\s*(\w+)\s*=\s*\2\s*,\s*\1\s*%\s*\2/.test(t) || /\b(\w+)\s*=\s*(\w+)\s*%\s*\1\b/.test(t) || /%=/.test(t)) {
    return { f: LOGN, note: 'Euclid-style modulus shrinks values geometrically' };
  }
  if (QUEUEY.test(cond)) return { f: LIN, queue: true, note: 'worklist loop: each item is processed a bounded number of times' };
  return { f: LIN };
}

/* ───────────────────────── main per-function analysis ───────────────────────── */

function analyzeFn(fn, env) {
  if (fn._res) return fn._res;
  if (fn._busy) return null;
  fn._busy = true;
  const { lines, raw, lang, fns, offset } = env;
  const py = lang === 'python';
  const nested = fn.pseudo === 'top' ? fns.filter((f) => !f.pseudo) : fns.filter((f) => f !== fn && !f.pseudo && f.start > fn.start && f.end <= fn.end);
  const inNested = (k) => nested.some((f) => k >= f.start && k <= f.end);
  const idxs = [];
  for (let k = fn.bodyStart; k <= fn.bodyEnd; k++) if (k >= 0 && k < lines.length && !inNested(k)) idxs.push(k);
  const body = idxs.map((k) => lines[k]);
  const bodyText = body.join('\n');
  const enclosing = fns.filter((f) => f !== fn && !f.pseudo && f.start < fn.start && f.end >= fn.end);
  const outerBody = [];
  for (const f of enclosing) for (let k = f.bodyStart; k <= f.bodyEnd; k++) if (k >= 0 && k < lines.length && (k < fn.start || k > fn.end)) outerBody.push(lines[k]);
  const decl = scanDecls(body, lang, fn.params);
  if (outerBody.length) {
    const od = scanDecls(outerBody, lang, []);
    for (const key of ['hash', 'tree', 'grow', 'deque', 'heap']) for (const v of od[key]) decl[key].add(v);
  }

  /* self-recursion */
  const selfRe = fn.pseudo || fn.name[0] === '<' ? null : new RegExp('(?<![\\w.$])(?:(?:self|this|cls)\\.)?' + esc(fn.name) + '\\s*\\(', 'g');
  const selfLines = new Set();
  if (selfRe) for (const k of idxs) { selfRe.lastIndex = 0; if (selfRe.test(lines[k])) selfLines.add(k); }
  const recursive = selfLines.size > 0;
  const memoText = bodyText + ' ' + (fn.decorators || '');
  const memoLike = recursive && MEMO_RE.test(memoText);
  const adjInBody = ADJ.test(bodyText);
  const amortizeAdj = recursive && (memoLike || adjInBody);

  /* callees defined in this file */
  const calleeRes = [];
  for (const f of fns) {
    if (f.pseudo || f === fn || f.name[0] === '<') continue;
    if (calleeRes.some((c) => c.name === f.name)) continue;
    calleeRes.push({ name: f.name, fn: f, re: new RegExp('(?<![\\w.$])(?:(?:self|this|cls)\\.)?' + esc(f.name) + '\\s*\\('), done: false });
  }
  const calleeOf = (L) => {
    let best = null;
    for (const c of calleeRes) {
      if (!c.re.test(L)) continue;
      const cand = nested.includes(c.fn) ? c.fn : fns.filter((f) => f.name === c.name && nested.includes(f))[0] || c.fn;
      const r = analyzeFn(cand, env);
      if (!r || r._partial) continue;
      if (!best || cmp(r.timeC, best.cost) > 0) best = { name: c.name, cost: r.timeC };
    }
    return best;
  };

  /* ── walk lines with a loop stack ── */
  const stack = [];
  let pending = [];
  let depth = 0;
  const lineRes = [];
  const bodyLoops = [];
  const blockText = (k) => {
    if (py) {
      const ind = indentOf(lines[k]);
      const out = [];
      for (let j = k + 1; j < lines.length; j++) {
        if (!lines[j].trim()) continue;
        if (indentOf(lines[j]) <= ind) break;
        out.push(lines[j]);
      }
      return out.join('\n');
    }
    let d = 0;
    let started = false;
    const out = [];
    for (let j = k; j < Math.min(lines.length, k + 400); j++) {
      for (const ch of lines[j]) { if (ch === '{') { d++; started = true; } else if (ch === '}') d--; }
      if (j > k) out.push(lines[j]);
      if (started && d <= 0) break;
      if (!started && j > k) break;
    }
    return out.join('\n');
  };

  const prod = (arr) => arr.reduce((p, e) => mul(p, e.factor), ONE);
  const varsOf = (arr) => arr.map((e) => e.varName);

  /** Parse one loop header at the start of `str`. Returns null if `str` doesn't start with a loop. */
  function parseHeader(str, k, ctxStack) {
    let kind;
    let head;
    let rest;
    if (py) {
      const m = /^\s*(?:async\s+)?(for|while)\b\s*(.*)$/.exec(str);
      if (!m) return null;
      kind = m[1];
      const tail = m[2];
      let d = 0;
      let ci = -1;
      for (let i = 0; i < tail.length; i++) {
        const ch = tail[i];
        if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) d--; else if (ch === ':' && d === 0) { ci = i; break; }
      }
      head = ci < 0 ? tail : tail.slice(0, ci);
      rest = ci < 0 ? '' : tail.slice(ci + 1).trim();
    } else {
      if (/^\s*\}\s*while\b[^{]*;\s*$/.test(str)) return null;
      const m = /^\s*(?:\}\s*)?(for|while|foreach)\s*(?:await\s*)?\(/.exec(str);
      if (m) {
        const open = m[0].length - 1;
        const close = matchParen(str, open);
        head = str.slice(open + 1, close < 0 ? undefined : close);
        rest = close < 0 ? '' : str.slice(close + 1).trim();
        kind = m[1] === 'foreach' ? 'for' : m[1];
      } else if (/^\s*do\b\s*(?:\{|$)/.test(str)) {
        kind = 'do'; head = ''; rest = str.replace(/^\s*do\b\s*/, '');
      } else if (CB_METHODS.test(str) && /(?:=>\s*\{|function\s*\([^)]*\)\s*\{)\s*$/.test(str.trim())) {
        const e = { factor: LIN, line: k, desc: str.trim().slice(0, 48), kind: 'callback', varName: null, note: 'callback runs once per element' };
        return { entry: e, rest: '{', iter: '' };
      } else return null;
    }
    const anc = varsOf(ctxStack);
    let info;
    let iter = '';
    if (kind === 'for') {
      if (py) {
        const mm = /^(.*?)\s+in\s+(.*)$/s.exec(head);
        iter = mm ? mm[2].trim() : '';
        info = mm ? iterInfo(iter, anc) : { f: LIN };
        info.varName = mm ? (mm[1].match(/[A-Za-z_]\w*/g) || [])[0] : null;
      } else {
        info = cForInfo(head, anc);
        iter = info.iter || '';
      }
      const underQueue = ctxStack.some((e) => e.queue);
      const underNodeLoop = ctxStack.some((e) => e.kind === 'for' && cmp(e.factor, LIN) === 0);
      if (iter && ADJ.test(iter) && (amortizeAdj || underQueue || underNodeLoop)) {
        info = { f: ONE, amort: true, note: 'adjacency loop: every edge is visited once overall → total O(V + E)', varName: info.varName };
      }
    } else {
      info = whileInfo(head, blockText(k));
    }
    const e = {
      factor: info.f, line: k, desc: (py ? str.trim().replace(/:\s*$/, '') : str.trim().replace(/\{\s*$/, '')).slice(0, 56),
      kind, queue: !!info.queue, mult: info.mult || null, varName: info.varName || null, note: info.note || '', amort: !!info.amort,
    };
    return { entry: e, rest, iter };
  }

  for (const k of idxs) {
    const L = lines[k];
    if (!L.trim()) continue;
    const ind = indentOf(L);
    const opens = count(L, '{');
    const closes = count(L, '}');
    if (py) {
      while (stack.length && stack[stack.length - 1].depth >= ind) stack.pop();
    } else {
      const lead = ((/^\s*(\}+)/.exec(L) || [])[1] || '').length;
      const d = depth - lead;
      while (stack.length && stack[stack.length - 1].depth > d) stack.pop();
    }
    const net = depth + opens - closes;

    if (!py && pending.length && /^\s*\{/.test(L)) {
      for (const e of pending) { e.depth = net; stack.push(e); }
      pending = [];
      depth = net;
      continue;
    }

    /* parse chain of headers on this line */
    let text = L;
    const chain = [];
    let rest = text;
    let blockOpen = false;
    let needsBody = false;
    let firstIter = '';
    for (let guard = 0; guard < 6; guard++) {
      const h = parseHeader(rest, k, stack.concat(pending, chain));
      if (!h) break;
      chain.push(h.entry);
      if (!firstIter) firstIter = h.iter;
      rest = h.rest;
      if (!py && /^\{/.test(rest)) { blockOpen = true; rest = rest.slice(1); break; }
      if (!rest) { needsBody = true; break; }
    }
    const extra = pending.slice();

    if (chain.length) {
      const outer = stack.concat(extra);
      const full = outer.concat(chain);
      /* cost of the loop header itself (+ ops in iterable, evaluated once per outer iteration) */
      let headOp = { cost: ONE, note: '', tip: '' };
      if (firstIter) headOp = opCost(firstIter, { lang, decl, calleeOf, skipCb: true });
      const innerRest = rest.replace(/\}\s*;?\s*$/, '').trim();
      let restOp = { cost: ONE, note: '', tip: '', alloc: { k: 0 } };
      if (innerRest && !needsBody) restOp = opCost(innerRest, { lang, decl, calleeOf });
      const cost = maxC(mul(prod(outer), headOp.cost), mul(prod(full), restOp.cost));
      const note = cmp(restOp.cost, headOp.cost) > 0 ? restOp.note : headOp.note;
      const tip = restOp.tip || headOp.tip;
      lineRes.push({ k, cost, chain: full.slice(), note, tip, header: true, op: cmp(restOp.cost, headOp.cost) > 0 ? restOp.cost : headOp.cost, alloc: restOp.alloc, text: innerRest, headOp: headOp.cost, restOp: restOp.cost, outerLen: outer.length });
      for (const e of chain) bodyLoops.push(e);
      const inlineBlock = blockOpen && closes >= opens;      // `for (...) { stmt; }` on one line
      if ((py && !rest) || (!py && (needsBody || (blockOpen && !inlineBlock)))) {
        if (py) { for (const e of chain) { e.depth = ind; stack.push(e); } }
        else if (needsBody && !blockOpen) { pending = pending.concat(chain); }
        else { for (const e of extra.concat(chain)) { e.depth = net; stack.push(e); } pending = []; }
      } else {
        pending = [];
      }
      depth = net;
      continue;
    }

    /* normal statement */
    const full = stack.concat(extra);
    const op = opCost(L, { lang, decl, calleeOf });
    const cost = mul(prod(full), op.cost);
    lineRes.push({ k, cost, chain: full.slice(), note: op.note, tip: op.tip, header: false, op: op.cost, alloc: op.alloc, text: L, stmtOp: op.cost });
    pending = [];
    depth = net;
  }

  /* ── baseline (non-recursive) work ── */
  let W = ONE;
  for (const r of lineRes) W = maxC(W, r.cost);

  /* ── recursion ── */
  const reasons = [];
  const tips = new Set();
  let T = W;
  let depthC = ONE;
  let recurrence = '';
  let recNote = '';
  let spaceLabel = '';
  let treeLike = false;
  let quick = false;
  let pathTree = false;
  let binRec = false;

  if (recursive) {
    const sites = [];
    let grp = 0;
    for (const r of lineRes) {
      const k = r.k;
      const Ltxt = lines[k];
      if (/^\s*(?:\}\s*)?(?:else|elif|case|default)\b/.test(Ltxt)) grp++;
      if (selfLines.has(k)) {
        selfRe.lastIndex = 0;
        let m;
        while ((m = selfRe.exec(Ltxt))) {
          const open = m.index + m[0].length - 1;
          const close = matchParen(Ltxt, open);
          const args = splitArgs(Ltxt.slice(open + 1, close < 0 ? undefined : close));
          let mult = 1;
          let loopRec = false;
          let adjLoop = false;
          for (const e of r.chain) {
            if (e.amort) { adjLoop = true; continue; }
            if (isConst(e.factor)) mult *= e.mult || 2;
            else { loopRec = true; if (e.desc && ADJ.test(e.desc)) adjLoop = true; }
          }
          sites.push({ k, args, grp, mult, loopRec, adjLoop });
        }
      }
      if (/\breturn\b/.test(Ltxt)) grp++;
    }
    const perGroup = new Map();
    for (const s of sites) perGroup.set(s.grp, (perGroup.get(s.grp) || 0) + s.mult);
    let a = Math.max(1, ...perGroup.values());
    const allArgs = sites.map((s) => s.args.join(' , ')).join(' | ');
    const argList = sites.flatMap((s) => s.args);
    const loopRec = sites.some((s) => s.loopRec);
    const adjLoop = sites.some((s) => s.adjLoop);

    const treeArgs = /(?:\.|->)\s*(?:left|right|next|children|child|kids)\b|\bchild\b/.test(allArgs);
    const divideArgs = /\bmid\w*\b|\bpivot\w*\b|\bpi\b|\bp\b|\bq\b|\bsplit\w*\b|\bpart\w*\b|\bhalf\w*\b|\/\/?\s*2\b|>>\s*1\b|\bm\b|\/\s*\d/.test(allArgs) ||
      argList.some((x) => /^(?:left|right|less|greater|smaller|larger|lhs|rhs|lower|upper|first_half|second_half)$/.test(x));
    const backtracking = /\.pop\s*\(\s*\)|pop_back\s*\(|removeLast\s*\(|\bswap\s*\(|(\w+)\[[^\]]+\]\s*,\s*\1\[[^\]]+\]\s*=(?!=)|(?:used|visited|seen|vis)\[[^\]]+\]\s*=\s*(?:False|false|0)\b/.test(bodyText);
    let restoreAssign = false;
    {
      const lhs = new Map();
      const re = /(\b\w+(?:\[[^\]]+\])+)\s*=(?!=)/g;
      let m;
      while ((m = re.exec(bodyText))) lhs.set(m[1], (lhs.get(m[1]) || 0) + 1);
      for (const v of lhs.values()) if (v >= 2) restoreAssign = true;
    }
    const bt = backtracking || restoreAssign;
    let inPlace = false;
    for (const p of fn.params) {
      if (new RegExp('\\b' + esc(p) + '\\s*(?:\\[[^\\]]+\\])+\\s*=(?!=)').test(bodyText)) inPlace = true;
    }
    const memo = (memoLike || inPlace) && !bt;
    const changed = new Set();
    for (const s of sites) s.args.forEach((x, i) => { if (fn.params[i] !== undefined && x !== fn.params[i]) changed.add(i); });

    if (memo) {
      const states = poly(Math.min(3, Math.max(1, changed.size)));
      T = mul(states, W);
      depthC = LIN;
      recurrence = `${changed.size > 1 ? changed.size + ' changing parameters ⇒ ' : ''}each state computed once ⇒ (#states) × (work per state)`;
      recNote = inPlace && !memoLike
        ? 'Recursion marks cells/entries in place, so each state is processed once → states × work per state.'
        : 'Memoization / visited-set detected, so each state is computed only once → (#states) × (work per state).';
      if (changed.size > 1) recNote += ` ${changed.size} independent parameters give ~n${changed.size > 1 ? sup(changed.size) : ''} states (write it as O(n·m) when the dimensions differ).`;
    } else if (treeArgs || (loopRec && adjLoop)) {
      treeLike = true;
      pathTree = a <= 1;
      T = mul(LIN, cmp(W, LIN) > 0 ? W : ONE);
      depthC = LIN;
      spaceLabel = 'h';
      recurrence = 'T(n) = T(left) + T(right) + O(1) ⇒ every node is visited once';
      recNote = 'Tree/graph traversal: each node is visited once, so time is linear. Stack depth equals the tree height h (O(log n) if balanced, O(n) if skewed).';
    } else if (loopRec) {
      const subset = /\b(?:i|idx|index|start|pos|j|k)\s*\+\s*1\b/.test(allArgs);
      T = subset ? mul(expo(2), W) : mul(fact(), W);
      depthC = LIN;
      recurrence = subset ? 'T(n) = Σ T(n−i) ⇒ ≈ 2ⁿ (choose / skip each element)' : 'T(n) = n · T(n−1) ⇒ n!';
      recNote = subset
        ? 'Recursion inside an n-iteration loop that advances the start index enumerates subsets/combinations → exponential.'
        : 'Recursion inside an n-iteration loop on a shrinking problem enumerates permutations → factorial.';
      tips.add('Exponential/factorial recursion: prune the search space or memoize overlapping sub-problems (DP).');
    } else if (divideArgs && !treeArgs) {
      const c = Math.log2(a);
      quick = a >= 2 && /pivot|partition/.test(bodyText);
      binRec = a <= 1 && /\[\s*mid\w*\s*\]\s*(?:==|===)|(?:==|===)\s*\w+\[\s*mid\w*\s*\]/.test(bodyText);
      let t;
      if (rank(W) > 1) t = W;
      else if (W.n < c - 1e-6) t = poly(+c.toFixed(3), 0);
      else if (Math.abs(W.n - c) < 1e-6) t = poly(W.n, W.log + 1);
      else t = W;
      T = t;
      depthC = LOGN;
      recurrence = `T(n) = ${a > 1 ? a : ''}T(n/2) + ${fmt(W)}`;
      recNote = `Divide-and-conquer: ${a} sub-call${a > 1 ? 's' : ''} on half the input with ${fmt(W)} extra work per call (Master theorem) → ${fmt(T)}.`;
      if (/pivot|partition/.test(bodyText)) recNote += ' Average case; a bad pivot degrades quicksort to O(n²).';
    } else {
      if (a <= 1) {
        T = mul(LIN, W);
        recurrence = `T(n) = T(n−1) + ${fmt(W)}`;
        recNote = `Linear recursion: n levels, each doing ${fmt(W)} work → ${fmt(T)}.`;
      } else {
        T = mul(expo(a), W);
        recurrence = `T(n) = ${a}·T(n−1) + ${fmt(W)}`;
        recNote = `${a} recursive calls per level on a problem only 1 smaller → ${fmt(T)}. Sub-problems overlap, so memoization (DP) usually collapses this to polynomial time.`;
        tips.add('Overlapping sub-problems: add memoization (`@lru_cache`, a `memo` dict/array) or convert to bottom-up DP.');
      }
      depthC = LIN;
    }
    reasons.push({ line: fn.start + 1 + offset, kind: 'time', text: recNote });
  }

  /* ── time (headline) ── */
  const time = recursive ? T : W;

  /* ── best / average / worst case ── */
  let worstC = time;
  let bestC = time;
  let avgC = time;
  const why = { best: '', average: '', worst: '' };
  const isCond = (k) => {
    if (/\bif\b|^\s*(?:\}\s*)?(?:elif|else|case)\b/.test(lines[k])) return true;
    let j = k - 1;
    while (j >= 0 && !lines[j].trim()) j--;
    return j >= 0 && /^\s*(?:\}\s*)?(?:if|elif|else)\b/.test(lines[j]);
  };
  const prodF = (fs) => { let p = ONE; for (const f of fs) p = mul(p, f); return p; };
  const costWith = (oneSet, filt) => {
    let m = ONE;
    for (const r of lineRes) {
      if (filt && !filt(r)) continue;
      const fs = r.chain.map((e) => (oneSet.has(e) ? ONE : e.factor));
      const c = r.header ? maxC(mul(prodF(fs.slice(0, r.outerLen)), r.headOp), mul(prodF(fs), r.restOp)) : mul(prodF(fs), r.stmtOp);
      m = maxC(m, c);
    }
    return m;
  };
  if (!recursive) {
    const dataRe = /\w\s*\[[^\]]+\]\s*(?:<=|>=|<|>|!=|==)|(?:<=|>=|<|>|!=|==)\s*\w+\s*\[/;
    const dw = new Set(bodyLoops.filter((e) => e.kind === 'while' && !e.queue && cmp(e.factor, LIN) === 0 && dataRe.test(e.desc) && lineRes.some((r) => r.chain.indexOf(e) > 0)));
    const cands = [];
    if (dw.size) cands.push({ set: dw, filt: null, why: 'the inner while-loop depends on the data, so already-ordered input skips its work' });
    for (const r of lineRes) {
      if (r.header || !r.chain.length || !/\b(?:return|break)\b/.test(lines[r.k]) || !isCond(r.k)) continue;
      const isBreak = /\bbreak\b/.test(lines[r.k]) && !/\breturn\b/.test(lines[r.k]);
      const set = new Set(dw);
      if (isBreak) set.add(r.chain[r.chain.length - 1]); else r.chain.forEach((e) => set.add(e));
      cands.push({
        set, filt: isBreak ? null : (x) => x.k <= r.k,
        why: isBreak ? `the early \`break\` on line ${r.k + 1 + offset} fires on the first pass` : `the early exit on line ${r.k + 1 + offset} triggers on the very first element examined`,
      });
    }
    for (const c of cands) { const v = costWith(c.set, c.filt); if (cmp(v, bestC) < 0) { bestC = v; why.best = 'Best case: ' + c.why + '.'; } }
  }
  if (quick && rank(W) === 1) {
    worstC = poly(W.n + 1, W.log);
    avgC = time; bestC = time;
    why.best = 'Best case: the pivot splits the array evenly on every call.';
    why.average = 'Average case: random or well-chosen pivots keep the splits balanced.';
    why.worst = 'Worst case: a bad pivot (e.g. already-sorted input with the last element as pivot) splits n into n−1 and 0 on every call.';
  } else if (pathTree) {
    bestC = ONE; avgC = LOGN; worstC = LIN;
    why.best = 'Best case: the key sits at the root.';
    why.average = 'Average case: a reasonably balanced tree has height ≈ log n.';
    why.worst = 'Worst case: a skewed tree (a linked list in disguise) has height n.';
  } else if (binRec) {
    bestC = ONE;
    why.best = 'Best case: the target sits at the very first midpoint.';
  }
  const same = (a, b) => cmp(a, b) === 0;
  if (!why.best) why.best = same(bestC, worstC) ? (recursive ? 'Every input follows the same recursion, so best equals worst.' : 'No early exit or data-dependent shortcut found, so the best case equals the worst.') : '';
  if (!why.average) {
    why.average = !same(bestC, worstC) ? 'On typical input the exit lands somewhere in the middle, which grows at the same rate as the worst case.'
      : decl.hash.size && lineRes.some((r) => r.chain.length) ? 'Hash-table operations are O(1) on average (adversarial collisions can slow them down).'
        : 'Same as the worst case.';
  }
  if (!why.worst) why.worst = 'The slowest the code can run on any input of size n.';
  if (cmp(bestC, worstC) > 0) bestC = worstC;
  if (cmp(avgC, bestC) < 0) avgC = bestC;
  if (cmp(avgC, worstC) > 0) avgC = worstC;
  const cs = (c, w) => ({ ...ser(c), why: w });
  const cases = { best: cs(bestC, why.best), average: cs(avgC, why.average), worst: cs(worstC, why.worst) };

  /* hot lines + explanation for loops */
  const hot = [];
  if (!recursive) {
    for (const r of lineRes) if (cmp(r.cost, W) === 0 && !isConst(W)) hot.push(r);
    if (hot.length) {
      const r = hot.find((x) => x.chain.length === Math.max(...hot.map((y) => y.chain.length))) || hot[0];
      const loops = r.chain.map((e) => `\`${e.desc}\` ⇒ ${fmtTerm(e.factor)}`).join('  ×  ');
      const opPart = !isConst(r.op) && r.note ? `  ×  ${r.note} ⇒ ${fmtTerm(r.op)}` : '';
      reasons.push({
        line: r.k + 1 + offset, kind: 'time',
        text: r.chain.length ? `${r.chain.length > 1 ? 'Nested loops' : 'Loop'}: ${loops}${opPart}  =  ${fmt(r.cost)}` : `${r.note || 'Work'} ⇒ ${fmt(r.cost)}`,
      });
      const seenNotes = new Set();
      for (const e of r.chain) if (e.note && !seenNotes.has(e.note)) { seenNotes.add(e.note); reasons.push({ line: e.line + 1 + offset, kind: 'info', text: `\`${e.desc.slice(0, 32)}\`: ${e.note}.` }); }
      if (r.tip) tips.add(r.tip);
    } else if (isConst(W)) {
      reasons.push({ line: fn.start + 1 + offset, kind: 'time', text: 'No loops or input-sized operations found ⇒ constant time.' });
    }
  } else {
    const rr = lineRes.filter((r) => cmp(r.cost, W) === 0 && !isConst(W))[0];
    if (rr) reasons.push({ line: rr.k + 1 + offset, kind: 'info', text: `Work per call: ${rr.note || 'loop'} ⇒ ${fmt(W)}.` });
    if (rr && rr.tip) tips.add(rr.tip);
  }
  for (const r of lineRes) { if (r.tip && r.chain.length && cmp(r.cost, LIN) >= 0) tips.add(r.tip); }
  for (const e of bodyLoops) if (e.amort) { reasons.push({ line: e.line + 1 + offset, kind: 'info', text: e.note + '.' }); break; }
  for (const c of calleeRes) {
    if (c.fn._res && !c.fn._res._partial && new RegExp('(?<![\\w.$])(?:(?:self|this|cls)\\.)?' + esc(c.name) + '\\s*\\(').test(bodyText) && cmp(c.fn._res.timeC, LIN) > 0 && cmp(time, c.fn._res.timeC) >= 0) {
      reasons.push({ line: fn.start + 1 + offset, kind: 'info', text: `Calls \`${c.name}()\`, which is ${fmt(c.fn._res.timeC)}.` });
      break;
    }
  }

  /* ── space ── */
  let space = ONE;
  const spaceWhy = [];
  const bump = (c, why, line) => { if (cmp(c, space) > 0) { space = c; spaceWhy.length = 0; spaceWhy.push({ line, why }); } };
  for (const r of lineRes) {
    if (r.alloc && r.alloc.k) bump(poly(r.alloc.k), r.alloc.note || 'allocation sized by input', r.k + 1 + offset);
  }
  const growRe = (name) => new RegExp('(?<![\\w.])' + esc(name) + '\\s*(?:\\.\\s*(?:append|appendleft|push|push_back|emplace_back|emplace|add|put|offer|insert|extend|enqueue|addLast|addFirst|set|add_edge|push_front)\\s*\\(|\\[[^\\]]*\\]\\s*=(?!=)|\\+=)|\\bheappush\\s*\\(\\s*' + esc(name) + '\\b');
  const grows = [...decl.grow].map((nm) => ({ nm, re: growRe(nm) }));
  let growsInRec = false;
  for (const r of lineRes) {
    for (const g of grows) {
      if (g.re.test(lines[r.k])) {
        const P = prod(r.chain);
        const cand = mul(P, r.alloc && r.alloc.k ? poly(r.alloc.k) : ONE);
        bump(cand, `\`${g.nm}\` grows by one entry per iteration of its enclosing loop(s)`, r.k + 1 + offset);
        if (recursive) growsInRec = true;
      }
    }
  }
  for (const r of lineRes) {
    for (const c of calleeRes) {
      if (!c.re.test(lines[r.k])) continue;
      const cand = nested.includes(c.fn) ? c.fn : fns.filter((f) => f.name === c.name && nested.includes(f))[0] || c.fn;
      const cr = cand._res;
      if (cr && !cr._partial && cmp(cr.spaceC, space) > 0) bump(cr.spaceC, `calls \`${c.name}()\` which needs ${fmt(cr.spaceC)} extra space`, r.k + 1 + offset);
    }
  }
  if (recursive) {
    if (growsInRec && rank(T) > 1) bump(T, 'collects results across an exponential number of calls', fn.start + 1 + offset);
    if (treeLike) {
      if (cmp(LIN, space) > 0) { space = { ...LIN, label: spaceLabel }; spaceWhy.length = 0; spaceWhy.push({ line: fn.start + 1 + offset, why: 'recursion stack depth equals the tree height h (O(log n) balanced, O(n) skewed)' }); }
    } else if (cmp(depthC, space) > 0) {
      bump(depthC, depthC === LOGN ? 'recursion depth is log n (input halves each call)' : 'recursion depth is up to n stack frames', fn.start + 1 + offset);
    }
    if (memoLike && cmp(LIN, space) > 0) bump(LIN, 'memo/visited table stores one entry per state', fn.start + 1 + offset);
  }
  if (isConst(space)) spaceWhy.push({ line: fn.start + 1 + offset, why: 'only a constant number of extra variables ⇒ in-place' });
  for (const s of spaceWhy) reasons.push({ line: s.line, kind: 'space', text: `Extra space: ${s.why} ⇒ ${fmt(space)}.` });
  for (const t of tips) reasons.push({ line: fn.start + 1 + offset, kind: 'tip', text: t });

  const hotSet = new Set(hot.map((r) => r.k + 1 + offset));
  const annotations = lineRes.filter((r) => r.header && !isConst(r.cost)).map((r) => ({ line: r.k + 1 + offset, text: fmt(r.cost) }));

  const res = {
    name: fn.name, line: fn.start + 1 + offset, endLine: fn.end + 1 + offset,
    time: ser(time), space: ser(space), timeStr: fmt(time), spaceStr: fmt(space),
    recursive, recurrence, reasons, cases, annotations, hotLines: [...hotSet], params: fn.params,
    pseudo: fn.pseudo || null, timeC: time, spaceC: space,
  };
  fn._res = res;
  fn._busy = false;
  return res;
}

/* ───────────────────────── public API ───────────────────────── */

const SUPPORTED = ['python', 'javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'java', 'c', 'cpp', 'csharp'];

/**
 * @param {string} text        source code
 * @param {string} languageId  VS Code language id
 * @param {{lineOffset?: number}} [opts]
 */
function analyze(text, languageId, opts = {}) {
  const lang = normLang(languageId);
  const offset = opts.lineOffset || 0;
  const raw = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const lines = clean(raw.join('\n'), lang).split('\n');
  const fns = extractFunctions(lines, lang);

  if (!fns.length) {
    fns.push({ name: '<snippet>', start: 0, end: lines.length - 1, bodyStart: 0, bodyEnd: lines.length - 1, params: [], decorators: '', pseudo: 'snippet' });
  } else {
    const covered = (k) => fns.some((f) => k >= f.start && k <= f.end);
    const loopRe = lang === 'python' ? /^\s*(?:for|while)\b/ : /^\s*(?:\}\s*)?(?:for|while)\s*\(/;
    if (lines.some((l, k) => !covered(k) && loopRe.test(l))) {
      fns.push({ name: '<top-level code>', start: 0, end: lines.length - 1, bodyStart: 0, bodyEnd: lines.length - 1, params: [], decorators: '', pseudo: 'top' });
    }
  }
  const env = { lines, raw, lang, fns, offset };
  const functions = [];
  for (const f of fns) {
    const r = analyzeFn(f, env);
    if (!r) continue;
    const { timeC, spaceC, ...pub } = r;
    void timeC; void spaceC;
    functions.push(pub);
  }
  functions.sort((a, b) => a.line - b.line);
  return { language: languageId, functions };
}

module.exports = { analyze, SUPPORTED, fmt, cmp, ser };
