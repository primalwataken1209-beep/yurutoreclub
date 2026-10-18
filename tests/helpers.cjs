const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
const source = fs.readFileSync('app.js', 'utf8');
const options = { babelrc: false, configFile: false, presets: ['@babel/preset-react'], comments: false };
function compile(code) { return babel.transformSync(code, options).code; }
function functions(names, globals = {}) {
  const ast = babel.parseSync(source, options);
  const selected = ast.program.body.filter(n => n.type === 'FunctionDeclaration' && names.includes(n.id.name));
  if (selected.length !== names.length) throw new Error('Test function missing: ' + names);
  const code = selected.map(n => source.slice(n.start, n.end)).join('\n');
  const context = vm.createContext({ console: { warn() {}, error() {}, log() {} }, ...globals });
  vm.runInContext(compile(code), context, { timeout: 5000 });
  return context;
}
module.exports = { source, compile, functions };
