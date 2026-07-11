# ============================================================
#  IAM: 実行用 SA / デプロイ用 SA / Workload Identity 連携
# ============================================================

# ---- Cloud Run（Service / Job）の実行 ID -------------------
resource "google_service_account" "runtime" {
  account_id   = "${var.service_name}-run"
  display_name = "しおり Cloud Run 実行 SA"
}

# 実行 SA は状態バケット（Litestream・backups）と履歴バケット（FUSE）を読み書きする。
resource "google_storage_bucket_iam_member" "runtime_bucket" {
  for_each = toset([google_storage_bucket.state.name, google_storage_bucket.sessions.name])
  bucket   = each.value
  role     = "roles/storage.objectAdmin"
  member   = "serviceAccount:${google_service_account.runtime.email}"
}

# ---- GitHub Actions デプロイ用 SA --------------------------
resource "google_service_account" "deployer" {
  account_id   = "${var.service_name}-deployer"
  display_name = "しおり GitHub Actions デプロイ SA"
}

# デプロイに必要なロール。
resource "google_project_iam_member" "deployer" {
  for_each = toset([
    "roles/run.admin",              # サービス/ジョブのデプロイ・更新・実行
    "roles/artifactregistry.writer", # イメージ push
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# デプロイ SA が実行 SA を actAs できるように（Cloud Run へ SA を割り当てるため）。
resource "google_service_account_iam_member" "deployer_actas_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# マイグレーション時の事前バックアップ（gcloud storage cp）用にバケット権限も付与。
resource "google_storage_bucket_iam_member" "deployer_bucket" {
  bucket = google_storage_bucket.state.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.deployer.email}"
}

# ---- Workload Identity Federation（鍵レス認証）-------------
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "${var.service_name}-github"
  display_name              = "shiori GitHub Actions"

  depends_on = [google_project_service.services]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }

  # このリポジトリからの OIDC トークンのみ受け付ける。
  attribute_condition = "assertion.repository == \"${var.github_repository}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# 対象リポジトリの GitHub Actions がデプロイ SA を借用できるようにする。
resource "google_service_account_iam_member" "github_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}
