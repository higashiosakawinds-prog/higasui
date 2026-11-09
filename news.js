/* microCMSから同期した公開データを、既存サイトのデザインで表示します。 */
(() => {
  'use strict';
  const source = window.HIGASUI_NEWS;
  const categories = ['演奏会', '活動報告', 'お知らせ'];
  const dataAvailable = source && Array.isArray(source.articles);
  const articles = dataAvailable ? source.articles.slice().sort((a, b) =>
    String(b.publishedAt).localeCompare(String(a.publishedAt))) : [];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dateLabel = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date).replaceAll('/', '.');
  };
  const href = item => `news-detail.html?id=${encodeURIComponent(item.id)}`;
  const categoryClass = value => value === '演奏会' ? 'category-concert' : value === '活動報告' ? 'category-report' : '';
  const meta = item => `<div class="news-meta"><time class="news-date" datetime="${escape(item.publishedAt)}">${dateLabel(item.publishedAt)}</time><span class="news-category ${categoryClass(item.category)}">${escape(item.category)}</span></div>`;

  // microCMSのリッチエディタ本文は、許可した要素・属性だけを新しいDOMへコピー。
  // スクリプト、イベント属性、危険なURL、任意のstyleは公開ページへ持ち込みません。
  function safeUrl(value, image = false) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, document.baseURI);
      if (['http:', 'https:'].includes(url.protocol)) return url.href;
      if (!image && ['mailto:', 'tel:'].includes(url.protocol)) return url.href;
      // ローカルファイルからのデモ表示も、同じフォルダ内のリンク・画像だけ対応。
      if (url.protocol === 'file:' && !/^[a-z][a-z\d+.-]*:|^\/\//i.test(value)) return url.href;
    } catch { /* 不正なURLは除去 */ }
    return null;
  }

  function richText(html) {
    const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const allowed = new Set(['P','H2','H3','H4','H5','H6','BR','STRONG','B','EM','I','U','S','DEL','UL','OL','LI','A','IMG','FIGURE','FIGCAPTION','BLOCKQUOTE','TABLE','THEAD','TBODY','TR','TH','TD','HR','PRE','CODE','SUP','SUB']);
    const discard = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','FORM','INPUT','BUTTON','SVG','MATH','LINK','META','BASE','TEMPLATE','NOSCRIPT']);
    function copy(node) {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
      if (node.nodeType !== Node.ELEMENT_NODE || discard.has(node.tagName)) return document.createDocumentFragment();
      const output = allowed.has(node.tagName) ? document.createElement(node.tagName.toLowerCase()) : document.createDocumentFragment();
      if (node.tagName === 'A') {
        const url = safeUrl(node.getAttribute('href'));
        if (url) output.setAttribute('href', url);
        if (node.getAttribute('target') === '_blank') {
          output.setAttribute('target', '_blank');
          output.setAttribute('rel', 'noopener noreferrer');
        }
      }
      if (node.tagName === 'IMG') {
        const url = safeUrl(node.getAttribute('src'), true);
        if (!url) return document.createDocumentFragment();
        output.setAttribute('src', url);
        output.setAttribute('alt', node.getAttribute('alt') || '');
        output.setAttribute('loading', 'lazy');
      }
      if (['TH','TD'].includes(node.tagName)) {
        for (const name of ['colspan','rowspan']) {
          const value = node.getAttribute(name);
          if (/^[1-9]\d?$/.test(value || '')) output.setAttribute(name, value);
        }
      }
      if (node.tagName === 'OL' && /^\d{1,4}$/.test(node.getAttribute('start') || '')) output.setAttribute('start', node.getAttribute('start'));
      for (const child of node.childNodes) output.append(copy(child));
      return output;
    }
    const fragment = document.createDocumentFragment();
    for (const child of parsed.body.childNodes) fragment.append(copy(child));
    return fragment;
  }

  function card(item) {
    const image = safeUrl(item.eyecatch?.url, true);
    return `<a class="news-card" href="${href(item)}">
      ${image ? `<img class="news-card-image" src="${escape(image)}" alt="" loading="lazy">` : '<span class="news-card-image news-card-placeholder"><img src="higasui.svg" alt=""></span>'}
      <div>${meta(item)}<h2>${escape(item.title)}</h2><p class="news-card-summary">${escape(item.summary)}</p></div>
      <span class="news-arrow" aria-hidden="true">→</span></a>`;
  }

  function mountList() {
    const list = document.getElementById('news-cards');
    const count = document.getElementById('news-count');
    const pagination = document.getElementById('news-pagination');
    const filters = document.getElementById('news-filters');
    let category = 'すべて';
    let page = 1;
    const pageSize = 6;
    // microCMS側でカテゴリを追加しても一覧に反映します。
    const choices = ['すべて', ...new Set([...categories, ...articles.map(item => item.category)])];
    filters.innerHTML = choices.map(value => `<button type="button" class="news-filter" data-category="${escape(value)}" aria-pressed="${value === category}">${escape(value)}</button>`).join('');
    function render() {
      const items = articles.filter(item => category === 'すべて' || item.category === category);
      const pages = Math.ceil(items.length / pageSize);
      count.textContent = `${items.length}件のお知らせ`;
      list.setAttribute('aria-busy', 'false');
      if (!dataAvailable) {
        list.innerHTML = '<div class="news-state"><h2>お知らせを読み込めませんでした</h2><p>時間をおいて、もう一度ページを開いてください。</p></div>';
      } else if (!items.length) {
        list.innerHTML = '<div class="news-state"><h2>お知らせはまだありません</h2><p>新しいお知らせを、こちらでお届けします。</p></div>';
      } else {
        list.innerHTML = items.slice((page - 1) * pageSize, page * pageSize).map(card).join('');
      }
      pagination.hidden = pages <= 1;
      pagination.innerHTML = pages <= 1 ? '' : `<button type="button" data-page="${page - 1}" aria-label="前のページ" ${page === 1 ? 'disabled' : ''}>←</button>` +
        Array.from({ length: pages }, (_, index) => `<button type="button" data-page="${index + 1}" aria-label="${index + 1}ページ目" ${page === index + 1 ? 'aria-current="page"' : ''}>${index + 1}</button>`).join('') +
        `<button type="button" data-page="${page + 1}" aria-label="次のページ" ${page === pages ? 'disabled' : ''}>→</button>`;
    }
    filters.addEventListener('click', event => {
      const button = event.target.closest('button[data-category]');
      if (!button) return;
      category = button.dataset.category;
      page = 1;
      filters.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      render();
    });
    pagination.addEventListener('click', event => {
      const button = event.target.closest('button[data-page]');
      if (!button || button.disabled) return;
      page = Number(button.dataset.page);
      render();
      const current = pagination.querySelector('[aria-current="page"]');
      current?.focus({ preventScroll: true });
      document.getElementById('news-toolbar').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
    render();
  }

  function mountArticle() {
    const id = new URLSearchParams(location.search).get('id');
    const item = articles.find(article => article.id === id);
    const root = document.getElementById('news-article');
    root.setAttribute('aria-busy', 'false');
    if (!item) {
      document.title = '記事が見つかりません | 東大阪吹奏楽団';
      root.innerHTML = '<div class="news-state"><h2>記事が見つかりませんでした</h2><p>公開が終了したか、URLが変更された可能性があります。</p><a href="news.html">お知らせ一覧へ戻る →</a></div>';
      return;
    }
    document.title = `${item.title} | 東大阪吹奏楽団`;
    document.querySelector('meta[name="description"]').content = item.summary;
    document.getElementById('article-breadcrumb').textContent = item.title;
    const image = safeUrl(item.eyecatch?.url, true);
    root.innerHTML = `<div class="article-heading">${meta(item)}<h1>${escape(item.title)}</h1></div>` +
      (image ? `<img class="article-cover" src="${escape(image)}" alt="${escape(item.eyecatch?.alt || '')}">` : '') +
      '<div class="article-body" id="article-body"></div>';
    document.getElementById('article-body').append(richText(item.body));
    const others = articles.filter(article => article.id !== item.id);
    const related = [...others.filter(article => article.category === item.category), ...others.filter(article => article.category !== item.category)].slice(0, 3);
    const relatedRoot = document.getElementById('related-news');
    if (related.length) {
      relatedRoot.hidden = false;
      document.getElementById('related-list').innerHTML = related.map(article => `<a class="related-link" href="${href(article)}"><time datetime="${escape(article.publishedAt)}">${dateLabel(article.publishedAt)}</time>${escape(article.title)} <span aria-hidden="true">→</span></a>`).join('');
    }
  }

  function mountNavigation() {
    const button = document.getElementById('ham-btn');
    const drawer = document.getElementById('site-drawer');
    if (!button || !drawer) return;
    const main = document.querySelector('main');
    const footer = document.querySelector('footer');
    function setOpen(open) {
      drawer.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
      document.body.style.overflow = open ? 'hidden' : '';
      if (main) main.inert = open;
      if (footer) footer.inert = open;
    }
    button.addEventListener('click', () => setOpen(drawer.hidden));
    drawer.addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', event => {
      if (drawer.hidden) return;
      if (event.key === 'Escape') { setOpen(false); button.focus(); }
      if (event.key === 'Tab') {
        const links = [...drawer.querySelectorAll('a')];
        const first = button;
        const last = links.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
  }

  window.HigasuiNews = Object.freeze({
    getArticles: () => articles.slice(),
    isDemo: source?.mode === 'demo',
    href, dateLabel, escape, imageUrl: value => safeUrl(value, true)
  });
  if (document.body.dataset.newsPage) {
    document.querySelectorAll('[data-demo-notice]').forEach(node => { node.hidden = source?.mode !== 'demo'; });
    mountNavigation();
    if (document.body.dataset.newsPage === 'list') mountList();
    if (document.body.dataset.newsPage === 'detail') mountArticle();
  }
})();
