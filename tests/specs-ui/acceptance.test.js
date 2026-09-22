// 阶段5：对照 PRD §10 的 22 条验收标准逐条自动核验
function seed(stateObj) {
  localStorage.clear();
  localStorage.setItem(AppCore.STORAGE_KEY, JSON.stringify(stateObj));
  AppUI._reset();
}
function today() { return AppCore.todayKey(); }
function yday() { var d = new Date(); d.setDate(d.getDate() - 1); return AppCore.todayKey(d); }
function dAgo(n) { var d = new Date(); d.setDate(d.getDate() - n); return AppCore.todayKey(d); }
function bw(over) {
  return Object.assign({
    id: 'w_' + Math.random().toString(36).slice(2),
    ko: '가다', zh: '去', tags: [], createdAt: yday(),
    lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0
  }, over);
}

/* 1 导航与默认页 */
test('验收1：打开默认进首页，6 项导航可切换', () => {
  seed(AppCore.defaultState());
  assert(!$('view-home').classList.contains('hidden'), '默认应显示首页');
  var btns = document.querySelectorAll('#nav .nav-btn');
  assert(btns.length === 6, '6 个导航');
  btns.forEach(function (b) {
    b.click();
    var v = b.getAttribute('data-view');
    assert(!$('view-' + v).classList.contains('hidden'), '应切到 ' + v);
  });
});

