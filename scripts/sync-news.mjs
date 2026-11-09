#!/usr/bin/env node
/** 公開記事のみを同期。APIキーはこのNodeプロセスだけで使用します。 */
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../news-content.js', import.meta.url);
const demo = process.argv.includes('--demo');
const domain = process.env.MICROCMS_SERVICE_DOMAIN?.trim();
const apiKey = process.env.MICROCMS_API_KEY?.trim();
const endpoint = process.env.MICROCMS_NEWS_ENDPOINT?.trim() || 'news';

function normalize(item) {
  if (!item || typeof item.id !== 'string' || !item.id || typeof item.title !== 'string' || !item.title.trim() || typeof item.body !== 'string' || !Number.isFinite(Date.parse(item.publishedAt))) {
    throw new Error('記事にid・title・body・有効なpublishedAtが必要です。microCMSのフィールド設定を確認してください。');
  }
  const category = Array.isArray(item.category) ? item.category[0] : item.category;
  const result = {
    id: item.id,
    title: item.title.trim(),
    body: item.body,
    summary: typeof item.summary === 'string' ? item.summary : '',
    category: typeof category === 'string' && category.trim() ? category.trim() : 'お知らせ',
    publishedAt: item.publishedAt
  };
  if (item.eyecatch && typeof item.eyecatch.url === 'string') {
    result.eyecatch = { url: item.eyecatch.url, alt: typeof item.eyecatch.alt === 'string' ? item.eyecatch.alt : '' };
  }
  if (item.banner && typeof item.banner.url === 'string') result.banner = { url: item.banner.url };
  return result;
}

async function fetchPublished() {
  if (!domain || !apiKey) {
    throw new Error('MICROCMS_SERVICE_DOMAINとMICROCMS_API_KEYを設定してください。サンプル表示に戻す場合は --demo を指定してください。');
  }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(domain) || !/^[a-zA-Z0-9_-]+$/.test(endpoint)) {
    throw new Error('サービスドメインはxxx.microcms.ioのxxx部分、エンドポイントはnewsなどのAPI IDを指定してください。');
  }
  const contents = [];
  let totalCount = 0;
  do {
    const url = new URL(`https://${domain}.microcms.io/api/v1/${endpoint}`);
    url.searchParams.set('orders', '-publishedAt');
    url.searchParams.set('limit', '100');
    url.searchParams.set('offset', String(contents.length));
    // draftKeyは送らず、APIの公開記事だけを取得。
    const response = await fetch(url, {
      headers: { 'X-MICROCMS-API-KEY': apiKey },
      redirect: 'error',
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`microCMSの取得に失敗しました（HTTP ${response.status}）。設定とAPI権限を確認してください。`);
    const data = await response.json();
    if (!Array.isArray(data.contents) || !Number.isInteger(data.totalCount) || data.totalCount < 0) {
      throw new Error('microCMSから想定外の形式が返されました。リスト形式のAPIを使用してください。');
    }
    totalCount = data.totalCount;
    if (!data.contents.length && contents.length < totalCount) throw new Error('記事の取得が途中で止まりました。再実行してください。');
    contents.push(...data.contents);
  } while (contents.length < totalCount);
  return contents;
}

try {
  const contents = demo
    ? JSON.parse(await readFile(new URL('../demo/news.json', import.meta.url), 'utf8')).contents
    : await fetchPublished();
  const articles = contents.map(normalize).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  if (new Set(articles.map(item => item.id)).size !== articles.length) throw new Error('記事IDが重複しています。再実行してください。');
  const data = { mode: demo ? 'demo' : 'microcms', articles };
  // 外部スクリプトとしてもHTML内に移した場合も、記事本文がコードを閉じないようにする。
  const json = JSON.stringify(data, null, 2).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const temporary = new URL(`../.news-content-${process.pid}.tmp`, import.meta.url);
  try {
    await writeFile(temporary, `// scripts/sync-news.mjs が生成。編集はmicroCMSまたはdemo/news.jsonで行います。\nwindow.HIGASUI_NEWS = ${json};\n`, 'utf8');
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`${demo ? 'デモ' : 'microCMSの公開記事'} ${articles.length}件を ${fileURLToPath(output)} に同期しました。`);
} catch (error) {
  // APIレスポンス本文やキーは出力しない。既存の公開データも上書きしない。
  console.error(error.message);
  process.exitCode = 1;
}
