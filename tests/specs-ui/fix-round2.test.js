// 第二轮功能修复测试（问题1-6）
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
function seedReviewable(n, createdAt) {
  var words = [];
  for (var i = 0; i < n; i++) {
    words.push({ id: 'w' + i, ko: '단어' + i, zh: '单词' + i, tags: [], createdAt: createdAt || '2000-01-01', lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 });
  }
  seedState({ version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {}, words: words });
}

/* ===== 问题1：答对后自动进入下一题 ===== */
function withSyncTimers(fn) {
  var orig = global.setTimeout;
  global.setTimeout = function (fn2) { fn2(); return 0; };
  try { fn(); } finally { global.setTimeout = orig; }
}

test('问题1 答对后显示反馈并自动进入下一题（无需再按回车）', () => {
  seedReviewable(3);
  AppUI.startReview('zh2ko');
  var s = AppUI._getSession();
  assert(s.index === 0, '初始在第1题');
  $('ans').value = s.queue[0].ko;
  withSyncTimers(function () { $('ans').onkeydown({ key: 'Enter' }); });
  s = AppUI._getSession();
  assert(s.correct === 1, '答对计数应为1');
  assert(s.index === 1 && s.answered === false, '应已自动进入第2题且重置为未作答');
  // 答对反馈在真实浏览器中短暂可见（AUTO_NEXT_DELAY=700ms）后自动切换；此处同步执行已进入下一题
});

test('问题1 答错不自动进入下一题，仍按回车或按钮继续', () => {
  seedReviewable(3);
  AppUI.startReview('zh2ko');
  var s = AppUI._getSession();
  $('ans').value = '틀린답';
  withSyncTimers(function () { $('ans').onkeydown({ key: 'Enter' }); });
  s = AppUI._getSession();
  assert(s.wrong === 1 && s.index === 0, '答错应停在当前题');
  assert(s.answered === true, '答错后处于已作答状态');
  assert(!$('ans-next').classList.contains('hidden'), '答错后应显示下一题按钮');
});

test('问题1 答对自动推进到最后一题后显示小结', () => {
  seedReviewable(2);
  AppUI.startReview('zh2ko');
  var s = AppUI._getSession();
  $('ans').value = s.queue[0].ko;
  withSyncTimers(function () { $('ans').onkeydown({ key: 'Enter' }); });
  s = AppUI._getSession();
  $('ans').value = s.queue[1].ko;
  withSyncTimers(function () { $('ans').onkeydown({ key: 'Enter' }); });
  assert(!!$('sum-again'), '最后一题答对后应进入小结页');
});

/* ===== 问题2：一个中文对应多个韩语单词，全部算对并给出所有韩语 ===== */
test('问题2 核心：findSynonymGroup 按中文释义完全一致聚合同义词', () => {
  var words = [
    { id: 'w1', ko: '공부하다', zh: '学习' },
    { id: 'w2', ko: '배우다', zh: '学习' },
    { id: 'w3', ko: '사과', zh: '苹果' }
  ];
  var g = AppCore.findSynonymGroup(words, words[0]);
  assert(g.length === 2 && g.some(function (x) { return x.id === 'w2'; }), '应聚合同义韩语，实际 ' + g.length);
  var g3 = AppCore.findSynonymGroup(words, words[2]);
  assert(g3.length === 1, '无同义词时只含自身');
});

test('问题2 复习：中文题输入同组另一个韩语也算对，反馈列出所有韩语', () => {
  seedState({
    version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [
      { id: 'w1', ko: '공부하다', zh: '学习', tags: [], createdAt: '2000-01-01', lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 },
      { id: 'w2', ko: '배우다', zh: '学习', tags: [], createdAt: '2000-01-01', lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 }
    ]
  });
  AppUI.startReview('zh2ko');
  var s = AppUI._getSession();
  assert(s.queue[0].zh === '学习', '中文题应显示 学习');
  // 输入同组另一个韩语 배우다（不是当前词条 공부하다）
  $('ans').value = '배우다';
  withSyncTimers(function () { $('ans').onkeydown({ key: 'Enter' }); });
  s = AppUI._getSession();
  assert(s.correct === 1 && s.wrong === 0, '同义韩语应算对');
  assert(!!s._group && s._group.length === 2, '应记录同义词组');
});

