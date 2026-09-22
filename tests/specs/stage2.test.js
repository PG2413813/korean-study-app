// 阶段2：核心算法
const A = global.AppCore;
const T = '2026-09-21'; // 固定“今天”，保证测试可复现

function w(over) {
  return Object.assign({
    id: 'w_' + Math.random().toString(36).slice(2),
    ko: '가다', zh: '去', tags: [],
    createdAt: '2026-09-20', lastReviewedAt: null,
    isError: false, errorSince: null, correctStreak: 0
  }, over);
}

/* --- normalize / 释义拆分 --- */
test('normalizeText 去除首尾空格', () => {
  assert(A.normalizeText('  공부하다  ') === '공부하다');
  assert(A.normalizeText(null) === '');
});
test('splitMeanings 按分隔符拆分多释义', () => {
  const m = A.splitMeanings('学习；学问，练习/复习');
  assert(m.length === 4 && m[0] === '学习' && m[3] === '复习', '拆分结果: ' + m.join('|'));
});

/* --- 判题 --- */
test('判题 中→韩：忽略首尾空格，其余精确匹配', () => {
  assert(A.judgeAnswer('  가다 ', '가다', 'zh2ko') === true, '带空格应判对');
  assert(A.judgeAnswer('가다요', '가다', 'zh2ko') === false, '多字应判错');
  assert(A.judgeAnswer('', '가다', 'zh2ko') === false, '空输入应判错');
});
test('判题 韩→中：多释义任一匹配即对', () => {
  assert(A.judgeAnswer('学问', '学习；学问', 'ko2zh') === true, '匹配第二个释义应判对');
  assert(A.judgeAnswer('学习', '学习、学问', 'ko2zh') === true, '匹配第一个释义应判对');
  assert(A.judgeAnswer('工作', '学习；学问', 'ko2zh') === false, '不匹配应判错');
});

/* --- 首页统计 --- */
test('computeStats：待复习/错题/总数口径正确', () => {
  const words = [
    w({ id: 'a', createdAt: '2026-09-20', lastReviewedAt: null }),          // 待复习
    w({ id: 'b', createdAt: T, lastReviewedAt: null }),                    // 今天新录，不算
    w({ id: 'c', createdAt: '2026-09-20', lastReviewedAt: T }),            // 今天已复习，不算
    w({ id: 'd', createdAt: '2026-09-20', isError: true, correctStreak: 1 }) // 错题，不算待复习
  ];
  const st = A.computeStats(words, { [T]: { added: 2, reviewed: 1 } }, T);
  assert(st.dueReview === 1, '待复习应为 1，实际 ' + st.dueReview);
  assert(st.errorCount === 1, '错题数应为 1');
  assert(st.totalWords === 4, '总数应为 4');
  assert(st.newAdded === 2, '今日新录应为 2');
});
test('连续学习天数：今天有学习动作从今天起算', () => {
  const log = { [T]: { added: 1 }, '2026-09-20': { reviewed: 1 }, '2026-09-19': { added: 1 } };
  assert(A.consecutiveStudyDays(log, T) === 3, '应连续 3 天');
});
test('连续学习天数：今天无动作从昨天起算', () => {
  const log = { '2026-09-20': { added: 1 }, '2026-09-19': { reviewed: 1 } };
  assert(A.consecutiveStudyDays(log, T) === 2, '应连续 2 天');
});
test('连续学习天数：断档即终止', () => {
  const log = { [T]: { added: 1 }, '2026-09-19': { added: 1 } };
  assert(A.consecutiveStudyDays(log, T) === 1, '09-20 缺失，只算今天 1 天');
});

