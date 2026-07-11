# シークレットの「入れ物」だけを作る。値（バージョン）は Terraform では管理せず、
# 手動投入する:
#   printf '%s' "$VALUE" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
resource "google_secret_manager_secret" "app" {
  for_each  = toset(var.secret_ids)
  secret_id = each.value

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

# 実行用 SA が各シークレットの最新版を読めるようにする。
resource "google_secret_manager_secret_iam_member" "runtime_accessor" {
  for_each  = google_secret_manager_secret.app
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}