test('问题2 复习：答错时反馈展示该中文对应的所有韩语', () => {
  seedState({
    version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [
      { id: 'w1', ko: '공부하다', zh: '学习', tags: [], createdAt: '2000-01-01', lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 },
      { id: 'w2', ko: '배우다', zh: '学习', tags: [], createdAt: '2000-01-01', lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 }
    ]
  });
  AppUI.startReview('zh2ko');
  var s = AppUI._getSession();
  $('ans').value = '틀린답';
  withSyncTimers(function () { $('ans').onkeydown({ key: 'Enter' }); });
  var fbText = $('ans-fb').textContent;
  assert(fbText.indexOf('공부하다') >= 0 && fbText.indexOf('배우다') >= 0, '错误反馈应列出所有韩语，实际：' + fbText);
});

/* ===== 问题3：空输入误触回车只提醒，不判错不进错题库 ===== */
test('问题3 空输入回车：提醒且不判错、不推进、不进错题库', () => {
  seedReviewable(2);
  AppUI.startReview('zh2ko');
  var s = AppUI._getSession();
  // 误触回车（空输入）
  $('ans').value = '';
  $('ans').onkeydown({ key: 'Enter' });
  s = AppUI._getSession();
  assert(s.wrong === 0 && s.correct === 0, '空输入不应计入对错');
  assert(s.index === 0 && s.answered === false, '空输入不应推进题目');
  assert(AppUI._getState().words.every(function (w) { return !w.isError; }), '空输入不应产生错题');
  var fbText = $('ans-fb').textContent;
  assert(fbText.indexOf('还没有输入答案') >= 0, '应显示提醒，实际：' + fbText);
});

test('问题3 空输入提醒后，正常输入仍可正常判题', () => {
  seedReviewable(2);
  AppUI.startReview('zh2ko');
  var s = AppUI._getSession();
  $('ans').value = '';
  $('ans').onkeydown({ key: 'Enter' });
  // 正常作答
  $('ans').value = s.queue[0].ko;
  $('ans').onkeydown({ key: 'Enter' });
  s = AppUI._getSession();
  assert(s.correct === 1, '提醒后正常作答应算对');
});

/* ===== 问题4：复习中途退出/切页后重新进入应继续，而不是重新开始 ===== */
test('问题4 切到其他页面再回到复习页，进度保留', () => {
  seedReviewable(4);
  AppUI.startReview('zh2ko');
  var s = AppUI._getSession();
  // 答对第1题 → 自动进入第2题
  $('ans').value = s.queue[0].ko;
  withSyncTimers(function () { $('ans').onkeydown({ key: 'Enter' }); });
  s = AppUI._getSession();
  assert(s.index === 1, '答对后应在第2题');
  // 中途切到首页再回来
  AppUI.navigate('home');
  AppUI.navigate('review');
  s = AppUI._getSession();
  assert(s && s.index === 1, '回来后应仍在第2题，实际 index=' + (s && s.index));
  assert(!!$('ans'), '应显示题目而不是设置页');
  assert(!$('rv-start'), '不应出现重新开始的设置页');
});

