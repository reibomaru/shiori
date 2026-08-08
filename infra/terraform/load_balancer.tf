# ============================================================
#  外部 HTTPS ロードバランサ（グローバル）→ Cloud Run
#
#    Cloud DNS (A/AAAA)
#      → 固定 IP（global address / IPv4・IPv6）
#      → forwarding rule (443) → target HTTPS proxy → url_map
#      → backend service → serverless NEG → Cloud Run service
#    HTTP(80) は HTTPS へ 301 リダイレクトする。
#
#  証明書は Google マネージド（google_compute_managed_ssl_certificate）。
#  DNS が固定 IP を指し、プロビジョニングが済むまで ACTIVE にならない。
# ============================================================

# ---- 固定 IP（グローバル）----------------------------------
resource "google_compute_global_address" "lb_ipv4" {
  name       = "${var.service_name}-lb-ipv4"
  ip_version = "IPV4"

  depends_on = [google_project_service.services]
}

resource "google_compute_global_address" "lb_ipv6" {
  name       = "${var.service_name}-lb-ipv6"
  ip_version = "IPV6"

  depends_on = [google_project_service.services]
}

# ---- Serverless NEG（Cloud Run を束ねる）-------------------
resource "google_compute_region_network_endpoint_group" "app" {
  name                  = "${var.service_name}-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = google_cloud_run_v2_service.app.name
  }

  depends_on = [google_project_service.services]
}

# ---- バックエンドサービス ----------------------------------
resource "google_compute_backend_service" "app" {
  name                  = "${var.service_name}-backend"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTP"

  backend {
    group = google_compute_region_network_endpoint_group.app.id
  }
}

# ---- Google マネージド SSL 証明書 --------------------------
resource "google_compute_managed_ssl_certificate" "app" {
  name = "${var.service_name}-cert"

  managed {
    domains = [var.domain]
  }
}

# ---- HTTPS 側: url_map → target proxy → forwarding rule ----
resource "google_compute_url_map" "https" {
  name            = "${var.service_name}-https"
  default_service = google_compute_backend_service.app.id
}

resource "google_compute_target_https_proxy" "app" {
  name             = "${var.service_name}-https-proxy"
  url_map          = google_compute_url_map.https.id
  ssl_certificates = [google_compute_managed_ssl_certificate.app.id]
}

resource "google_compute_global_forwarding_rule" "https_ipv4" {
  name                  = "${var.service_name}-https-ipv4"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  target                = google_compute_target_https_proxy.app.id
  port_range            = "443"
  ip_address            = google_compute_global_address.lb_ipv4.address
}

resource "google_compute_global_forwarding_rule" "https_ipv6" {
  name                  = "${var.service_name}-https-ipv6"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  target                = google_compute_target_https_proxy.app.id
  port_range            = "443"
  ip_address            = google_compute_global_address.lb_ipv6.address
}

# ---- HTTP(80) → HTTPS 301 リダイレクト ---------------------
resource "google_compute_url_map" "http_redirect" {
  name = "${var.service_name}-http-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "redirect" {
  name    = "${var.service_name}-http-proxy"
  url_map = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_forwarding_rule" "http_ipv4" {
  name                  = "${var.service_name}-http-ipv4"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  target                = google_compute_target_http_proxy.redirect.id
  port_range            = "80"
  ip_address            = google_compute_global_address.lb_ipv4.address
}

resource "google_compute_global_forwarding_rule" "http_ipv6" {
  name                  = "${var.service_name}-http-ipv6"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  target                = google_compute_target_http_proxy.redirect.id
  port_range            = "80"
  ip_address            = google_compute_global_address.lb_ipv6.address
}
