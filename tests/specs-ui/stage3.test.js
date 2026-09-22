// 阶段3：UI 页面与交互冒烟测试（jsdom 模拟真实操作）
function seed(stateObj) {
  localStorage.clear();
  localStorage.setItem(AppCore.STORAGE_KEY, JSON.stringify(stateObj));
  AppUI._reset();
}
function today() { return AppCore.todayKey(); }
function yday() { var d = new Date(); d.setDate(d.getDate() - 1); return AppCore.todayKey(d); }
function baseWord(over) {
  return Object.assign({
    id: 'w_' + Math.random().toString(36).slice(2),
    ko: '가다', zh: '去', tags: [], createdAt: yday(),
    lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0
  }, over);
}

test('启动后默认进入首页，侧边栏 6 个导航齐全', () => {
  seed(AppCore.defaultState());
  assert(!$('view-home').classList.contains('hidden'), '首页应可见');
  assert(document.querySelectorAll('#nav .nav-btn').length === 6, '应有 6 个导航');
});

test('快捷录入后首页统计与持久化更新', () => {
  seed(AppCore.defaultState());
  var res = AppUI.addWord('배우다', '学习', []);
  assert(res.status === 'added', '添加成功');
  var homeText = $('view-home').textContent;
  assert(homeText.indexOf('1') >= 0, '首页应显示今日新录入 1');
  var raw = localStorage.getItem(AppCore.STORAGE_KEY);
  assert(raw.indexOf('배우다') >= 0, '已写入本地存储');
});

test('重复录入返回 duplicate 状态', () => {
  seed(AppCore.defaultState());
  AppUI.addWord('가다', '去', []);
  var res = AppUI.addWord('가다', '走', []);
  assert(res.status === 'duplicate', '应识别重复');
});

test('单词库列表显示全部单词', () => {
  seed({
    version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [baseWord({ ko: '사과', zh: '苹果' }), baseWord({ ko: '나무', zh: '树' })]
  });
  AppUI.navigate('words');
  var txt = $('view-words').textContent;
  assert(txt.indexOf('사과') >= 0 && txt.indexOf('나무') >= 0, '两个单词都应显示');
});

test('搜索框过滤单词', () => {
  seed({
    version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [baseWord({ ko: '사과', zh: '苹果' }), baseWord({ ko: '나무', zh: '树' })]
  });
  AppUI.navigate('words');
  $('w-search').value = '사과';
  $('w-search').oninput();
  var txt = $('view-words').textContent;
  assert(txt.indexOf('사과') >= 0, '应包含사과');
  assert(txt.indexOf('나무') < 0, '不应包含나무');
});

test('复习流程：答错进错题、小结正确', () => {
  seed({
    version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [baseWord({ ko: '공부하다', zh: '学习' })]
  });
  AppUI.navigate('review');
  AppUI.startReview('zh2ko');
  var s = AppUI._getSession();
  assert(s && s.queue.length === 1, '应出 1 道题');
  assert($('view-review').textContent.indexOf('学习') >= 0, '中→韩 应显示中文题目');
  AppUI.submitAnswer('틀린답');
  assert($('ans-fb').textContent.indexOf('공부하다') >= 0, '应显示正确答案');
  var w = AppUI._getState().words[0];
  assert(w.isError === true && w.correctStreak === 0, '答错应进错题');
  AppUI.nextQuestion();
  assert($('view-review').textContent.indexOf('新增错题') >= 0, '应进入小结');
});

test('错题连续答对 3 次自动移出', () => {
  seed({
    version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [baseWord({ ko: '공부하다', zh: '学习', isError: true, errorSince: yday(), correctStreak: 0 })]
  });
  function oneRoundRight() {
    AppUI.startReview('zh2ko');
    assert(AppUI._getSession().queue.length === 1, '本轮 1 道错题');
    AppUI.submitAnswer('공부하다');
    AppUI.nextQuestion();
  }
  oneRoundRight();
  assert(AppUI._getState().words[0].correctStreak === 1, '第1次答对 streak=1');
  oneRoundRight();
  assert(AppUI._getState().words[0].correctStreak === 2, '第2次答对 streak=2');
  oneRoundRight();
  var w = AppUI._getState().words[0];
  assert(w.isError === false && w.correctStreak === 0, '连续3次答对应移出错题');
  AppUI.navigate('errors');
  assert($('view-errors').textContent.indexOf('错题库是空的') >= 0, '错题库应为空');
});

test('韩→中模式显示韩语题目', () => {
  seed({
    version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [baseWord({ ko: '바나나', zh: '香蕉' })]
  });
  AppUI.navigate('review');
  AppUI.startReview('ko2zh');
  assert($('view-review').textContent.indexOf('바나나') >= 0, '应显示韩语题目');
  AppUI.submitAnswer('香蕉');
  assert($('ans-fb').textContent.indexOf('答对') >= 0, '应判对');
});

test('只刷错题开关只出错误题', () => {
  seed({
    version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [baseWord({ ko: '평범', zh: '普通' }), baseWord({ ko: '틀린말', zh: '错话', isError: true, errorSince: yday(), correctStreak: 0 })]
  });
  AppUI._setOnlyErrors(true);
  AppUI.navigate('review');
  AppUI.startReview('ko2zh');
  var q = AppUI._getSession().queue;
  assert(q.length === 1 && q[0].ko === '틀린말', '只刷错题应只出错误题');
  AppUI._setOnlyErrors(false);
});

test('设置保存生效并可恢复默认', () => {
  seed(AppCore.defaultState());
  AppUI.saveSettings(5, 2);
  var st = AppUI._getState().settings;
  assert(st.roundSize === 5 && st.removeAfter === 2, '设置应保存为 5/2');
  AppUI.resetSettings();
  st = AppUI._getState().settings;
  assert(st.roundSize === 20 && st.removeAfter === 3, '恢复默认应为 20/3');
});

test('导出后导入可完整恢复', () => {
  seed({
    version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [baseWord({ ko: '복사', zh: '备份' })]
  });
  var text = AppUI.doExport();
  AppUI.addWord('새단어', '新词', []);
  assert(AppUI._getState().words.length === 2, '添加后应为 2 词');
  var res = AppUI.doImport(text);
  assert(res.ok, '导入应成功');
  assert(AppUI._getState().words.length === 1, '导入后恢复为 1 词');
});

test('导入损坏文件返回错误且不覆盖数据', () => {
  seed({
    version: 1, settings: { roundSize: 20, removeAfter: 3 }, studyLog: {},
    words: [baseWord({ ko: '그대로', zh: '原样' })]
  });
  var res = AppUI.doImport('坏文件{{{');
  assert(res.ok === false, '应失败');
  assert(AppUI._getState().words.length === 1, '原数据不应被覆盖');
});
