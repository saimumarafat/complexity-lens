'use strict';
// Loads extension.js against a mocked `vscode` API and exercises activate + lens + decorations + panel.
const Module = require('module');
const calls = { lens: [], deco: [], cmds: {}, html: '' };
const Range = class { constructor(a, b, c, d) { Object.assign(this, { sl: a, sc: b, el: c, ec: d }); } };
const text = `def bubble(a):\n    for i in range(len(a)):\n        for j in range(len(a)):\n            pass\n`;
const doc = {
  languageId: 'python', version: 1, fileName: '/x/demo.py', uri: { toString: () => 'file:///x/demo.py' }, lineCount: 4,
  getText: () => text, lineAt: (n) => ({ text: text.split('\n')[n] }),
};
const editor = { document: doc, selection: { isEmpty: true }, setDecorations: (d, r) => calls.deco.push(r.length) };
const posted = [];
const vscodeMock = {
  workspace: {
    getConfiguration: () => ({ get: () => true, update: async () => {} }),
    onDidChangeTextDocument: () => ({}), onDidSaveTextDocument: () => ({}), onDidChangeConfiguration: () => ({}), onDidCloseTextDocument: () => ({}),
    textDocuments: [doc],
  },
  window: {
    activeTextEditor: editor,
    createTextEditorDecorationType: () => ({}),
    createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
    onDidChangeActiveTextEditor: () => ({}),
    showInformationMessage() {},
    createWebviewPanel: () => ({
      reveal() {}, onDidDispose() {}, webview: {
        cspSource: 'csp', asWebviewUri: (u) => u.path, set html(v) { calls.html = v; },
        onDidReceiveMessage: (fn) => { calls.recv = fn; }, postMessage: (m) => posted.push(m),
      },
    }),
  },
  languages: { registerCodeLensProvider: (_, p) => { calls.provider = p; return {}; } },
  commands: { registerCommand: (id, fn) => { calls.cmds[id] = fn; return {}; } },
  EventEmitter: class { constructor() { this.event = () => ({}); } fire() {} dispose() {} },
  Range, Position: class {}, Selection: class {}, CodeLens: class { constructor(r, c) { this.range = r; this.command = c; } },
  ThemeColor: class {}, StatusBarAlignment: { Right: 2 }, OverviewRulerLane: { Right: 4 }, ViewColumn: { Beside: -2, One: 1 },
  ConfigurationTarget: { Global: 1 }, TextEditorRevealType: { InCenter: 2 },
  Uri: { joinPath: (b, ...p) => ({ path: [b.path, ...p].join('/') }) },
  MarkdownString: class { constructor(v) { this.value = v; } },
};
vscodeMock.env = { clipboard: { writeText: async () => {} } }; vscodeMock.window.setStatusBarMessage = () => {};
const orig = Module._load;
Module._load = function (req, ...rest) { return req === 'vscode' ? vscodeMock : orig.call(this, req, ...rest); };

const ext = require('../extension.js');
const ctx = { subscriptions: [], extensionUri: { path: '/ext' } };
ext.activate(ctx);

let ok = true;
const check = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) ok = false; };
const lenses = calls.provider.provideCodeLenses(doc);
check(lenses.length === 1 && /O\(n²\)/.test(lenses[0].command.title), 'CodeLens shows ' + (lenses[0] && lenses[0].command.title));
check(calls.deco.length >= 2, 'decorations applied');
check(['analyzeFile', 'analyzeSelection', 'showFunction', 'toggleCodeLens', 'toggleAnnotations'].every((c) => calls.cmds['complexityLens.' + c]), 'all 5 commands registered');
calls.cmds['complexityLens.analyzeFile']();
check(/media\/panel\.js/.test(calls.html) && /Content-Security-Policy/.test(calls.html), 'webview HTML built with CSP + panel.js');
calls.recv({ type: 'ready' });
check(posted.length === 1 && posted[0].payload.functions[0].name === 'bubble', 'update payload posted to webview');
process.exit(ok ? 0 : 1);
