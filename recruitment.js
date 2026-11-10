(() => {
  'use strict';
  const model = globalThis.HigasuiRecruitment;
  const source = window.HIGASUI_RECRUITMENT;
  const config = window.HIGASUI_RECRUITMENT_CONFIG;
  const cards = document.getElementById('recruitment-cards');
  const status = document.getElementById('fetch-status');
  const refresh = document.getElementById('refresh-counts');
  const sampleButton = document.getElementById('toggle-sample');
  let rows = [], filter = 'all', loading = false, sampleMode = false;
  const sampleCounts = [1,4,0,1,4,1,0,2,1,1,1,3,3,1,0,3,0,0];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const statusLabels = { unknown:'人数を確認中', closed:'募集休止', open:'募集中', priority:'募集強化' };
  function render() {
    const pending = rows.some(row => row.status === 'unknown');
    if (pending) filter = 'all';
    document.querySelectorAll('[data-filter]').forEach(button => {
      button.disabled = pending || rows.length === 0;
      button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
    });
    const visible = rows.filter(row => filter === 'all' || (filter === 'recruiting' ? ['open','priority'].includes(row.status) : row.status === 'closed'));
    cards.innerHTML = visible.length ? visible.map(row => `<article class="recruitment-card" data-status="${row.status}">
      <span class="part-status">${statusLabels[row.status]}</span><h3 class="part-name">${escape(row.name)}</h3><p class="part-english">${escape(row.english)}</p>
      <dl class="part-numbers"><div><dt>現在</dt><dd><strong>${row.currentCount ?? '—'}</strong>名</dd></div><div><dt>目標（仮設定）</dt><dd><strong>${row.targetCount}</strong>名</dd></div></dl>
      <p class="part-recruitment">${row.remaining === null ? '人数の取得後に募集状況を表示' : row.remaining === 0 ? '目標人数に達しています' : `あと ${row.remaining} 名を募集`}</p>
      ${row.note ? `<p class="part-note">${escape(row.note)}</p>` : ''}</article>`).join('') : '<p class="news-state">該当するパートはありません。</p>';
  }
  async function getJSON(url, key) {
    const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) { const error = new Error('人数を取得できませんでした。'); error.status = response.status; throw error; }
    return response.json();
  }
  async function load() {
    if (loading) return;
    loading = true; refresh.disabled = true; sampleButton.disabled = true; status.dataset.error = 'false'; status.textContent = '現在の人数を確認しています…'; cards.setAttribute('aria-busy', 'true');
    document.getElementById('sample-notice').hidden = !sampleMode;
    sampleButton.setAttribute('aria-pressed', String(sampleMode));
    sampleButton.textContent = sampleMode ? '実際の人数へ戻す' : 'サンプル人数で試す';
    // 失敗時に古い人数や0人を使って募集中と表示しない。
    document.getElementById('total-members').textContent = '—';
    document.getElementById('open-parts').textContent = '—';
    document.getElementById('remaining-total').textContent = '—';
    try {
      if (!model || !source || source.mode !== 'microcms' || !config) throw new Error('募集情報の準備ができていません。');
      rows = model.makeRows(source.policies); render();
      const [totalResult, partsResult] = await Promise.allSettled([
        getJSON(`${config.settingsUrl}/rest/v1/site_settings?id=eq.1&select=current_members`, config.settingsKey),
        sampleMode ? Promise.resolve({ version:1, available:true, asOf:new Date().toISOString(), parts:model.parts.map((part, index) => ({ partId:part.id, currentCount:sampleCounts[index] })) }) : getJSON(`${config.portalUrl}/rest/v1/rpc/recruitment_member_counts`, config.portalKey)
      ]);
      let totalOk = false;
      if (totalResult.status === 'fulfilled') {
        const total = totalResult.value?.[0]?.current_members;
        if (typeof total === 'number' && Number.isSafeInteger(total) && total >= 0) { document.getElementById('total-members').textContent = total; totalOk = true; }
      }
      let partsOk = false;
      if (partsResult.status === 'fulfilled') {
        try {
          const result = model.normalizeCounts(partsResult.value);
          rows = model.makeRows(source.policies, result.counts);
          document.getElementById('open-parts').textContent = rows.filter(row => row.remaining > 0).length;
          document.getElementById('remaining-total').textContent = rows.reduce((sum, row) => sum + row.remaining, 0);
          const time = new Intl.DateTimeFormat('ja-JP', { timeZone:'Asia/Tokyo', hour:'2-digit', minute:'2-digit', second:'2-digit' }).format(new Date(result.asOf));
          status.textContent = sampleMode ? 'パート人数はサンプル値で計算しています。実際の所属人数ではありません。' : `${time} 時点の人数を取得しました。${totalOk ? '' : '団員総数は取得できませんでした。'}`;
          partsOk = true;
        } catch { /* 不完全な集計は確認中のままにする。 */ }
      }
      if (!partsOk) {
        status.dataset.error = 'true';
        status.textContent = partsResult.status === 'rejected' && partsResult.reason?.status === 404
          ? 'パート別人数の連携は設定待ちです。「サンプル人数で試す」から表示と募集計算を確認できます。'
          : '現在のパート人数を取得できませんでした。募集状況は確認中です。「最新の人数に更新」から再試行できます。';
      }
      if (!totalOk) status.dataset.error = 'true';
      render();
    } catch (error) {
      rows = []; cards.innerHTML = `<p class="news-state">${escape(error.message)}</p>`; status.textContent = '募集情報を表示できませんでした。時間をおいて再度お試しください。'; status.dataset.error = 'true';
    } finally { loading = false; refresh.disabled = false; sampleButton.disabled = false; cards.setAttribute('aria-busy', 'false'); }
  }
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    render();
  }));
  refresh.addEventListener('click', load);
  sampleButton.addEventListener('click', () => { if (!loading) { sampleMode = !sampleMode; load(); } });
  load();
})();
