'use strict';
// Smoke test for media/panel.js using a stub DOM (no browser needed): node test/panel.smoke.js
const fs = require('fs');
const vm = require('vm');
const { analyze } = require('../src/analyzer');

const els = {};
const mk = (id) => (els[id] = els[id] || {
  id, innerHTML: '', textContent: '', style: {}, dataset: {},
  addEventListener() {}, setAttribute() {}, querySelectorAll: () => [],
  ownerSVGElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 760 }) },
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 760 }),
});
let onMessage;
const document = { getElementById: (id) => mk(id) };
const window = { addEventListener: (t, fn) => { if (t === 'message') onMessage = fn; } };
const posted = [];
const ctx = { document, window, acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m) }), console, Math };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../media/panel.js', 'utf8'), ctx);

const code = `
def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        for j in range(n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]

def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)

def first(a):
    return a[0]

def linear_search(a, t):
    for i in range(len(a)):
        if a[i] == t:
            return i
    return -1
`;
const res = analyze(code, 'python');
let fails = 0;
const check = (cond, msg) => { if (!cond) { fails++; console.log('✗', msg); } else console.log('✓', msg); };

check(posted[0] && posted[0].type === 'ready', 'webview announces ready');
for (const name of ['bubble_sort', 'fib', 'first', 'linear_search']) {
  onMessage({ data: { type: 'update', payload: { title: 'demo.py', language: 'python', functions: res.functions, focus: name } } });
  const app = els.app.innerHTML;
  const chart = els.chartwrap.innerHTML;
  check(app.includes(res.functions.find((f) => f.name === name).timeStr), `${name}: headline complexity rendered`);
  check(chart.includes('<svg') && !/NaN|undefined|Infinity/.test(chart), `${name}: chart SVG has no NaN/undefined`);
  check(app.includes('Best, average and worst case') && !app.includes('Cost line by line'), `${name}: cases section shown, code listing removed`);
  check(els.bars.innerHTML.includes('◀ this'), `${name}: ops bars highlight this function`);
}
console.log(fails ? `\n${fails} failed` : '\nall smoke checks passed');
process.exit(fails ? 1 : 0);
