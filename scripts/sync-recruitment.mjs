import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import '../recruitment-model.js';

const domain = process.env.MICROCMS_SERVICE_DOMAIN?.trim();
const key = process.env.MICROCMS_API_KEY?.trim();
const endpoint = process.env.MICROCMS_RECRUITMENT_ENDPOINT?.trim() || 'recruitment';
const demo = process.argv.includes('--demo');
const output = new URL('../recruitment-content.js', import.meta.url);
try {
  let contents = [];
  if (demo) {
    contents = JSON.parse(await readFile(new URL('../demo/recruitment.json', import.meta.url), 'utf8')).contents;
  } else {
    if (!domain || !key || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(domain) || !/^[a-zA-Z0-9_-]+$/.test(endpoint)) {
      throw new Error('microCMSのサービスドメイン・APIキー・エンドポイントを確認してください。');
    }
    let total = 0;
    do {
      const url = new URL(`https://${domain}.microcms.io/api/v1/${endpoint}`);
      url.searchParams.set('limit', '100');
      url.searchParams.set('offset', String(contents.length));
      const response = await fetch(url, { headers: { 'X-MICROCMS-API-KEY': key }, redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`募集方針の取得に失敗しました（HTTP ${response.status}）。`);
      const data = await response.json();
      if (!Array.isArray(data.contents) || !Number.isSafeInteger(data.totalCount) || data.totalCount < 0 || (!data.contents.length && contents.length < data.totalCount)) {
        throw new Error('募集方針の取得結果が不完全です。');
      }
      contents.push(...data.contents);
      total = data.totalCount;
    } while (contents.length < total);
  }
  const policies = HigasuiRecruitment.normalizePolicies(contents);
  const data = { mode: demo ? 'demo' : 'microcms', policies };
  const json = JSON.stringify(data, null, 2).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const temporary = new URL(`../.recruitment-content-${process.pid}.tmp`, import.meta.url);
  try {
    await writeFile(temporary, `// scripts/sync-recruitment.mjs が生成。APIキー・団員の個人情報は含みません。\nwindow.HIGASUI_RECRUITMENT = ${json};\n`);
    await rename(temporary, output);
  } finally { await rm(temporary, { force: true }); }
  console.log(`公開の募集方針 ${policies.length}件を同期しました。`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
