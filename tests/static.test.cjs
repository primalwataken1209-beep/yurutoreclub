const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { source, compile } = require('./helpers.cjs');
test('app JSX and shipped inline JSX compile and remain identical', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const inline = [...html.matchAll(/<script\b[^>]*type="text\/babel"[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(inline.length, 1);
  assert.equal(compile(source), compile(inline[0][1]));
  compile(fs.readFileSync('legal/legal.js', 'utf8'));
});
test('Japanese and English translation keys match', () => {
  const babel = require('@babel/core');
  const ast = babel.parseSync(source, { babelrc: false, configFile: false, presets: ['@babel/preset-react'] });
  const decl = ast.program.body.flatMap(n => n.declarations || []).find(n => n.id.name === 'I18N');
  const vm = require('node:vm');
  const dict = vm.runInNewContext('(' + source.slice(decl.init.start, decl.init.end) + ')');
  const keys = (o, prefix = '') => Object.entries(o).flatMap(([k,v]) => typeof v === 'object' ? keys(v, prefix+k+'.') : [prefix+k]).sort();
  assert.deepEqual(keys(dict.ja), keys(dict.en));
});
