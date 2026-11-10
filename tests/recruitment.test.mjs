import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import '../recruitment-model.js';

const model = globalThis.HigasuiRecruitment;
const policy = { partId: 'clarinet', targetCount: 5, priority: false, note: '見学歓迎' };
const countResponse = count => ({ version: 1, available: true, asOf: '2026-11-10T00:00:00Z', parts: model.parts.map(part => ({ partId: part.id, currentCount: part.id === 'clarinet' ? count : 0 })) });

test('不足・目標到達・超過・目標0・募集強化を判定する', () => {
  const rows = (targetCount, currentCount, priority = false) => model.makeRows([{ ...policy, targetCount, priority }], model.normalizeCounts(countResponse(currentCount)).counts)[0];
  assert.equal(rows(5, 3).remaining, 2);
  assert.equal(rows(5, 3).status, 'open');
  assert.equal(rows(5, 3, true).status, 'priority');
  assert.equal(rows(5, 5, true).status, 'closed');
  assert.equal(rows(5, 7).remaining, 0);
  assert.equal(rows(0, 0).status, 'closed');
});

test('未取得の人数を0人にせず、募集人数を出さない', () => {
  const row = model.makeRows([policy])[0];
  assert.equal(row.currentCount, null);
  assert.equal(row.remaining, null);
  assert.equal(row.status, 'unknown');
});

test('不完全な人数・重複・未対応パート・負数を拒否する', () => {
  const response = countResponse(3);
  assert.throws(() => model.normalizeCounts({ ...response, parts: response.parts.slice(1) }));
  assert.throws(() => model.normalizeCounts({ ...response, parts: [...response.parts, response.parts[0]] }));
  assert.throws(() => model.normalizeCounts({ ...response, available: false }));
  assert.throws(() => model.normalizeCounts({ ...response, parts: [{ partId: 'unknown', currentCount: 2 }] }));
  assert.throws(() => model.normalizeCounts(countResponse(-1)));
});

test('CMSの選択肢を共通IDへ変換し、二重登録と不正な目標値を拒否する', () => {
  assert.equal(model.normalizePolicies([{ ...policy, partId: ['クラリネット / clarinet'] }])[0].partId, 'clarinet');
  assert.throws(() => model.normalizePolicies([policy, policy]));
  for (const targetCount of [-1, 1.5, null, '3', NaN]) assert.throws(() => model.normalizePolicies([{ ...policy, targetCount }]));
  assert.throws(() => model.normalizePolicies([{ ...policy, partId: 'staff' }]));
  assert.deepEqual(model.normalizePolicies([]), []);
});

async function sandbox(t) {
  const root = await mkdtemp(join(tmpdir(), 'higasui-recruitment-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts'));
  for (const name of ['recruitment-model.js', 'scripts/sync-recruitment.mjs']) await copyFile(new URL('../' + name, import.meta.url), join(root, name));
  await writeFile(join(root, 'recruitment-content.js'), 'previous data');
  return { root, read: () => readFile(join(root, 'recruitment-content.js'), 'utf8'), run: () => spawnSync(process.execPath, ['--import', './mock.mjs', 'scripts/sync-recruitment.mjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, MICROCMS_SERVICE_DOMAIN: 'test', MICROCMS_API_KEY: 'test-secret', MICROCMS_RECRUITMENT_ENDPOINT: 'recruitment' } }) };
}

test('APIキー・管理用の追加フィールドを公開せず、公開済み方針だけを同期する', async t => {
  const s = await sandbox(t);
  await writeFile(join(s.root, 'mock.mjs'), `globalThis.fetch = async (url, options) => {
    if (new URL(url).searchParams.has('draftKey')) throw new Error('draft requested');
    if (options.headers['X-MICROCMS-API-KEY'] !== 'test-secret') throw new Error('key missing');
    return new Response(JSON.stringify({ contents: [${JSON.stringify({ ...policy, internalMemo: 'private-value', note: '</script>' })}], totalCount: 1 }));
  };`);
  const result = s.run(); assert.equal(result.status, 0, result.stderr);
  const output = await s.read();
  assert.equal(output.includes('test-secret'), false); assert.equal(output.includes('private-value'), false); assert.equal(output.includes('<'), false);
  const context = { window: {} }; runInNewContext(output, context);
  assert.equal(context.window.HIGASUI_RECRUITMENT.policies.length, 1);
});

test('API失敗・不完全な取得・不正な方針で前回データを保持し、0件なら空にする', async t => {
  const s = await sandbox(t);
  for (const value of [null, { contents: [], totalCount: 1 }, { contents: [{ ...policy, targetCount: -1 }], totalCount: 1 }]) {
    await writeFile(join(s.root, 'mock.mjs'), value === null ? "globalThis.fetch = async () => new Response('test-secret', {status:403});" : `globalThis.fetch = async () => new Response(JSON.stringify(${JSON.stringify(value)}));`);
    const result = s.run(); assert.equal(result.status, 1); assert.equal((result.stdout + result.stderr).includes('test-secret'), false); assert.equal(await s.read(), 'previous data');
  }
  await writeFile(join(s.root, 'mock.mjs'), "globalThis.fetch = async () => new Response(JSON.stringify({contents:[],totalCount:0}));");
  assert.equal(s.run().status, 0);
  const context = { window: {} }; runInNewContext(await s.read(), context);
  assert.equal(context.window.HIGASUI_RECRUITMENT.mode, 'microcms'); assert.equal(context.window.HIGASUI_RECRUITMENT.policies.length, 0);
});