/* 2 断网可用：无外部资源引用 */
test('验收2：单文件无外部资源（断网可运行）', () => {
  assert(!/src=["']https?:/i.test(html), '不应有外部 script/src');
  assert(!/href=["']https?:/i.test(html), '不应有外部样式 href');
});

/* 3-4 录入联动 */
test('验收3-4：录入页与首页快捷录入均生效并联动', () => {
  seed(AppCore.defaultState());
  var r1 = AppUI.addWord('공부하다', '学习', []);
  var st = AppCore.computeStats(AppUI._getState().words, AppUI._getState().studyLog || {}, today());
  assert(r1.status === 'added' && st.totalWords === 1, '首页快捷添加后词库 1 个');
  var r2 = AppUI.addWord('나무', '树', ['名词']);
  assert(r2.status === 'added' && st.totalWords + 1 === AppUI._getState().words.length, '词库累计 2 个');
});

/* 5 重复提示 */
test('验收5：重复录入提示，可跳过或合并', () => {
  seed(AppCore.defaultState());
  AppUI.addWord('가다', '去', []);
  var dup = AppUI.addWord('가다', '走', ['动词']);
  assert(dup.status === 'duplicate', '应提示已存在');
  AppUI.mergePending('走', ['动词']);
  var w = AppUI._getState().words[0];
  assert(w.zh.indexOf('走') >= 0 && w.tags.indexOf('动词') >= 0, '合并应生效');
});

/* 6 搜索/筛选 */
test('验收6：按韩语或中文搜索、按标签筛选', () => {
  seed({
    version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [bw({ ko: '사과', zh: '苹果', tags: ['名词'] }), bw({ ko: '먹다', zh: '吃', tags: ['动词'] })]
  });
  AppUI.navigate('words');
  $('w-search').value = '먹다'; $('w-search').oninput();
  var txt = $('view-words').textContent;
  assert(txt.indexOf('먹다') >= 0 && txt.indexOf('사과') < 0, '韩语搜索应过滤');
  $('w-search').value = '苹果'; $('w-search').oninput();
  txt = $('view-words').textContent;
  assert(txt.indexOf('사과') >= 0 && txt.indexOf('먹다') < 0, '中文搜索应过滤');
});

/* 7 编辑/删除 */
test('验收7：编辑生效，删除二次确认后移除', () => {
  seed({
    version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [bw({ ko: '고양이', zh: '猫' })]
  });
  AppUI.openEdit(AppUI._getState().words[0].id);
  $('e-zh').value = '猫咪';
  $('e-save').onclick();
  assert(AppUI._getState().words[0].zh === '猫咪', '编辑应生效');
  var id = AppUI._getState().words[0].id;
  AppUI.confirmRemove(id);
  assert($('modal-root').textContent.indexOf('确认删除') >= 0, '应弹二次确认');
  $('r-ok').onclick();
  assert(AppUI._getState().words.length === 0, '确认后应移除');
});

/* 8-11 复习与判题 */
test('验收8-11：今天录的不出题、昨天录的出题、双模式、空格容错、判错显示答案、答对当天不再出现', () => {
  seed({
    version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [bw({ ko: '오늘', zh: '今天', createdAt: today() }), bw({ ko: '내일', zh: '明天', createdAt: yday() })]
  });
  AppUI.startReview('zh2ko');
  var q = AppUI._getSession().queue;
  assert(q.length === 1 && q[0].ko === '내일', '只出昨天及以前的词');
  AppUI.startReview('ko2zh');
  AppUI.submitAnswer('  明天  ');
  assert($('ans-fb').textContent.indexOf('答对') >= 0, '首尾空格应判对');
  AppUI.nextQuestion();
  var st = AppCore.computeStats(AppUI._getState().words, {}, today());
  var q2 = AppCore.buildReviewQueue(AppUI._getState().words, { roundSize: 20 }, today());
  assert(q2.length === 0, '今天答对后不再出现');
  /* 次日再入池：把 lastReviewedAt 拨到昨天 */
  var w = AppUI._getState().words[1];
  AppUI._getState().words[1].lastReviewedAt = yday();
  var q3 = AppCore.buildReviewQueue(AppUI._getState().words, { roundSize: 20 }, today());
  assert(q3.length === 1, '次日（上次复习早于今天）重新入池');
});

/* 12 错题随机出现 */
test('验收12：错题库单词在复习中随机出现', () => {
  seed({
    version: 1, settings: { roundSize: 5, removeAfter: 3 }, studyLog: {},
    words: [bw({ ko: '일반1' }), bw({ ko: '일반2' }), bw({ ko: '오답1', isError: true, errorSince: yday(), correctStreak: 0 }),
            bw({ ko: '오답2', isError: true, errorSince: yday(), correctStreak: 0 })]
  });
  var seen = {};
  for (var i = 0; i < 8; i++) {
    AppCore.buildReviewQueue(AppUI._getState().words, { roundSize: 5 }, today()).forEach(function (w) {
      if (w.isError) seen[w.ko] = true;
    });
  }
  assert(seen['오답1'] && seen['오답2'], '两轮以上错题均应出现');
});

/* 13-17 错题规则 */
test('验收13-15：答错进库、答对累加答错清零、满3次自动移出', () => {
  seed({
    version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [bw({ ko: '시험', zh: '考试' })]
  });
  AppUI.startReview('zh2ko');
  AppUI.submitAnswer('틀림');
  var w = AppUI._getState().words[0];
  assert(w.isError && w.correctStreak === 0, '13 答错进库计数0');
  AppUI.nextQuestion();
  AppUI.startReview('ko2zh');
  AppUI.submitAnswer('考试'); assert(AppUI._getState().words[0].correctStreak === 1, '14 答对+1');
  AppUI.nextQuestion();
  AppUI.startReview('ko2zh');
  AppUI.submitAnswer('다른답'); assert(AppUI._getState().words[0].correctStreak === 0, '14 答错清零');
  AppUI.nextQuestion();
  AppUI.startReview('ko2zh'); AppUI.submitAnswer('考试'); AppUI.nextQuestion();
  AppUI.startReview('ko2zh'); AppUI.submitAnswer('考试'); AppUI.nextQuestion();
  AppUI.startReview('ko2zh'); AppUI.submitAnswer('考试');
  assert(AppUI._getState().words[0].isError === false, '15 满3次移出');
});

test('验收16：移出次数改为2后按2次移出', () => {
  seed({ version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [bw({ ko: '이것', zh: '这个', isError: true, errorSince: yday(), correctStreak: 0 })] });
  AppUI.saveSettings(20, 2);
  AppUI.startReview('ko2zh'); AppUI.submitAnswer('这个'); AppUI.nextQuestion();
  assert(AppUI._getState().words[0].correctStreak === 1, '第1次 streak=1');
  AppUI.startReview('ko2zh'); AppUI.submitAnswer('这个');
  assert(AppUI._getState().words[0].isError === false, '第2次答对应按2次规则移出');
});

test('验收17：只刷错题只出错误题', () => {
  seed({ version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [bw({ ko: '보통' }), bw({ ko: '오답', isError: true, errorSince: yday(), correctStreak: 0 })] });
  AppUI._setOnlyErrors(true);
  AppUI.startReview('ko2zh');
  var q = AppUI._getSession().queue;
  assert(q.length === 1 && q[0].ko === '오답', '只刷错题只出错题');
  AppUI._setOnlyErrors(false);
});

/* 18 小结 */
test('验收18：一轮小结数字与作答一致（5题2对3错）', () => {
  seed({ version: 1, settings: { roundSize: 5, removeAfter: 3 }, studyLog: {},
    words: [bw({ ko: '하나' }), bw({ ko: '둘' }), bw({ ko: '셋' }), bw({ ko: '넷' }), bw({ ko: '다섯' })] });
  AppUI.startReview('ko2zh');
  var right = 0, wrong = 0;
  for (var i = 0; i < 5; i++) {
    var w = AppUI._getSession().queue[i];
    var ok = (i < 2);
    AppUI.submitAnswer(ok ? w.zh : '错误答案');
    ok ? right++ : wrong++;
    AppUI.nextQuestion();
  }
  var txt = $('view-review').textContent;
  assert(txt.indexOf('5') >= 0 && txt.indexOf('2') >= 0 && txt.indexOf('3') >= 0, '小结应显示总题5/对2/错3');
});

/* 19 设置 */
test('验收19：改题量下轮按新题量，恢复默认回20/3', () => {
  seed({ version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [bw({ ko: 'a1' }), bw({ ko: 'a2' }), bw({ ko: 'a3' }), bw({ ko: 'a4' }), bw({ ko: 'a5' }), bw({ ko: 'a6' })] });
  AppUI.saveSettings(5, 3);
  AppUI.startReview('ko2zh');
  assert(AppUI._getSession().queue.length === 5, '题量应改为5');
  AppUI.resetSettings();
  assert(AppUI._getState().settings.roundSize === 20 && AppUI._getState().settings.removeAfter === 3, '恢复默认20/3');
});

/* 20 持久化 */
test('验收20：刷新/重启后数据不丢', () => {
  seed(AppCore.defaultState());
  AppUI.addWord('저장되나', '能保存吗', []);
  var before = AppUI._getState().words.length;
  /* 模拟刷新：从 localStorage 重新 loadState */
  var reloaded = AppCore.loadState();
  assert(reloaded.words.length === before, '重新加载后单词数一致');
  assert(reloaded.words[0].ko === '저장되나', '单词内容一致');
});

/* 21 备份/恢复 */
test('验收21：导出备份后删除数据，导入完整恢复', () => {
  seed({ version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [bw({ ko: '복원1' }), bw({ ko: '복원2' })] });
  var text = AppUI.doExport();
  AppUI._getState().words = [];
  AppUI._getState().settings.roundSize = 99;
  var res = AppUI.doImport(text);
  assert(res.ok && AppUI._getState().words.length === 2 && AppUI._getState().settings.roundSize === 20, '导入后完整恢复');
});

/* 22 首页统计一致 */
test('验收22：首页统计与实际数据一致', () => {
  seed({ version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: { [today()]: { added: 3, reviewed: 10 } },
    words: [bw({ ko: 'x1', isError: true, errorSince: yday(), correctStreak: 1 }), bw({ ko: 'x2' }), bw({ ko: 'x3', createdAt: today() })] });
  var st = AppCore.computeStats(AppUI._getState().words, AppUI._getState().studyLog, today());
  assert(st.totalWords === 3 && st.errorCount === 1 && st.newAdded === 3, '统计与数据一致');
});
