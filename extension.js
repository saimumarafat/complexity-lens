'use strict';
const vscode = require('vscode');
const path = require('path');
const { analyze, SUPPORTED } = require('./src/analyzer');

const cfg = () => vscode.workspace.getConfiguration('complexityLens');
const isSupported = (doc) => !!doc && SUPPORTED.includes(doc.languageId);

/** @type {vscode.WebviewPanel | undefined} */
let panel;
let panelReady = false;
let panelTarget; // { uri, selection? }
let pendingFocus; // function name to focus once the panel has data
let statusItem;
let hotDeco;
let annoDeco;
let debounce;

const cache = new Map(); // uri -> { version, result }
const lensEmitter = new vscode.EventEmitter();

function getAnalysis(doc) {
  const key = doc.uri.toString();
  const hit = cache.get(key);
  if (hit && hit.version === doc.version) return hit.result;
  let result;
  try {
    result = analyze(doc.getText(), doc.languageId);
  } catch (err) {
    console.error('[complexity-lens] analysis failed', err);
    result = { language: doc.languageId, functions: [] };
  }
  cache.set(key, { version: doc.version, result });
  return result;
}

/* ─────────────── CodeLens ─────────────── */

function lensTitle(f) {
  const c = f.cases;
  const same = c.best.big === c.worst.big && c.average.big === c.worst.big;
  const time = same ? `⏱ Time ${f.timeStr}` : `⏱ Best ${c.best.big} · Avg ${c.average.big} · Worst ${c.worst.big}`;
  return `${time}   ·   💾 Space ${f.spaceStr}`;
}

class LensProvider {
  constructor() { this.onDidChangeCodeLenses = lensEmitter.event; }
  provideCodeLenses(doc) {
    if (!cfg().get('codeLens') || !isSupported(doc)) return [];
    const out = [];
    for (const f of getAnalysis(doc).functions) {
      if (f.pseudo) continue;
      const range = new vscode.Range(f.line - 1, 0, f.line - 1, 0);
      out.push(new vscode.CodeLens(range, {
        title: lensTitle(f),
        command: 'complexityLens.showFunction',
        arguments: [doc.uri, f.name],
        tooltip: f.recurrence ? `Recurrence: ${f.recurrence}` : 'Open the complexity visualizer',
      }));
    }
    return out;
  }
}

/* ─────────────── editor decorations ─────────────── */

function makeDecorations() {
  hotDeco = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
    overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });
  annoDeco = vscode.window.createTextEditorDecorationType({});
}

function refreshDecorations(editor) {
  if (!editor || !hotDeco) return;
  const doc = editor.document;
  if (!isSupported(doc)) { editor.setDecorations(hotDeco, []); editor.setDecorations(annoDeco, []); return; }
  const res = getAnalysis(doc);
  const hot = [];
  const anno = [];
  for (const f of res.functions) {
    if (f.pseudo) continue;
    if (cfg().get('highlightHotspots')) {
      for (const ln of f.hotLines) {
        if (f.time.n < 1 && f.time.kind === 'poly') continue; // only worth flagging linear or worse
        hot.push({ range: new vscode.Range(ln - 1, 0, ln - 1, 0), hoverMessage: `Dominates running time of \`${f.name}\`: ${f.timeStr}` });
      }
    }
    if (cfg().get('inlineAnnotations')) {
      for (const a of f.annotations) {
        const line = a.line - 1;
        if (line >= doc.lineCount) continue;
        anno.push({
          range: new vscode.Range(line, doc.lineAt(line).text.length, line, doc.lineAt(line).text.length),
          renderOptions: { after: { contentText: `   ⟵ ${a.text}`, color: new vscode.ThemeColor('editorCodeLens.foreground'), fontStyle: 'italic' } },
        });
      }
    }
  }
  editor.setDecorations(hotDeco, hot);
  editor.setDecorations(annoDeco, anno);
}

/* ─────────────── status bar ─────────────── */

function refreshStatus(editor) {
  if (!statusItem) return;
  if (!cfg().get('statusBar') || !editor || !isSupported(editor.document)) { statusItem.hide(); return; }
  const fns = getAnalysis(editor.document).functions.filter((f) => !f.pseudo);
  if (!fns.length) { statusItem.hide(); return; }
  const worst = fns.reduce((a, b) => (score(b.time) > score(a.time) ? b : a));
  statusItem.text = `$(graph) ${worst.timeStr}`;
  statusItem.tooltip = new vscode.MarkdownString(
    `**Complexity Lens** – worst function: \`${worst.name}\`\n\n` + fns.map((f) => `- \`${f.name}\` ⏱ ${f.cases.best.big} / ${f.cases.average.big} / ${f.cases.worst.big} (best / avg / worst) · 💾 ${f.spaceStr}`).join('\n') + '\n\n_Click to visualize_');
  statusItem.show();
}
const score = (c) => (c.kind === 'fact' ? 1e6 : c.kind === 'exp' ? 1e5 : c.n * 100 + c.log);

/* ─────────────── webview panel ─────────────── */

