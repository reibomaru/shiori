locals {
  # 状態を保存する GCS バケット（Litestream レプリカ・agent-sessions・backups を同居）。
  state_bucket_name = "${var.project_id}-${var.service_name}-state"

  # コンテナ内のマウント先とパス。
  data_mount_path   = "/data"
  sessions_subdir   = "agent-sessions"
  litestream_prefix = "litestream"
}

# ---- 必要な API を有効化 ------------------------------------
resource "google_project_service" "services" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "storage.googleapis.com",
    "firestore.googleapis.com", # users 台帳（利用許可フラグ）
  ])
  service            = each.value
  disable_on_destroy = false
}