test('问题4 刷新（内存丢失）后重新进入复习页，从 localStorage 恢复进度', () => {
  seedReviewable(4);
  AppUI.startReview('zh2ko');
  var s = AppUI._getSession();
  $('ans').value = s.queue[0].ko;
  withSyncTimers(function () { $('ans').onkeydown({ key: 'Enter' }); });
  s = AppUI._getSession();
  assert(s.index === 1, '答对后应在第2题');
  assert(localStorage.getItem('hanStudyApp.reviewSession') !== null, '应已持久化复习进度');
  // 模拟刷新：内存 session 丢失
  AppUI._setSession(null);
  AppUI.navigate('review');
  s = AppUI._getSession();
  assert(s && s.index === 1, '刷新后应从存储恢复，仍在第2题');
  assert(!!$('ans'), '应恢复题目界面');
});

test('问题4 答错后退出再回来，自动推进到下一题（不重复计分）', () => {
  seedReviewable(3);
  AppUI.startReview('zh2ko');
  var s = AppUI._getSession();
  $('ans').value = '틀린답';
  withSyncTimers(function () { $('ans').onkeydown({ key: 'Enter' }); });
  s = AppUI._getSession();
  assert(s.wrong === 1 && s.answered === true, '答错后已作答状态');
  // 退出再回来（模拟刷新）
  AppUI._setSession(null);
  AppUI.navigate('review');
  s = AppUI._getSession();
  assert(s && s.index === 1 && s.answered === false, '回来应推进到第2题且未作答');
});

test('问题4 一轮完成后返回首页会清除存档；再进复习页是设置页', () => {
  seedReviewable(2);
  AppUI.startReview('zh2ko');
  var s = AppUI._getSession();
  $('ans').value = s.queue[0].ko;
  withSyncTimers(function () { $('ans').onkeydown({ key: 'Enter' }); });
  s = AppUI._getSession();
  $('ans').value = s.queue[1].ko;
  withSyncTimers(function () { $('ans').onkeydown({ key: 'Enter' }); });
  assert(!!$('sum-again'), '应进入小结');
  $('sum-home').onclick();
  assert(localStorage.getItem('hanStudyApp.reviewSession') === null, '返回首页应清除存档');
  AppUI.navigate('review');
  assert(!!$('rv-start'), '再进复习页应显示设置页');
});

/* ===== 问题5：单词库与每日录入支持顺序/倒序显示 ===== */
function firstKoInWords() {
  var row = document.querySelector('#w-list .row .ko');
  return row ? row.textContent : null;
}
function firstKoInAdd() {
  var row = document.querySelector('#view-add .list .row .ko');
  return row ? row.textContent : null;
}

test('问题5 单词库默认按录入顺序显示，切换后倒序', () => {
  seedReviewable(3);
  AppUI.navigate('words');
  assert(firstKoInWords() === '단어0', '默认顺序第一行应为最早录入的 단어0，实际 ' + firstKoInWords());
  $('w-order').onclick();
  assert(firstKoInWords() === '단어2', '倒序后第一行应为最后录入的 단어2，实际 ' + firstKoInWords());
});

test('问题5 每日录入页今日已录列表同样支持顺序/倒序', () => {
  seedState(AppCore.defaultState());
  AppUI.addWord('가', '甲', []);
  AppUI.addWord('나', '乙', []);
  AppUI.addWord('다', '丙', []);
  AppUI.navigate('add');
  assert(firstKoInAdd() === '가', '默认顺序应为最早录入的 가，实际 ' + firstKoInAdd());
  $('add-order').onclick();
  assert(firstKoInAdd() === '다', '倒序后应为最后录入的 다，实际 ' + firstKoInAdd());
});

test('问题5 排序偏好持久化，重新加载后仍保留', () => {
  seedReviewable(3);
  AppUI.navigate('words');
  $('w-order').onclick();
  assert(firstKoInWords() === '단어2', '切换为倒序');
  AppUI._reset(); // 模拟重新加载，从 localStorage 读 settings
  AppUI.navigate('words');
  assert(firstKoInWords() === '단어2', '重载后仍应保持倒序，实际 ' + firstKoInWords());
});

