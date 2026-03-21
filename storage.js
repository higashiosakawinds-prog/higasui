// =============================================
//  storage.js — Supabase Storage 共通処理
//  東大阪吹奏楽団（ひがすい）
//  使い方：各HTMLで <script src="storage.js"></script> して呼び出す
// =============================================

const STORAGE_URL  = 'https://eqnacealnnmpipapdguc.supabase.co/storage/v1';
const STORAGE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxbmFjZWFsbm5tcGlwYXBkZ3VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MzI4MjgsImV4cCI6MjA4OTQwODgyOH0.XI948sgJf6gWXs-sU9iiqxBXDB_S50ZBz__IeV1hA-0';

// =============================================
//  バケット定義
//  bucket: バケット名
//  public: true=公開URL取得可 / false=署名付きURL必要
//  maxMB: アップロード上限（ガイドライン）
// =============================================
const BUCKETS = {
  banners:     { public: true,  maxMB: 5  },  // NEWSバナー画像（公開）
  files:       { public: false, maxMB: 20 },  // 委員会資料（非公開）
  scores:      { public: false, maxMB: 10 },  // 楽譜PDF（非公開）
  instruments: { public: false, maxMB: 5  },  // 楽器画像（非公開）
  recordings:  { public: false, maxMB: 50 },  // 練習録音（非公開）
};

// =============================================
//  アップロード
//  bucket  : バケット名（例: 'banners'）
//  file    : File オブジェクト（input[type=file].files[0]）
//  path    : 保存先パス（例: 'news/abc123.jpg'）
//  戻り値  : { url, path } または throw Error
// =============================================
async function storageUpload(bucket, file, path) {
  const info = BUCKETS[bucket];
  if (!info) throw new Error(`未定義のバケットです: ${bucket}`);

  // サイズチェック
  const mb = file.size / 1024 / 1024;
  if (mb > info.maxMB) throw new Error(`ファイルサイズが上限（${info.maxMB}MB）を超えています（${mb.toFixed(1)}MB）`);

  // アップロード
  const res = await fetch(`${STORAGE_URL}/object/${bucket}/${path}`, {
    method:  'POST',
    headers: {
      'apikey':        STORAGE_KEY,
      'Authorization': `Bearer ${STORAGE_KEY}`,
      'Content-Type':  file.type || 'application/octet-stream',
      'x-upsert':      'true',  // 同名ファイルは上書き
    },
    body: file,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `アップロード失敗（${res.status}）`);
  }

  // URL取得
  const url = info.public
    ? storagePublicUrl(bucket, path)
    : await storageSignedUrl(bucket, path);

  return { url, path };
}

// =============================================
//  削除
//  bucket : バケット名
//  path   : 削除するファイルパス
//  戻り値 : true または throw Error
// =============================================
async function storageDelete(bucket, path) {
  const res = await fetch(`${STORAGE_URL}/object/${bucket}/${path}`, {
    method:  'DELETE',
    headers: {
      'apikey':        STORAGE_KEY,
      'Authorization': `Bearer ${STORAGE_KEY}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `削除失敗（${res.status}）`);
  }
  return true;
}

// =============================================
//  公開URL取得（bannersバケット専用）
// =============================================
function storagePublicUrl(bucket, path) {
  return `${STORAGE_URL}/object/public/${bucket}/${path}`;
}

// =============================================
//  署名付きURL取得（非公開バケット用）
//  expiresIn : 有効秒数（デフォルト3600秒=1時間）
// =============================================
async function storageSignedUrl(bucket, path, expiresIn = 3600) {
  const res = await fetch(`${STORAGE_URL}/object/sign/${bucket}/${path}`, {
    method:  'POST',
    headers: {
      'apikey':        STORAGE_KEY,
      'Authorization': `Bearer ${STORAGE_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ expiresIn }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `署名付きURL取得失敗（${res.status}）`);
  }

  const data = await res.json();
  return `${STORAGE_URL}${data.signedURL}`;
}

// =============================================
//  ファイル名を安全な形に変換
//  例: "写真 2026.jpg" → "1700000000000_e3b0c4.jpg"
//  用途：storageUpload の path 引数に使う
// =============================================
function storageSafeName(file) {
  const ext  = file.name.split('.').pop().toLowerCase();
  const hash = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}_${hash}.${ext}`;
}

// =============================================
//  バケット情報取得（上限確認などに使う）
// =============================================
function storageInfo(bucket) {
  return BUCKETS[bucket] || null;
}
