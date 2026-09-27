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
