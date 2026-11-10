import { readFile } from 'node:fs/promises';

const ref = 'iaqbkriorspsjldodhjy';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required.');

async function query(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(30000),
    redirect: 'error'
  });
  if (!response.ok) throw new Error(`Supabase database query failed (HTTP ${response.status}).`);
  return response.json();
}

const columns = await query("select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'profiles' order by ordinal_position;");
console.log('profiles schema:', JSON.stringify(columns));
if (!['part', 'category'].every(name => columns.some(column => column.column_name === name))) {
  throw new Error('profiles.part and profiles.category must exist.');
}
// 団員レコード・集計人数は取得も出力もしない。ログは項目名と処理成否だけ。
if (process.env.APPLY_RECRUITMENT_RPC === 'true') {
  await query(await readFile(new URL('../supabase/migrations/202611100001_recruitment_counts.sql', import.meta.url), 'utf8'));
  console.log('Recruitment aggregate RPC applied.');
} else {
  console.log('Inspection only; no database changes.');
}
