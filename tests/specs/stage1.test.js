// 阶段1：导出 / 导入 JSON
const A = global.AppCore;

test('导出 JSON 包含版本与数据', () => {
  const s = A.defaultState();
  s.words.push({ id: 'x1', ko: '공부하다', zh: '学习', tags: ['动词'], createdAt: '2026-09-20', lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 });
  const text = A.exportJSON(s);
  const obj = JSON.parse(text);
  assert(obj.app === 'han-study', '带 app 标识');
  assert(obj.version === 1, '版本 1');
  assert(typeof obj.exportedAt === 'string' && obj.exportedAt.length === 10, '含导出日期');
  assert(obj.data.words.length === 1, '数据中含单词');
});

test('导出后可完整导入恢复', () => {
  const s = A.defaultState();
  s.settings.roundSize = 15;
  s.settings.removeAfter = 2;
  s.words.push({ id: 'w1', ko: '사과', zh: '苹果', tags: ['名词'], createdAt: '2026-09-19', lastReviewedAt: '2026-09-20', isError: true, errorSince: '2026-09-20', correctStreak: 1 });
  const text = A.exportJSON(s);
  const res = A.importJSON(text);
  assert(res.ok, '导入成功: ' + (res.error || ''));
  assert(res.state.settings.roundSize === 15, '题量恢复');
  assert(res.state.settings.removeAfter === 2, '移出次数恢复');
  assert(res.state.words.length === 1, '单词恢复');
  assert(res.state.words[0].isError === true, '错题状态恢复');
  assert(res.state.words[0].correctStreak === 1, '连续答对次数恢复');
});

test('导入非法文本返回错误且不抛异常', () => {
  const res = A.importJSON('这不是json{{{');
  assert(res.ok === false, '应失败');
  assert(/JSON/.test(res.error), '错误说明指向 JSON');
});

test('导入缺少 words 数组的文件返回错误', () => {
  const res = A.importJSON(JSON.stringify({ settings: {} }));
  assert(res.ok === false, '应失败');
  assert(/words/.test(res.error), '提示缺少 words');
});

test('导入兼容裸状态对象（无 data 包裹）', () => {
  const res = A.importJSON(JSON.stringify({ words: [{ ko: '가다', zh: '去' }] }));
  assert(res.ok, '裸对象也能导入: ' + (res.error || ''));
  assert(res.state.words.length === 1, '单词数 1');
});

test('导入自动清理无效单词并补全字段', () => {
  const res = A.importJSON(JSON.stringify({
    words: [{ ko: '열심히', zh: '努力', tags: ['副词'] }, { ko: '', zh: '空韩语' }, { ko: '오늘', zh: '今天' }]
  }));
  assert(res.ok, '导入成功');
  assert(res.state.words.length === 2, '无效词被过滤');
  assert(res.state.words[0].id.length > 0, 'id 已补全');
});