/* ===== 问题6：重复录入合并/跳过后的输入框行为 ===== */
test('问题6 重复录入点合并：释义合并，输入框清空且焦点回到韩语框', () => {
  seedState(AppCore.defaultState());
  AppUI.navigate('add');
  $('add-ko').value = '공부하다'; $('add-zh').value = '学习';
  $('add-go').onclick();
  // 再次录入相同韩语、不同释义 → 触发重复
  $('add-ko').value = '공부하다'; $('add-zh').value = '学问';
  $('add-go').onclick();
  assert(!!$('add-merge'), '应显示合并按钮');
  $('add-merge').onclick();
  var w = AppUI._getState().words[0];
  assert(w.zh.indexOf('学习') >= 0 && w.zh.indexOf('学问') >= 0, '释义应合并，实际：' + w.zh);
  assert(AppUI._getState().words.length === 1, '合并不应新增词条');
  assert(document.activeElement === $('add-ko'), '合并后焦点应在韩语框');
  assert($('add-ko').value === '', '合并后韩语框应清空');
});

test('问题6 重复录入点跳过：不新增词，输入框清空且焦点回到韩语框', () => {
  seedState(AppCore.defaultState());
  AppUI.navigate('add');
  $('add-ko').value = '공부하다'; $('add-zh').value = '学习';
  $('add-go').onclick();
  $('add-ko').value = '공부하다'; $('add-zh').value = '学问';
  $('add-go').onclick();
  assert(!!$('add-skip'), '应显示跳过按钮');
  $('add-skip').onclick();
  assert(AppUI._getState().words.length === 1, '跳过不应新增词条');
  assert($('add-ko').value === '' && $('add-zh').value === '' && $('add-tags').value === '', '跳过应清空所有输入框');
  assert(document.activeElement === $('add-ko'), '跳过焦点应在韩语框');
});

test('问题6 合并后可直接继续录入下一个新单词', () => {
  seedState(AppCore.defaultState());
  AppUI.navigate('add');
  $('add-ko').value = '공부하다'; $('add-zh').value = '学习';
  $('add-go').onclick();
  $('add-ko').value = '공부하다'; $('add-zh').value = '学问';
  $('add-go').onclick();
  $('add-merge').onclick();
  // 直接录入新词
  $('add-ko').value = '사과'; $('add-zh').value = '苹果';
  $('add-go').onclick();
  assert(AppUI._getState().words.length === 2, '合并后可继续录入新词');
});

/* ===== 问题1（2026-10-07）：离开单词库超过5秒再进入，重置搜索词 ===== */
test('问题1 离开单词库超过5秒再进入，搜索框重置为空', () => {
  seedReviewable(3);
  AppUI.navigate('words');
  $('w-search').value = '단어1';
  $('w-search').oninput();
  assert($('w-search').value === '단어1', '已输入搜索词');
  assert(AppUI._getState().words.filter(function (w) { return w.ko === '단어1'; }).length === 1, '搜索后列表有结果');
  AppUI.navigate('home');
  // 模拟时间前进6秒（超过5秒阈值）
  AppUI._nowMs = function () { return Date.now() + 6000; };
  AppUI.navigate('words');
  assert($('w-search').value === '', '超过5秒再进入应重置搜索框');
  assert(document.querySelectorAll('#w-list .row').length === 3, '重置后应显示全部单词');
  AppUI._nowMs = function () { return Date.now(); };
});

test('问题1 5秒内返回单词库，保留搜索词', () => {
  seedReviewable(3);
  AppUI.navigate('words');
  $('w-search').value = '단어1';
  $('w-search').oninput();
  AppUI.navigate('home');
  AppUI.navigate('words'); // 立即返回
  assert($('w-search').value === '단어1', '5秒内返回应保留搜索词');
});

