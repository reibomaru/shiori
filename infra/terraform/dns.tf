# ============================================================
#  Cloud DNS: カスタムドメインのマネージドゾーンとレコード
#
#  apex ドメイン（booklet-ai.com）を外部 HTTPS LB の固定 IP に
#  A / AAAA で向ける。ゾーン作成後に出力される name servers を
#  ドメインレジストラ側の NS に設定するとゾーンが有効になる。
# ============================================================

resource "google_dns_managed_zone" "app" {
  name        = var.dns_zone_name
  dns_name    = "${var.domain}."
  description = "${var.service_name} 公開用ゾーン（Cloud Run / 外部 HTTPS LB）"

  depends_on = [google_project_service.services]
}

# apex → LB の IPv4 固定 IP
resource "google_dns_record_set" "a" {
  name         = google_dns_managed_zone.app.dns_name
  managed_zone = google_dns_managed_zone.app.name
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.lb_ipv4.address]
}

# apex → LB の IPv6 固定 IP
resource "google_dns_record_set" "aaaa" {
  name         = google_dns_managed_zone.app.dns_name
  managed_zone = google_dns_managed_zone.app.name
  type         = "AAAA"
  ttl          = 300
  rrdatas      = [google_compute_global_address.lb_ipv6.address]
}
