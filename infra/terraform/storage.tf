# 状態バケット。以下を同居させる（アプリ/gcloud から API 経由でアクセス。FUSE では使わない）:
#   - litestream/       … SQLite の継続レプリカ（DB の永続化）
#   - backups/          … マイグレーション前スナップショット・日次バックアップ
resource "google_storage_bucket" "state" {
  name                        = local.state_bucket_name
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  # 誤削除に備えて版管理を有効化（Litestream・バックアップの保全）。
  versioning {
    enabled = true
  }

  # backups/ 配下の古い版は 90 日で削除してコストを抑える。
  lifecycle_rule {
    condition {
      age            = 90
      matches_prefix = ["backups/"]
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.services]
}

# AI チャット履歴（JSONL）専用バケット。GCS FUSE はバケットを丸ごとマウントするため、
# Litestream レプリカと混ざらないよう分離する。/data/agent-sessions にマウントする。
resource "google_storage_bucket" "sessions" {
  name                        = "${var.project_id}-${var.service_name}-sessions"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  depends_on = [google_project_service.services]
}