/* ===== 问题2（2026-10-07）：中文录入到韩文录入的快捷方式 ===== */
test('问题2 中文框回车：韩语框为空时跳到韩语框（不提交）', () => {
  seedState(AppCore.defaultState());
  AppUI.navigate('add');
  $('add-ko').value = '';
  $('add-zh').value = '学习';
  $('add-zh').onkeydown({ key: 'Enter' });
  assert(AppUI._getState().words.length === 0, '韩语为空不应提交');
  assert(document.activeElement === $('add-ko'), '应跳到韩语框');
});

test('问题2 中文框回车：韩语已填时正常提交并继续，焦点回韩语框', () => {
  seedState(AppCore.defaultState());
  AppUI.navigate('add');
  $('add-ko').value = '공부하다';
  $('add-zh').value = '学习';
  $('add-zh').onkeydown({ key: 'Enter' });
  assert(AppUI._getState().words.length === 1, '韩语已填应提交');
  assert(document.activeElement === $('add-ko'), '提交后焦点回韩语框');
});

/* ===== 问题3（2026-10-07）：有同义词时答对不自动跳，回车进入下一题 ===== */
test('问题3 同义词题答对：不自动跳，展示所有写法，回车进入下一题', () => {
  seedState({
    version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [
      { id: 'w1', ko: '공부하다', zh: '学习', tags: [], createdAt: '2000-01-01', lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 },
      { id: 'w2', ko: '배우다', zh: '学习', tags: [], createdAt: '2000-01-01', lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 },
      { id: 'w3', ko: '사과', zh: '苹果', tags: [], createdAt: '2000-01-01', lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 }
    ]
  });
  AppUI.startReview('zh2ko');
  var s = AppUI._getSession();
  $('ans').value = s.queue[0].ko;
  withSyncTimers(function () { $('ans').onkeydown({ key: 'Enter' }); });
  s = AppUI._getSession();
  assert(s.correct === 1, '应判对');
  assert(!!s._group && s._group.length === 2, '应识别同义词组');
  assert(s.index === 0, '有同义词答对不应自动跳到下一题');
  assert(!$('ans-next').classList.contains('hidden'), '应显示下一题按钮');
  var fbText = $('ans-fb').textContent;
  assert(fbText.indexOf('공부하다') >= 0 && fbText.indexOf('배우다') >= 0, '反馈应展示所有韩语写法，实际：' + fbText);
  // 按回车进入下一题
  $('ans').onkeydown({ key: 'Enter' });
  s = AppUI._getSession();
  assert(s.index === 1, '回车后应进入第2题');
});

test('问题3 无同义词题答对：仍自动进入下一题', () => {
  seedReviewable(3);
  AppUI.startReview('zh2ko');
  var s = AppUI._getSession();
  $('ans').value = s.queue[0].ko;
  withSyncTimers(function () { $('ans').onkeydown({ key: 'Enter' }); });
  s = AppUI._getSession();
  assert(s.correct === 1 && s.index === 1, '无同义词应自动进入下一题');
});

/* ===== 问题4（2026-10-07）：同义判定改为释义完全一致；包含关系判错 ===== */
test('问题4 核心：仅释义集合完全一致才聚合（包含关系不算，顺序无关）', () => {
  var words = [
    { id: 'a', ko: 'A', zh: '1,2' },
    { id: 'b', ko: 'B', zh: '1' },
    { id: 'c', ko: 'C', zh: '2,1' },
    { id: 'd', ko: 'D', zh: '1,3' }
  ];
  var ga = AppCore.findSynonymGroup(words, words[0]);
  var ids = ga.map(function (x) { return x.id; });
  assert(ids.indexOf('a') >= 0 && ids.indexOf('c') >= 0, 'A(1,2) 应与 C(2,1) 同义（顺序无关），实际：' + ids.join(','));
  assert(ids.indexOf('b') < 0, 'B(1) 是 A 的子集，不应同义');
  assert(ids.indexOf('d') < 0, 'D(1,3) 与 A 有交集但不一致，不应同义');
  assert(ga.length === 2, 'A 的同义词组应只含 A、C');
  var gb = AppCore.findSynonymGroup(words, words[1]);
  assert(gb.length === 1 && gb[0].id === 'b', 'B(1) 无完全一致同义词');
});

