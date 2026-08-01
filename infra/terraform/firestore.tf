# ============================================================
#  Firestore: users 台帳（利用許可フラグ）
#
#  認証（Google SSO）とは別に「誰が利用を許可されているか」を Firestore の
#  users コレクション（doc id = Google `sub`）で管理する。ログイン時のみ参照する
#  低頻度アクセスで、マネージドかつ単体で永続（travel.db の Litestream 対応を
#  待たずに承認フラグが保全される）。
#
#  ⚠ Firestore の location は作成後に変更できない。1 プロジェクトに (default)
#     データベースは 1 つ。既に (default) がある場合は terraform import する。
# ============================================================
resource "google_firestore_database" "users" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_project_service.services]
}
