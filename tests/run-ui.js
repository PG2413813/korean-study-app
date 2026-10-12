// UI 测试运行器：用 jsdom 加载真实 HTML，执行 UI 代码后模拟用户操作
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// 这套 UI 测试是为 v1 单文件版写的，指向备份中的 v1 原始文件。
// 需要指向其它文件时用环境变量 HAN_HTML 覆盖。
const htmlPath = process.env.HAN_HTML || path.join(__dirname, '..', 'backup', '韩语学习记录-v1-原始版.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
global.Blob = dom.window.Blob;
global.URL = dom.window.URL;
global.FileReader = dom.window.FileReader;
global.location = dom.window.location;

// 提取 CORE + UI 代码并执行
const m = html.match(/\/\* ==== CORE-START ==== \*\/([\s\S]*?)\/\* ==== UI-END ==== \*\//);
if (!m) { console.error('FATAL: 未找到 CORE/UI 标记'); process.exit(2); }
eval(m[1] + '\nglobalThis.AppUI = AppUI; globalThis.AppCore = AppCore;');
global.html = html;

let passed = 0, failed = 0;
global.test = (name, fn) => {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + '  ->  ' + e.message); }
};
global.assert = (cond, msg) => { if (!cond) throw new Error(msg || '断言失败'); };
global.$ = id => global.document.getElementById(id);

const specsDir = path.join(__dirname, 'specs-ui');
const files = fs.readdirSync(specsDir).filter(f => f.endsWith('.test.js')).sort();
if (!files.length) { console.error('没有 UI 测试文件'); process.exit(2); }
for (const f of files) {
  console.log('SPEC ' + f);
  require(path.join(specsDir, f));
}
console.log('\n=== ' + passed + ' 通过, ' + failed + ' 失败 ===');
process.exit(failed ? 1 : 0);
