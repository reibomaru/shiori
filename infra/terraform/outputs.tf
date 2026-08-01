output "service_url" {
  description = "Cloud Run サービスの URL。"
  value       = google_cloud_run_v2_service.app.uri
}

output "service_name" {
  value = google_cloud_run_v2_service.app.name
}

output "migrate_job_name" {
  value = google_cloud_run_v2_job.migrate.name
}

output "artifact_registry_repo" {
  description = "イメージ push 先（REGION-docker.pkg.dev/PROJECT/REPO）。"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}"
}

output "runtime_service_account" {
  value = google_service_account.runtime.email
}

output "deployer_service_account" {
  description = "GitHub Actions が借用するデプロイ用 SA。"
  value       = google_service_account.deployer.email
}

output "workload_identity_provider" {
  description = "GitHub Actions の google-github-actions/auth に渡す provider リソース名。"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "state_bucket" {
  value = google_storage_bucket.state.name
}

output "sessions_bucket" {
  value = google_storage_bucket.sessions.name
}

output "dns_name_servers" {
  description = "ドメインレジストラの NS に設定する Cloud DNS の name servers。"
  value       = google_dns_managed_zone.app.name_servers
}

output "lb_ipv4" {
  description = "外部 HTTPS LB の IPv4 固定 IP（apex の A レコードが指す先）。"
  value       = google_compute_global_address.lb_ipv4.address
}

output "lb_ipv6" {
  description = "外部 HTTPS LB の IPv6 固定 IP（apex の AAAA レコードが指す先）。"
  value       = google_compute_global_address.lb_ipv6.address
}

output "app_domain" {
  description = "公開ドメイン（証明書 ACTIVE 後にアクセス可能）。"
  value       = "https://${var.domain}"
}