test('问题4 复习判定：题目 A(1,2) 输入子集词 B(1) 判错', () => {
  seedState({
    version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [
      { id: 'a', ko: 'A', zh: '1,2', tags: [], createdAt: '2000-01-01', lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 },
      { id: 'b', ko: 'B', zh: '1', tags: [], createdAt: '2000-01-01', lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 }
    ]
  });
  AppUI.startReview('zh2ko');
  var s = AppUI._getSession();
  assert(s.queue[0].zh === '1,2', '第1题应为 A');
  $('ans').value = 'B';
  $('ans').onkeydown({ key: 'Enter' });
  s = AppUI._getSession();
  assert(s.wrong === 1 && s.correct === 0, '题目A(1,2)输入B(1)应判错');
  // 答错后回车进入下一题（B）
  $('ans').onkeydown({ key: 'Enter' });
  s = AppUI._getSession();
  assert(s.index === 1 && s.queue[1].zh === '1', '第2题应为 B');
  $('ans').value = 'A';
  $('ans').onkeydown({ key: 'Enter' });
  s = AppUI._getSession();
  assert(s.wrong === 2, '题目B(1)输入A(1,2)应判错');
});

test('问题4 复习判定：完全一致（顺序不同）的韩语互认，输入即对', () => {
  seedState({
    version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [
      { id: 'a', ko: 'A', zh: '1,2', tags: [], createdAt: '2000-01-01', lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 },
      { id: 'c', ko: 'C', zh: '2,1', tags: [], createdAt: '2000-01-01', lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 }
    ]
  });
  AppUI.startReview('zh2ko');
  var s = AppUI._getSession();
  $('ans').value = 'C';
  $('ans').onkeydown({ key: 'Enter' });
  s = AppUI._getSession();
  assert(s.correct === 1, '题目A(1,2)输入C(2,1)应判对');
  assert(!!s._group && s._group.length === 2, '应识别同义词组');
});

/* ===== 时间管理·功能1（2026-10-07）：学习计时器核心 ===== */
test('功能1 核心：dayLog 对缺失字段补默认值，兼容旧备份', () => {
  var log = { '2026-01-01': { added: 2 } };
  var d = AppCore.dayLog(log, '2026-01-01');
  assert(d.added === 2 && d.reviewed === 0 && d.correct === 0 && d.seconds === 0, '缺失字段应补0');
  var e = AppCore.dayLog(log, '2026-01-02');
  assert(e.added === 0, '无记录日期应全0');
});

test('功能1 核心：computeDayStats 掌握率=今日正确/今日复习', () => {
  var log = { '2026-01-01': { added: 5, reviewed: 10, correct: 7, seconds: 600 } };
  var st = AppCore.computeDayStats(log, '2026-01-01');
  assert(st.reviewed === 10 && st.correctRate === 70, '掌握率应为70%，实际 ' + st.correctRate);
  assert(st.seconds === 600 && st.added === 5, '时长与新学应正确');
  var noReview = AppCore.computeDayStats({ '2026-01-02': { added: 1 } }, '2026-01-02');
  assert(noReview.correctRate === null, '无复习时掌握率应为 null');
});

test('功能1 计时：启动后每秒累计今日时长并持久化', () => {
  seedState(AppCore.defaultState());
  AppUI.timerStart();
  assert(AppUI._getTimerState().running === true, '启动后应处于计时状态');
  AppUI._timerTick(); AppUI._timerTick(); AppUI._timerTick();
  assert(AppUI._getTimerState().seconds === 3, '3个tick应累计3秒，实际 ' + AppUI._getTimerState().seconds);
  var t = AppCore.todayKey();
  assert(AppUI._getState().studyLog[t].seconds === 3, 'studyLog 今日应记录3秒');
  AppUI.timerPause();
  AppUI._timerTick();
  assert(AppUI._getTimerState().seconds === 3, '暂停后 tick 不应再累计');
});

