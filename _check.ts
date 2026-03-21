const ts = require('typescript');
const fs = require('fs');
const src = fs.readFileSync('src/pumpfun-agent/nodes/analyze-node.ts', 'utf8');
const r = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  reportDiagnostics: true
});
if (r.diagnostics && r.diagnostics.length > 0) {
  r.diagnostics.forEach(d => console.log('ERR:', d.messageText, 'line:', d.start));
  process.exit(1);
} else {
  console.log('Syntax OK - transpiled successfully');
}