function buildPayload() {
  if (!panelTarget) return null;
  const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === panelTarget.uri.toString());
  if (!doc) return null;
  let result;
  let title = path.basename(doc.fileName);
  if (panelTarget.selection) {
    const sel = panelTarget.selection;
    result = analyze(doc.getText(sel), doc.languageId, { lineOffset: sel.start.line });
    title += ` (selection L${sel.start.line + 1}–${sel.end.line + 1})`;
  } else {
    result = getAnalysis(doc);
  }
  return { title, language: doc.languageId, functions: result.functions, focus: pendingFocus };
}

function pushToPanel() {
  if (!panel || !panelReady) return;
  const payload = buildPayload();
  if (payload) { panel.webview.postMessage({ type: 'update', payload }); pendingFocus = undefined; }
}

function ensurePanel(context) {
  if (panel) { panel.reveal(vscode.ViewColumn.Beside, true); return; }
  const media = vscode.Uri.joinPath(context.extensionUri, 'media');
  panel = vscode.window.createWebviewPanel('complexityLens', 'Complexity Lens', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media] });
  panelReady = false;
  const nonce = [...Array(24)].map(() => Math.random().toString(36)[2]).join('');
  const css = panel.webview.asWebviewUri(vscode.Uri.joinPath(media, 'panel.css'));
  const js = panel.webview.asWebviewUri(vscode.Uri.joinPath(media, 'panel.js'));
  panel.webview.html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${css}"><title>Complexity Lens</title></head>
<body><div id="app"><p class="empty">Open a function and run <b>Complexity Lens: Analyze Current File</b>.</p></div>
<script nonce="${nonce}" src="${js}"></script></body></html>`;
  panel.webview.onDidReceiveMessage((msg) => {
    if (msg.type === 'ready') { panelReady = true; pushToPanel(); }
    if (msg.type === 'copy' && typeof msg.text === 'string') {
      vscode.env.clipboard.writeText(msg.text).then(() => vscode.window.setStatusBarMessage('Complexity Lens: copied results as Markdown', 3000));
    }
    if (msg.type === 'reveal' && panelTarget) {
      vscode.window.showTextDocument(panelTarget.uri, { viewColumn: vscode.ViewColumn.One, preserveFocus: false }).then((ed) => {
        const pos = new vscode.Position(Math.max(0, msg.line - 1), 0);
        ed.selection = new vscode.Selection(pos, pos);
        ed.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      });
    }
  });
  panel.onDidDispose(() => { panel = undefined; panelReady = false; });
}

function openPanel(context, uri, selection, focus) {
  panelTarget = { uri, selection };
  pendingFocus = focus;
  ensurePanel(context);
  pushToPanel();
}

/* ─────────────── activation ─────────────── */

function activate(context) {
  makeDecorations();
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusItem.command = 'complexityLens.analyzeFile';
  context.subscriptions.push(statusItem, hotDeco, annoDeco, lensEmitter);

  context.subscriptions.push(vscode.languages.registerCodeLensProvider(SUPPORTED.map((language) => ({ language })), new LensProvider()));

  context.subscriptions.push(
    vscode.commands.registerCommand('complexityLens.analyzeFile', () => {
      const ed = vscode.window.activeTextEditor;
      if (!ed || !isSupported(ed.document)) { vscode.window.showInformationMessage('Complexity Lens: open a Python, JS/TS, Java, C/C++ or C# file first.'); return; }
      openPanel(context, ed.document.uri, undefined, undefined);
    }),
    vscode.commands.registerCommand('complexityLens.analyzeSelection', () => {
      const ed = vscode.window.activeTextEditor;
      if (!ed || !isSupported(ed.document) || ed.selection.isEmpty) { vscode.window.showInformationMessage('Complexity Lens: select some code first.'); return; }
      openPanel(context, ed.document.uri, ed.selection, undefined);
    }),
    vscode.commands.registerCommand('complexityLens.showFunction', (uri, name) => {
      const target = uri || (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri);
      if (target) openPanel(context, target, undefined, name);
    }),
    vscode.commands.registerCommand('complexityLens.toggleCodeLens', async () => {
      await cfg().update('codeLens', !cfg().get('codeLens'), vscode.ConfigurationTarget.Global); lensEmitter.fire();
    }),
    vscode.commands.registerCommand('complexityLens.toggleAnnotations', async () => {
      await cfg().update('inlineAnnotations', !cfg().get('inlineAnnotations'), vscode.ConfigurationTarget.Global);
      refreshDecorations(vscode.window.activeTextEditor);
    }),
  );

  const refreshAll = () => {
    const ed = vscode.window.activeTextEditor;
    refreshDecorations(ed);
    refreshStatus(ed);
    lensEmitter.fire();
    if (panel && panelTarget && !panelTarget.selection) pushToPanel();
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (!isSupported(e.document)) return;
      if (!cfg().get('analyzeOnType')) return;
      clearTimeout(debounce);
      debounce = setTimeout(refreshAll, 450);
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => { if (isSupported(doc)) refreshAll(); }),
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      refreshDecorations(ed);
      refreshStatus(ed);
      // let an open panel follow the active file
      if (ed && isSupported(ed.document) && panel && panelTarget && !panelTarget.selection) {
        panelTarget = { uri: ed.document.uri };
        pushToPanel();
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('complexityLens')) refreshAll(); }),
    vscode.workspace.onDidCloseTextDocument((d) => cache.delete(d.uri.toString())),
  );

  refreshAll();
}

function deactivate() { clearTimeout(debounce); }

module.exports = { activate, deactivate };
