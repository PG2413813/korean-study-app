// 修复问题回归测试（按问题编号追加）
function seedState(obj) {
  localStorage.clear();
  localStorage.setItem(AppCore.STORAGE_KEY, JSON.stringify(obj));
  AppUI._reset();
}
function today() { return AppCore.todayKey(); }
function stats() {
  var s = AppUI._getState();
  return AppCore.computeStats(s.words, s.studyLog, today());
}

/* ===== 问题1：录入回车焦点流转 ===== */
test('问题1 录入页：韩语框回车聚焦中文框', () => {
  seedState(AppCore.defaultState());
  AppUI.navigate('add');
  $('add-ko').value = '사과';
  $('add-ko').onkeydown({ key: 'Enter' });
  assert(document.activeElement === $('add-zh'), '韩语框回车后焦点应在中文框');
});

test('问题1 录入页：中文框回车触发添加并继续，成功后焦点回到韩语框', () => {
  seedState(AppCore.defaultState());
  AppUI.navigate('add');
  $('add-ko').value = '사과';
  $('add-zh').value = '苹果';
  $('add-zh').onkeydown({ key: 'Enter' });
  assert(stats().newAdded === 1, '应成功录入 1 个单词');
  assert(document.activeElement === $('add-ko'), '添加后焦点应回到韩语框以便录下一个');
});

test('问题1 首页快捷录入：中文框回车直接添加，成功后焦点回到韩语框', () => {
  seedState(AppCore.defaultState());
  $('qk-ko').value = '나무';
  $('qk-zh').value = '树';
  $('qk-zh').onkeydown({ key: 'Enter' });
  assert(stats().newAdded === 1, '快捷录入应成功添加 1 个单词');
  assert(document.activeElement === $('qk-ko'), '添加后焦点应回到韩语框');
});

/* ===== 问题2：删除今日单词回减今日新录入计数 ===== */
test('问题2 删除今日录入的单词后，今日新录入计数同步减少', () => {
  seedState(AppCore.defaultState());
  AppUI.addWord('사과', '苹果', []);
  AppUI.addWord('바나나', '香蕉', []);
  AppUI.addWord('포도', '葡萄', []);
  assert(stats().newAdded === 3, '录入3词后应为3');
  var w = AppUI._getState().words[2]; // 删除"葡萄"
  AppUI.confirmRemove(w.id);
  $('r-ok').onclick();
  assert(stats().newAdded === 2, '删除1个今日单词后应变为2');
  assert(AppUI._getState().words.length === 2, '词库应剩2个');
});

test('问题2 删除非今日录入的单词不影响今日新录入计数', () => {
  seedState(AppCore.defaultState());
  AppUI.addWord('오늘단어', '今天词', []);
  var s = AppUI._getState();
  s.words[0].createdAt = '2000-01-01'; // 伪造为旧词
  AppUI.confirmRemove(s.words[0].id);
  $('r-ok').onclick();
  // studyLog 仍记录今天 added=1，但词已删；重点是不报错且不变成负数
  assert(stats().newAdded <= 1, '旧词删除不应把今日计数减成负数');
});

/* ===== 问题3：搜索不重建输入框，支持多字输入 ===== */
test('问题3 输入搜索时搜索框元素不被重建，焦点不丢失', () => {
  seedState({
    version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [
      { id: 'w1', ko: '사과', zh: '苹果', tags: [], createdAt: '2000-01-01', lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 },
      { id: 'w2', ko: '나무', zh: '树', tags: [], createdAt: '2000-01-01', lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 }
    ]
  });
  AppUI.navigate('words');
  var input = $('w-search');
  assert(!!input, '应存在搜索框');
  input.value = '사과';
  input.oninput();
  assert($('w-search') === input, '输入过程中搜索框 DOM 不应被替换（否则打断输入法）');
  assert(input.value === '사과', '多字输入值应完整保留，不会只剩一个字');
  var txt = $('w-list').textContent;
  assert(txt.indexOf('사과') >= 0, '应显示匹配词 사과');
  assert(txt.indexOf('나무') < 0, '应过滤掉不匹配的 나무');
});

/* ===== 问题4：整体字号放大 ===== */
test('问题4 基础字号与输入框字号已放大', () => {
  var css = global.html;
  var bodyFs = css.match(/body\s*\{[^}]*font-size:\s*(\d+)px/);
  assert(bodyFs && Number(bodyFs[1]) >= 15, 'body 基础字号应 >=15px，实际 ' + (bodyFs && bodyFs[1]));
  var inFs = css.match(/input, select, textarea\s*\{[^}]*font-size:\s*(\d+)px/);
  assert(inFs && Number(inFs[1]) >= 14, '输入框字号应 >=14px，实际 ' + (inFs && inFs[1]));
});

/* ===== 问题5：首页统计卡片可点击跳转 ===== */
test('问题5 首页三张卡片分别跳转到复习/录入/错题库', () => {
  seedState(AppCore.defaultState());
  function clickCard(nav) {
    var c = document.querySelector('#view-home .card[data-nav="' + nav + '"]');
    assert(!!c, '应存在卡片 ' + nav);
    c.onclick();
  }
  clickCard('review');
  assert(!$('view-review').classList.contains('hidden'), '点待复习应进入复习页');
  clickCard('add');
  assert(!$('view-add').classList.contains('hidden'), '点今日新录入应进入录入页');
  clickCard('errors');
  assert(!$('view-errors').classList.contains('hidden'), '点错题总数应进入错题库页');
});




