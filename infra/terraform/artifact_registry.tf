# コンテナイメージの置き場。GitHub Actions がここへ push する。
resource "google_artifact_registry_repository" "app" {
  location      = var.region
  repository_id = var.service_name
  description   = "しおりアプリのコンテナイメージ"
  format        = "DOCKER"

  depends_on = [google_project_service.services]
}
