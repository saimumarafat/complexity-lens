# Contributing

1. Fork and clone, then open the folder in VS Code and press `F5` to launch the extension host with `samples/`.
2. Run `npm test` before opening a pull request.
3. When fixing a wrong estimate, add a known-answer snippet to `test/analyzer.test.js` (time/space) or `test/cases.test.js` (best/average/worst).
4. `src/analyzer.js` must stay free of VS Code imports so it can be tested in plain Node.

Bug reports are most useful with the code snippet, the language, what the extension showed and what you expected.
