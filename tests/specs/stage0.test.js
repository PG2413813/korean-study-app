// 阶段0：存储初始化与持久化
const A = global.AppCore;

test('默认数据结构完整', () => {
  const s = A.defaultState();
  assert(s.version === 1, 'version 应为 1');
  assert(s.settings.roundSize === 20, '默认题量 20');
  assert(s.settings.removeAfter === 3, '默认移出次数 3');
  assert(Array.isArray(s.words) && s.words.length === 0, 'words 为空数组');
  assert(typeof s.studyLog === 'object', 'studyLog 为对象');
});

test('空存储加载时返回默认并写回本地', () => {
  global.localStorage.clear();
  const s = A.loadState();
  assert(s.words.length === 0, '初始无单词');
  const raw = global.localStorage.getItem(A.STORAGE_KEY);
  assert(!!raw, '加载后已写回存储');
});

test('保存后可原样读回', () => {
  global.localStorage.clear();
  const s = A.loadState();
  s.words.push({ id: 'x1', ko: '안녕', zh: '你好', tags: [], createdAt: '2026-09-20', lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 });
  A.saveState(s);
  const s2 = A.loadState();
  assert(s2.words.length === 1, '读回 1 个单词');
  assert(s2.words[0].ko === '안녕', '韩语原文一致');
});

test('损坏的存储数据自动重置为默认', () => {
  global.localStorage.clear();
  global.localStorage.setItem(A.STORAGE_KEY, '{不是合法json');
  const s = A.loadState();
  assert(s.words.length === 0 && s.settings.roundSize === 20, '损坏数据被重置为默认');
});

test('normalizeState 修正缺失字段', () => {
  const s = A.normalizeState({ words: [{ ko: '가다', zh: '去' }] });
  assert(s.words.length === 1, '保留有效单词');
  assert(typeof s.words[0].id === 'string' && s.words[0].id.length > 0, '自动生成 id');
  assert(s.words[0].createdAt.length === 10, '自动补日期');
});

test('normalizeState 丢弃缺少韩语或中文的词', () => {
  const s = A.normalizeState({ words: [{ ko: '', zh: '无韩语' }, { ko: '나', zh: '', tags: 'x' }] });
  assert(s.words.length === 0, '无效词被过滤');
});
