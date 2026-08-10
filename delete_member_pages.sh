#!/usr/bin/env bash
# =============================================================
#  団員ページ機能 削除スクリプト
#  東大阪吹奏楽団ホームページ
#
#  実行方法：
#    リポジトリのルートディレクトリで
#    bash delete_member_pages.sh
#    その後 git status で削除内容を確認し、コミット・プッシュしてください。
#
#  ⚠️ 保持対象（削除しないもの）:
#    - supabase/functions/line-notify/
#    - supabase/functions/stripe-webhook/
#    - storage.js
#    - SEO関連（sitemap.xml, robots.txt, google verification）
#    - 公開ページ（index/about/join/faq/visit/yakkan/member_form/request_form）
# =============================================================

set -e

echo "=== 団員ページ・マイページ本体を削除 ==="
rm -fv member.html
rm -fv member_portal.html
rm -fv attendance.html
rm -fv member_library.html
rm -fv join_form.html

echo ""
echo "=== 委員会パネル群を削除 ==="
rm -fv panel_admin.html
rm -fv panel_finance.html
rm -fv panel_venue.html
rm -fv panel_planning.html
rm -fv panel_pr.html
rm -fv panel_pr_news.html
rm -fv panel_pr_assets.html
rm -fv panel_library.html
rm -fv panel_library_scores.html
rm -fv panel_library_loans.html
rm -fv panel_library_repertoire.html
rm -fv panel_library_viewer.html
rm -fv panel_equipment.html
rm -fv panel_equipment_list.html
rm -fv panel_equipment_register.html
rm -fv panel_equipment_loans.html
rm -fv panel_equipment_qr.html
rm -fv panel_safety.html
rm -fv panel_contact.html

echo ""
echo "=== 関連ドキュメントを削除 ==="
rm -fv manual_venue.html
rm -fv docs/PHASE2_5_NOTES.md

echo ""
echo "=== Supabase Edge Functions を削除 ==="
rm -rfv supabase/functions/invite-member
rm -rfv supabase/functions/send-contact

echo ""
echo "=== 不要になったワークフローを削除 ==="
echo "(send-contact のみをデプロイしていたため丸ごと削除)"
rm -fv .github/workflows/deploy-functions.yml

echo ""
echo "=== 完了 ==="
echo "次に supabase/config.toml を書き換えてください（付属の config.toml を上書きコピー）。"
echo "git status で削除内容を確認の上、コミットしてください。"
