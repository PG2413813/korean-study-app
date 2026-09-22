// 核心逻辑测试运行器：从 HTML 中提取 CORE 代码，在 Node 中运行
'use strict';
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', '韩语学习记录.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const m = html.match(/\/\* ==== CORE-START ==== \*\/([\s\S]*?)\/\* ==== CORE-END ==== \*\//);
if (!m) { console.error('FATAL: 未找到 CORE 标记'); process.exit(2); }

// localStorage 沙箱
function makeStorage() {
  let data = {};
  return {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; },
    clear: () => { data = {}; },
    _dump: () => Object.assign({}, data)
  };
}
global.localStorage = makeStorage();
global.window = { localStorage: global.localStorage };

// 加载核心代码
eval(m[1]);
if (!global.AppCore) { console.error('FATAL: 核心代码未暴露 AppCore'); process.exit(2); }

let passed = 0, failed = 0;
global.test = (name, fn) => {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + '  ->  ' + e.message); }
};
global.assert = (cond, msg) => { if (!cond) throw new Error(msg || '断言失败'); };
global.eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
global.ns = n => n; // 占位

const specsDir = path.join(__dirname, 'specs');
const files = fs.readdirSync(specsDir).filter(f => f.endsWith('.test.js')).sort();
if (!files.length) { console.error('没有测试文件'); process.exit(2); }
for (const f of files) {
  console.log('SPEC ' + f);
  require(path.join(specsDir, f));
}
console.log('\n=== ' + passed + ' 通过, ' + failed + ' 失败 ===');
process.exit(failed ? 1 : 0);
