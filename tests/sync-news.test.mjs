import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

async function sandbox(t) {
  const root = await mkdtemp(join(tmpdir(), 'higasui-news-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts'));
  await mkdir(join(root, 'demo'));
  await copyFile(new URL('../scripts/sync-news.mjs', import.meta.url), join(root, 'scripts/sync-news.mjs'));
  await copyFile(new URL('../demo/news.json', import.meta.url), join(root, 'demo/news.json'));
  const env = { ...process.env, MICROCMS_SERVICE_DOMAIN: '', MICROCMS_API_KEY: '', MICROCMS_NEWS_ENDPOINT: '' };
  return {
    root,
    run: (args = [], overrides = {}) => spawnSync(process.execPath, [...args, 'scripts/sync-news.mjs'], { cwd: root, env: { ...env, ...overrides }, encoding: 'utf8' }),
    output: () => readFile(join(root, 'news-content.js'), 'utf8'),
    seed: () => writeFile(join(root, 'news-content.js'), 'previous public data'),
    mock: source => writeFile(join(root, 'mock.mjs'), source)
  };
}

const credentials = { MICROCMS_SERVICE_DOMAIN: 'test-service', MICROCMS_API_KEY: 'test-key-not-for-output' };
const item = { id: 'entry', title: '見出し', publishedAt: '2026-11-01T00:00:00.000Z', body: '<p>本文</p>', category: ['活動報告'] };

test('demo source generates eight readable articles without inline script delimiters', async t => {
  const s = await sandbox(t);
  // 引数は通常のCLIと同じ末尾に渡す。
  const result = spawnSync(process.execPath, ['scripts/sync-news.mjs', '--demo'], { cwd: s.root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = await s.output();
  const context = { window: {} };
  runInNewContext(output, context);
  assert.equal(context.window.HIGASUI_NEWS.mode, 'demo');
  assert.equal(context.window.HIGASUI_NEWS.articles.length, 8);
  assert.match(context.window.HIGASUI_NEWS.articles[0].body, /<p>/);
  assert.equal(output.includes('<'), false);
});

test('missing configuration preserves the previous data instead of silently using samples', async t => {
  const s = await sandbox(t);
  await s.seed();
  const result = s.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /MICROCMS_SERVICE_DOMAIN/);
  assert.equal(await s.output(), 'previous public data');
});

test('live synchronization paginates published records and excludes keys and extra fields', async t => {
  const s = await sandbox(t);
  await s.mock(`
    import assert from 'node:assert/strict';
    let calls = 0;
    globalThis.fetch = async (input, options) => {
      const url = new URL(input);
      assert.equal(url.hostname, 'test-service.microcms.io');
      assert.equal(url.pathname, '/api/v1/news');
      assert.equal(url.searchParams.has('draftKey'), false);
      assert.equal(url.searchParams.get('limit'), '100');
      assert.equal(options.headers['X-MICROCMS-API-KEY'], 'test-key-not-for-output');
      const offset = Number(url.searchParams.get('offset'));
      assert.equal(offset, calls++ * 100);
      const contents = Array.from({length: offset === 0 ? 100 : 1}, (_, i) => ({
        ...${JSON.stringify(item)}, id: 'entry-' + (offset + i), privateNote: 'should-not-be-published'
      }));
      return new Response(JSON.stringify({contents, totalCount: 101}), {status: 200});
    };
    process.on('exit', () => assert.equal(calls, 2));
  `);
  const result = s.run(['--import', './mock.mjs'], credentials);
  assert.equal(result.status, 0, result.stderr);
  const output = await s.output();
  const context = { window: {} };
  runInNewContext(output, context);
  assert.equal(context.window.HIGASUI_NEWS.mode, 'microcms');
  assert.equal(context.window.HIGASUI_NEWS.articles.length, 101);
  assert.equal(context.window.HIGASUI_NEWS.articles[0].category, '活動報告');
  assert.equal(output.includes(credentials.MICROCMS_API_KEY), false);
  assert.equal(output.includes('should-not-be-published'), false);
});

test('API failure preserves data and does not print response bodies containing secrets', async t => {
  const s = await sandbox(t);
  await s.seed();
  await s.mock(`globalThis.fetch = async () => new Response('test-key-not-for-output', {status: 403});`);
  const result = s.run(['--import', './mock.mjs'], credentials);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /HTTP 403/);
  assert.equal((result.stdout + result.stderr).includes(credentials.MICROCMS_API_KEY), false);
  assert.equal(await s.output(), 'previous public data');
});

test('an incomplete API page never overwrites the last complete snapshot', async t => {
  const s = await sandbox(t);
  await s.seed();
  await s.mock(`globalThis.fetch = async () => new Response(JSON.stringify({contents: [], totalCount: 1}));`);
  const result = s.run(['--import', './mock.mjs'], credentials);
  assert.equal(result.status, 1);
  assert.equal(await s.output(), 'previous public data');
});

test('zero published articles removes previous articles without switching to demo mode', async t => {
  const s = await sandbox(t);
  await s.seed();
  await s.mock(`globalThis.fetch = async () => new Response(JSON.stringify({contents: [], totalCount: 0}));`);
  const result = s.run(['--import', './mock.mjs'], credentials);
  assert.equal(result.status, 0, result.stderr);
  const context = { window: {} };
  runInNewContext(await s.output(), context);
  assert.equal(context.window.HIGASUI_NEWS.mode, 'microcms');
  assert.equal(context.window.HIGASUI_NEWS.articles.length, 0);
});
