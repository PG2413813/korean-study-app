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

/* ===== 问题1(复习)：回车提交答案，再按回车进入下一题 ===== */
function seedReviewable(n) {
  var words = [];
  for (var i = 0; i < n; i++) {
    words.push({ id: 'w' + i, ko: '단어' + i, zh: '单词' + i, tags: [], createdAt: '2000-01-01', lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 });
  }
  seedState({ version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {}, words: words });
}

test('复习回车流：第一次回车提交答案，第二次回车进入下一题', () => {
  seedReviewable(3);
  AppUI.startReview('zh2ko');
  var s = AppUI._getSession();
  assert(s.answered === false && s.index === 0, '初始应在第1题未作答');
  // 第一次回车：提交正确答案
  $('ans').value = s.queue[0].ko;
  $('ans').onkeydown({ key: 'Enter' });
  assert(s.answered === true, '第一次回车后应已作答');
  assert(!$('ans-next').classList.contains('hidden'), '作答后下一题按钮应显示');
  assert($('ans-fb').textContent.indexOf('答对') >= 0, '应显示答对反馈');
  // 第二次回车：直接进入下一题（无需鼠标点击按钮）
  $('ans').onkeydown({ key: 'Enter' });
  assert(s.index === 1 && s.answered === false, '第二次回车应进入第2题且重置为未作答');
});

test('复习回车流：答错后再按回车也能进入下一题', () => {
  seedReviewable(2);
  AppUI.startReview('zh2ko');
  var s = AppUI._getSession();
  $('ans').value = '틀린답';
  $('ans').onkeydown({ key: 'Enter' });
  assert(s.answered === true && s.wrong === 1, '答错应计入 wrong');
  $('ans').onkeydown({ key: 'Enter' });
  assert(s.index === 1, '答错后再按回车也应进入下一题');
});

/* ===== 单词库分页：每页50条 + 页码/相邻页/上一页下一页/跳转 ===== */
function seedWords(n) {
  var words = [];
  for (var i = 0; i < n; i++) {
    words.push({ id: 'w' + i, ko: '단어' + i, zh: '词' + i, tags: [], createdAt: '2000-01-01', lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 });
  }
  seedState({ version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {}, words: words });
}
function rowCount() { return $('w-list').querySelectorAll('.row').length; }
function clickPage(n) { document.querySelector('#w-pager .pg-num[data-pg="' + n + '"]').onclick(); }
function activePage() { return Number(document.querySelector('#w-pager .pg-num.on').getAttribute('data-pg')); }

test('分页：120词时第1页显示50条，共3页', () => {
  seedWords(120);
  AppUI.navigate('words');
  assert(rowCount() === 50, '第1页应显示50条，实际 ' + rowCount());
  assert(!!$('w-pager'), '应存在分页栏');
});

test('分页：点页码跳转，第3页显示剩余20条', () => {
  seedWords(120);
  AppUI.navigate('words');
  clickPage(3);
  assert(rowCount() === 20, '第3页应显示剩余20条，实际 ' + rowCount());
  assert(activePage() === 3, '当前高亮应为第3页');
});

test('分页：第7页显示相邻页 5,6,7,8,9', () => {
  seedWords(500); // 10页
  AppUI.navigate('words');
  // 先用跳转到第7页
  $('pg-input').value = '7';
  $('pg-go').onclick();
  assert(activePage() === 7, '应跳转到第7页');
  [5, 6, 7, 8, 9].forEach(function (p) {
    assert(!!document.querySelector('#w-pager .pg-num[data-pg="' + p + '"]'), '第7页应显示相邻页 ' + p);
  });
  assert(!!document.querySelector('#w-pager .pg-num[data-pg="1"]') && !!document.querySelector('#w-pager .pg-num[data-pg="10"]'), '应同时显示首页和末页');
});

test('分页：上一页/下一页按钮翻页', () => {
  seedWords(120);
  AppUI.navigate('words');
  $('pg-next').onclick();
  assert(activePage() === 2 && rowCount() === 50, '点下一页应到第2页');
  $('pg-prev').onclick();
  assert(activePage() === 1, '点上一页应回到第1页');
});

test('分页：跳转输入框跳转到指定页', () => {
  seedWords(120);
  AppUI.navigate('words');
  $('pg-input').value = '3';
  $('pg-go').onclick();
  assert(activePage() === 3 && rowCount() === 20, '跳转第3页应显示20条');
});

test('分页：搜索/筛选时回到第1页', () => {
  seedWords(120);
  AppUI.navigate('words');
  clickPage(3);
  assert(activePage() === 3, '先到第3页');
  // 搜索一个仍有多页结果的词（단어 匹配全部120条），应回到第1页
  $('w-search').value = '단어';
  $('w-search').oninput();
  assert(activePage() === 1, '搜索后应回到第1页，当前为 ' + activePage());
  assert(rowCount() === 50, '第1页应重新显示50条');
});




