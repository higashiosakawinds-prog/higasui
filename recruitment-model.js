/* 募集方針と現在人数を突き合わせる共通処理。 */
(() => {
  'use strict';
  const parts = [
    ['piccolo', 'ピッコロ', 'Piccolo'], ['flute', 'フルート', 'Flute'],
    ['oboe', 'オーボエ', 'Oboe'], ['bassoon', 'ファゴット', 'Bassoon'],
    ['clarinet', 'クラリネット', 'Clarinet'], ['bassclarinet', 'バスクラリネット', 'Bass Clarinet'],
    ['ssaxophone', 'ソプラノサックス', 'Soprano Saxophone'], ['asaxophone', 'アルトサックス', 'Alto Saxophone'],
    ['tsaxophone', 'テナーサックス', 'Tenor Saxophone'], ['bsaxophone', 'バリトンサックス', 'Baritone Saxophone'],
    ['horn', 'ホルン', 'Horn'], ['trumpet', 'トランペット', 'Trumpet'],
    ['trombone', 'トロンボーン', 'Trombone'], ['euphonium', 'ユーフォニアム', 'Euphonium'],
    ['tuba', 'テューバ', 'Tuba'], ['percussion', 'パーカッション', 'Percussion'],
    ['contrabass', 'コントラバス', 'Contrabass'], ['piano', 'ピアノ', 'Piano']
  ].map(([id, name, english]) => Object.freeze({ id, name, english, option: `${name} / ${id}` }));
  const byId = new Map(parts.map(part => [part.id, part]));
  const byOption = new Map(parts.map(part => [part.option, part.id]));
  function integer(value) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
  function normalizePolicies(items) {
    if (!Array.isArray(items)) throw new Error('募集方針を取得できませんでした。');
    const seen = new Set();
    return items.map(item => {
      const raw = Array.isArray(item.partId) ? item.partId[0] : item.partId;
      const partId = byOption.get(raw) || raw;
      if (!byId.has(partId) || seen.has(partId) || !integer(item.targetCount)) {
        throw new Error('パートの選択・目標人数・パートの重複を確認してください。');
      }
      seen.add(partId);
      return { partId, targetCount: item.targetCount, priority: item.priority === true, note: typeof item.note === 'string' ? item.note : '' };
    });
  }
  function normalizeCounts(data) {
    if (!data || data.version !== 1 || data.available !== true || !Array.isArray(data.parts) || !Number.isFinite(Date.parse(data.asOf))) {
      throw new Error('現在のパート人数を取得できませんでした。');
    }
    const counts = new Map();
    for (const row of data.parts) {
      // 未知のパートは0人に変換せず、取得結果全体を確認待ちにする。
      if (!byId.has(row.partId) || counts.has(row.partId) || !integer(row.currentCount)) {
        throw new Error('パート人数の形式を確認してください。');
      }
      counts.set(row.partId, row.currentCount);
    }
    // RPCは全パート（0人も含む）を返す。不足するキーを0人扱いしない。
    if (counts.size !== parts.length) throw new Error('一部のパート人数を取得できませんでした。');
    return { counts, asOf: data.asOf };
  }
  function makeRows(policies, counts = null) {
    const normalized = normalizePolicies(policies);
    return normalized.map(policy => {
      const currentCount = counts?.get(policy.partId);
      const known = integer(currentCount);
      const remaining = known ? Math.max(policy.targetCount - currentCount, 0) : null;
      const status = !known ? 'unknown' : remaining === 0 ? 'closed' : policy.priority ? 'priority' : 'open';
      return { ...byId.get(policy.partId), ...policy, currentCount: known ? currentCount : null, remaining, status };
    }).sort((a, b) => parts.findIndex(part => part.id === a.id) - parts.findIndex(part => part.id === b.id));
  }
  globalThis.HigasuiRecruitment = Object.freeze({ parts: Object.freeze(parts), normalizePolicies, normalizeCounts, makeRows });
})();