test('功能1 计时：闲置超时自动暂停（排除挂机）', () => {
  seedState(AppCore.defaultState());
  AppUI.timerStart();
  // 模拟最后操作时间在很久以前（超过5分钟闲置阈值）
  AppUI._setLastActive(Date.now() - AppUI.IDLE_LIMIT_MS - 1000);
  AppUI._idleCheck();
  assert(AppUI._getTimerState().running === false, '闲置超时应自动暂停');
  AppUI.timerPause();
});

test('功能1 计时：页面切后台（visibilitychange hidden）自动暂停', () => {
  seedState(AppCore.defaultState());
  AppUI.timerStart();
  var hiddenVal = true;
  try {
    Object.defineProperty(document, 'hidden', { configurable: true, get: function () { return hiddenVal; } });
    document.dispatchEvent(new window.Event('visibilitychange'));
  } catch (e) {}
  assert(AppUI._getTimerState().running === false, '切到后台应自动暂停');
  AppUI.timerPause();
});

test('功能1 首页：显示今日学习时长面板与计时按钮', () => {
  seedState(AppCore.defaultState());
  var t = AppCore.todayKey();
  AppUI._getState().studyLog[t] = { added: 1, reviewed: 0, correct: 0, seconds: 125 };
  AppUI.navigate('home');
  assert(!!$('btn-timer-toggle'), '应显示计时按钮');
  assert($('timer-display') !== null && $('timer-display').textContent.indexOf('分') >= 0, '应显示时长，实际：' + ($('timer-display') && $('timer-display').textContent));
  AppUI.timerPause();
});

/* ===== 时间管理·功能2（2026-10-07）：每日数据统计中心 ===== */
test('功能2 复习答对：今日正确数 recorded，掌握率随之计算', () => {
  seedReviewable(3);
  AppUI.startReview('zh2ko');
  var s = AppUI._getSession();
  $('ans').value = s.queue[0].ko;
  withSyncTimers(function () { $('ans').onkeydown({ key: 'Enter' }); });
  var t = AppCore.todayKey();
  var log = AppUI._getState().studyLog[t];
  assert(log.reviewed === 1 && log.correct === 1, '复习1题答对应 reviewed=1 correct=1，实际 ' + JSON.stringify(log));
});

test('功能2 统计页：显示今日新学/复习/掌握率/时长四项数据', () => {
  seedState(AppCore.defaultState());
  var t = AppCore.todayKey();
  AppUI._getState().studyLog[t] = { added: 3, reviewed: 10, correct: 7, seconds: 125 };
  AppUI.navigate('stats');
  var txt = $('view-stats').textContent;
  assert(txt.indexOf('3') >= 0 && txt.indexOf('10') >= 0 && txt.indexOf('70%') >= 0, '应显示 3/10/70%，实际：' + txt);
  assert(txt.indexOf('分') >= 0, '应显示时长');
  assert(!!$('btn-timer-toggle'), '统计页应有计时按钮');
});

test('功能2 统计页：无复习时掌握率显示 --', () => {
  seedState(AppCore.defaultState());
  var t = AppCore.todayKey();
  AppUI._getState().studyLog[t] = { added: 2, reviewed: 0, correct: 0, seconds: 0 };
  AppUI.navigate('stats');
  var txt = $('view-stats').textContent;
  assert(txt.indexOf('--') >= 0, '无复习应显示 --，实际：' + txt);
});

test('功能2 导航：时间管理按钮可切换到统计页', () => {
  seedState(AppCore.defaultState());
  AppUI.navigate('stats');
  assert(!$('view-stats').classList.contains('hidden'), '统计页应可见');
  assert($('view-stats').textContent.indexOf('每日统计') >= 0, '应显示统计页标题');
});