/* --- 复习队列 --- */
test('队列：普通词按最久未复习优先，错题当天已复习仍可出现', () => {
  const words = [
    w({ id: 'n1', createdAt: '2026-09-18', lastReviewedAt: null }),
    w({ id: 'n2', createdAt: '2026-09-19', lastReviewedAt: '2026-09-20' }),
    w({ id: 'n3', createdAt: '2026-09-20', lastReviewedAt: '2026-09-19' }),
    w({ id: 'n4', createdAt: '2026-09-18', lastReviewedAt: T }),           // 今天已复习，不进队列
    w({ id: 'e1', createdAt: '2026-09-20', lastReviewedAt: T, isError: true, correctStreak: 0 }) // 错题，当天已复习也进
  ];
  const q = A.buildReviewQueue(words, { roundSize: 3, removeAfter: 3 }, T, { rand: () => 0 });
  assert(q.length === 3, '题量应为 3，实际 ' + q.length);
  assert(q.map(x => x.id).indexOf('e1') >= 0, '错题 e1 应进队列');
  assert(q.map(x => x.id).indexOf('n4') < 0, '今天已复习的普通词 n4 不应出现');
  // 普通词相对顺序：null 先，再按最久未复习：n3(09-19) 早于 n2(09-20)
  const normalsInQ = q.filter(x => !x.isError).map(x => x.id);
  assert(JSON.stringify(normalsInQ) === JSON.stringify(['n1', 'n3']), '普通词顺序应为 [n1,n3]，实际 ' + normalsInQ.join(','));
});
test('队列：错题数 >= 题量时只出错题', () => {
  const words = [
    w({ id: 'e1', isError: true }), w({ id: 'e2', isError: true }), w({ id: 'e3', isError: true })
  ];
  const q = A.buildReviewQueue(words, { roundSize: 2 }, T, { rand: () => 0 });
  assert(q.length === 2 && q.every(x => x.isError), '应只出 2 道错题');
});
test('队列：onlyErrors 只刷错题，忽略普通词', () => {
  const words = [w({ id: 'n1' }), w({ id: 'e1', isError: true }), w({ id: 'e2', isError: true })];
  const q = A.buildReviewQueue(words, { roundSize: 5 }, T, { onlyErrors: true });
  assert(q.length === 2 && q.every(x => x.isError), '应只含错题');
});

/* --- 错题状态机 --- */
test('错题迁移：答错进库、计数清零', () => {
  const res = A.applyAnswer(w({ id: 'x' }), false, T, { removeAfter: 3 });
  assert(res.isError === true && res.correctStreak === 0 && res.errorSince === T, '答错应进错题');
});
test('错题迁移：答对计数累加，满次数自动移出', () => {
  let cur = w({ id: 'x', isError: true, errorSince: T, correctStreak: 0 });
  cur = A.applyAnswer(cur, true, T, { removeAfter: 3 });
  assert(cur.isError && cur.correctStreak === 1, '第1次答对应为1');
  cur = A.applyAnswer(cur, false, T, { removeAfter: 3 });
  assert(cur.isError && cur.correctStreak === 0, '答错应清零');
  cur = A.applyAnswer(cur, true, T, { removeAfter: 3 });
  cur = A.applyAnswer(cur, true, T, { removeAfter: 3 });
  cur = A.applyAnswer(cur, true, T, { removeAfter: 3 });
  assert(cur.isError === false && cur.correctStreak === 0, '连续3次答对应移出错题');
});
test('错题迁移：普通词答对不产生错题', () => {
  const res = A.applyAnswer(w({ id: 'y' }), true, T, { removeAfter: 3 });
  assert(res.isError === false, '普通词答对不应进错题');
});

/* --- 录入与去重 --- */
test('录入：新单词追加并带今天日期', () => {
  const res = A.addWordEntry([], '배우다', '学习', [], T);
  assert(res.status === 'added' && res.words.length === 1, '应添加成功');
  assert(res.words[0].createdAt === T, '日期应为今天');
});
test('录入：重复韩语词识别为 duplicate', () => {
  const res1 = A.addWordEntry([], '가다', '去', [], T);
  const res2 = A.addWordEntry(res1.words, '가다 ', '走', [], T);
  assert(res2.status === 'duplicate', '应识别重复');
  assert(res2.words.length === 1, '不应新增');
});
test('录入：空韩语或空释义拒绝', () => {
  assert(A.addWordEntry([], '', '去', [], T).status === 'invalid');
  assert(A.addWordEntry([], '가다', '', [], T).status === 'invalid');
});
test('合并：释义与标签取并集', () => {
  const merged = A.mergeEntry(w({ zh: '去', tags: ['动词'] }), '走、前往', ['动词', 'TOPIK6']);
  assert(merged.zh === '去、走、前往', '释义合并: ' + merged.zh);
  assert(merged.tags.length === 2, '标签去重后应为 2 个');
});
