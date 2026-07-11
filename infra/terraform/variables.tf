variable "project_id" {
  type        = string
  description = "デプロイ先の GCP プロジェクト ID。"
}

variable "region" {
  type        = string
  description = "リソースを配置するリージョン。"
  default     = "asia-northeast1"
}

variable "service_name" {
  type        = string
  description = "Cloud Run サービス名。関連リソースの接頭辞にも使う。"
  default     = "shiori"
}

variable "github_repository" {
  type        = string
  description = "GitHub Actions からの Workload Identity 連携を許可するリポジトリ（owner/repo）。"
  default     = "reibomaru/travel-plans"
}

variable "placeholder_image" {
  type        = string
  description = <<-EOT
    初回 apply 時にイメージがまだ Artifact Registry に無いため使うダミーイメージ。
    実イメージは GitHub Actions がデプロイ時に差し替える（image は lifecycle で無視）。
  EOT
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

# アプリのシークレット名（値は Terraform では設定せず、gcloud で手動投入する）。
variable "secret_ids" {
  type        = list(string)
  description = "Secret Manager に作成するシークレット ID。値は手動で追加する。"
  default = [
    "GEMINI_API_KEY",
    "WEBSEARCH_API_KEY",
    "GOOGLE_MAPS_API_KEY",
    "BASIC_AUTH_USER",
    "BASIC_AUTH_PASS",
  ]
}

variable "cpu" {
  type        = string
  description = "Cloud Run サービスの CPU。Litestream 常駐のため CPU 常時割当（cpu_idle=false）で使う。"
  default     = "1"
}

variable "memory" {
  type        = string
  description = "Cloud Run サービス/ジョブのメモリ。"
  default     = "512Mi"
}
