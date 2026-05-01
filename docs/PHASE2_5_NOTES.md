# Phase 2.5 への申し送りメモ

**作成日**: 2026-05-01
**作成者**: Claude Code（Phase 2 実装担当）
**前提**: Phase 2 完了（panel_finance.html タブUI化＋団費収入タブ新設）

---

## 1. Phase 2.5 のスコープ（仕様書 §10 より）

収支報告書タブを大改造する。

- KPIカード4つ（年度累計収入 / 年度累計支出 / 現在残高 / 団費納入率）
- **通年推移グラフ（収入・支出・残高の月別推移）← たくあんから明示要望あり**
- 月別収支表（カテゴリ別内訳）
- PDFエクスポート機能
- 「団員に共有用リンク」生成機能（簡易版でOK）

### 1.1 通年推移グラフの実装ヒント

ダッシュボードタブで既に Chart.js（v4.4.0）を CDN ロードしている（`loadChartJs()`）。
収支報告書タブでも同じインスタンスを再利用すれば追加のロード不要。

推奨：
- グラフ種別：`line`（折れ線、3本：収入・支出・残高）または `bar` + `line` の混合
- データ範囲：年度別（4月〜翌3月）の12ヶ月分
- 残高は累積で計算
- 仕様書 §6.1 のダッシュボードグラフ（`renderGraph()`）の実装が参考になる

---

## 2. Phase 2 で残した「現状の収支報告書タブ」の構造

`panel_finance.html` の「収支報告書」タブは、**既存の月次サマリー表をそのまま移植しただけ**。

### 関連関数
- `loadReportTab()` — タブを開いた時に呼ばれる。`ledger` ロード → `renderReport()` 呼び出し
- `renderReport()` — `#reportContent` の中身を生成（月別の収入/支出/収支表＋合計行）
- `printReport()` — どのタブからでも呼べる印刷関数。データ準備 → `window.print()`

### 印刷時の挙動
- `@media print` で `tab-nav` と他タブパネルを `display:none`、`tab-panel[data-tab="report"]` のみ表示
- 「ダッシュボード」「収支報告書」両方のタブから「印刷」ボタンが押せる
- どちらから押しても同じレイアウトが印刷される

### Phase 2.5 で書き換える時の注意点
- `#reportContent` の innerHTML を差し替えるだけで KPI カードや新グラフを乗せられる
- 印刷スタイルは現状維持で OK（タブが切り替わっても印刷は report タブ固定）
- 既存の `loadChartJs()` ヘルパーをそのまま再利用可能（Chart.js は1回ロードすれば全タブで使える）

---

## 3. Phase 2 実装中に気づいた点（Phase 2.5 で参考になりそう）

### 3.1 データキャッシュ戦略

各タブが `data-loaded="true/false"` を持つ。データ更新時は `invalidateOtherTabs(except)` で他タブを `false` に戻し、次回開いた時に再ロードされる仕組み。

Phase 2.5 で KPI を導入する場合：
- 年度累計収入・支出・残高は `ledgerData` から計算（現状の `renderReport()` を拡張）
- 団費納入率は `feeMembersData` + `feePaymentsByYear[year]` から計算（団費収入タブの `updateFeeSummary()` に同じロジック）
- **両者を共有しないと再計算コストが増える**ので、`ensureFeeMembersLoaded()` を呼んで `feePaymentsByYear` も流用すると良い

### 3.2 年度ヘルパー（既に実装済み、再利用推奨）

```js
currentFiscalYear()       // '2026'（4月始まり）
fiscalYearOf('2026-03')   // '2025'
fiscalYearMonths('2026')  // ['2026-04', ..., '2027-03']
```

KPI カードの「年度累計」は `fiscalYearMonths(year)` で対象月のリストを取り、`ledgerData` をフィルタすればOK。

### 3.3 PDFエクスポート

ブラウザの「印刷 → PDF として保存」で十分実用に耐えるはず。ライブラリ追加は最終手段（メンテ負荷が増える）。

どうしてもPDFファイル直接生成が必要な場合：
- jsPDF + html2canvas は重い（200KB+）
- print-js は軽量だが現行の `window.print()` とほぼ同等
- 推奨：現状の印刷フローのまま、UIで「PDFとして保存はブラウザの印刷ダイアログで」と案内

### 3.4 「団員に共有用リンク」

現状、panel_finance はパネルコード認証（既知の問題、Phase 2 では触らない）。

共有用リンクを作るなら：
- A) 読み取り専用ページ（`finance_report.html`）を新設し、トークン無しで誰でも見られる年度別収支報告ビューを作る
- B) 既存 panel_finance に `?view=report&year=2026` のような GET パラメータを足し、特定の年度の収支報告書だけを表示するモード

**推奨：A（読み取り専用ページ新設）**。会計委員会パネル本体に「公開モード」を混ぜると認証ロジックがさらに複雑化する。

---

## 4. 既知の地雷（Phase 2.5 でも触らない）

仕様書 §3.2 / §7.2 を踏襲：

1. `panel_finance` がパネルコード認証に戻っている件 → 別タスクで Auth 移行
2. `member.html` の CSS 不安定問題 → 別タスク
3. Stripe Webhook 自動化 → Phase 3

---

## 5. Phase 2 完了時点の panel_finance.html 構造マップ

```
panel_finance.html
├── ロック画面（パネルコード認証、既存維持）
├── タブナビ（新設）
│   ├── ダッシュボード（既存機能の移植）
│   ├── 出納帳（既存機能の移植）
│   ├── 団費収入（新設、Phase 2 のメイン）★
│   └── 収支報告書（既存機能の移植、Phase 2.5 で大改造予定）
├── 収支入力モーダル（既存）
└── 現金受領モーダル（新設）★
```

★ = Phase 2 で新規追加

### グローバル状態
```
ledgerData          - 出納帳データ（複数タブで共有）
ledgerLoaded        - true/false
feeMembersData      - 対象会員（active な正会員/学生のみ）
feeMembersLoaded    - true/false
feePaymentsByYear   - { '2026': [...], '2025': [...] }
availableFiscalYears- 年度セレクタ用
currentFeeYear      - 表示中の年度
```

### 主要な関数の依存関係
```
showMain()
  → activateTab(initialTab)
       ├─ loadDashboard() → ensureLedgerLoaded + ensureFeeMembersLoaded + loadCurrentMonthUnpaidStat + renderSummary + renderGraph
       ├─ loadLedgerTab() → ensureLedgerLoaded + populateMonthFilter + renderLedger
       ├─ loadFeeTab()    → ensureFeeMembersLoaded + initFiscalYears + loadFeePaymentsForYear + renderFeeMatrix + updateFeeSummary
       └─ loadReportTab() → ensureLedgerLoaded + renderReport
```

---

## 6. テスト時に確認してほしいこと（Phase 2.5 開始前に）

Phase 2 の自己レビューはコード上で完了しているが、**実Supabaseと繋いだ動作確認は必須**。

仕様書 §8 のチェックリストを順に：
- [ ] 各タブが開ける（4つ）
- [ ] タブ切替後、URL ハッシュが `#tab=fee` などに変わる
- [ ] 直接 `panel_finance.html#tab=fee` で開いたら団費収入タブが初期表示される
- [ ] 団費収入マトリクスで未納セル「□」がクリック可能
- [ ] 現金受領モーダルで保存すると `fee_payments` と `ledger` 両方に記録される
- [ ] 同月二重支払いで「既に支払い記録があります」が表示される
- [ ] 既存の出納帳機能が壊れていない

---

がんばってくれ〜🎺