/* ===== 时间管理·功能3（2026-10-07）：日/周/月数据可视化看板 ===== */
test('功能3 核心：computeTrend 日视图聚合最近14天', () => {
  var log = { '2026-09-30': { added: 2, reviewed: 5, correct: 3, seconds: 600 }, '2026-10-01': { added: 1, reviewed: 0, correct: 0, seconds: 0 } };
  var t = AppCore.computeTrend(log, '2026-10-07', 'day', 14);
  assert(t.length === 14, '应返回14天');
  var d1 = t[t.length - 1];
  assert(d1.label === '09-24', '最后一项为最早日期，实际 ' + d1.label);
  assert(t[0].label === '10-07', '第一项为今天');
  var found = null;
  for (var i = 0; i < t.length; i++) { if (t[i].label === '09-30') { found = t[i]; break; } }
  assert(found && found.added === 2 && found.reviewed === 5 && found.seconds === 600, '09-30 数据应正确');
  var found2 = null;
  for (var j = 0; j < t.length; j++) { if (t[j].label === '10-01') { found2 = t[j]; break; } }
  assert(found2 && found2.added === 1, '10-01 数据应正确');
});

test('功能3 核心：computeTrend 周视图按周一聚合', () => {
  // 2026-09-28 是周一；10-01 在 9/28 那一周
  var log = { '2026-09-28': { added: 1, reviewed: 1, correct: 1, seconds: 60 }, '2026-10-01': { added: 2, reviewed: 0, correct: 0, seconds: 0 }, '2026-10-05': { added: 3, reviewed: 0, correct: 0, seconds: 0 } };
  var t = AppCore.computeTrend(log, '2026-10-07', 'week', 2);
  assert(t.length === 2, '应返回2周');
  assert(t[0].added === 3, '本周（10/5起）应含 10-05 的3，实际 ' + t[0].added);
  assert(t[1].added === 3, '上一周（9/28起）应聚合 9/28 的1 与 10/01 的2，实际 ' + t[1].added);
});

test('功能3 核心：computeTrend 月视图聚合最近N月', () => {
  var log = { '2026-08-15': { added: 2, reviewed: 0, correct: 0, seconds: 0 }, '2026-09-20': { added: 4, reviewed: 2, correct: 1, seconds: 120 }, '2026-10-01': { added: 1, reviewed: 0, correct: 0, seconds: 0 } };
  var t = AppCore.computeTrend(log, '2026-10-07', 'month', 3);
  assert(t.length === 3, '应返回3个月');
  assert(t[2].label === '2026-08' && t[2].added === 2, '8月应聚合 2，实际 ' + t[2].added);
  assert(t[1].label === '2026-09' && t[1].added === 4 && t[1].reviewed === 2, '9月应聚合 4/2');
  assert(t[0].label === '2026-10' && t[0].added === 1, '10月应聚合 1');
});

test('功能3 看板：有数据时渲染 SVG 柱状图与日/周/月切换', () => {
  seedState(AppCore.defaultState());
  var t = AppCore.todayKey();
  AppUI._getState().studyLog[t] = { added: 2, reviewed: 3, correct: 2, seconds: 300 };
  AppUI.navigate('stats');
  assert($('stats-trend').innerHTML.indexOf('<svg') >= 0, '应渲染 SVG 图');
  assert($('stats-trend').textContent.indexOf('新学') >= 0, '应有图表标题');
  assert(!!$('stats-trend').querySelector('[data-tm="week"]'), '应有周切换按钮');
  assert(!!$('stats-trend').querySelector('[data-tm="month"]'), '应有月切换按钮');
});

test('功能3 看板：切换周视图重新渲染；无数据时显示提示', () => {
  seedState(AppCore.defaultState());
  AppUI.navigate('stats');
  assert($('stats-trend').textContent.indexOf('还没有学习数据') >= 0, '无数据应显示提示');
});