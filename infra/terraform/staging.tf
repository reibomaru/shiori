# ============================================================
#  ステージング環境（開発者限定 / Basic 認証）
#
#  本番と完全に分離した検証環境。本番リソース（cloud_run.tf ほか）は
#  一切変更せず、ここに staging 専用リソースを集約する。命名は
#  "${service_name}-staging"。
#
#  本番との差分:
#    - ingress = ALL（run.app 直アクセス可）。ただしアプリ側で APP_ENV=staging
#      のとき Basic 認証を全ルート前段に有効化するため、素の run.app には
#      Basic 認証の壁越しでしか入れない（= 開発者だけ入れる）。
#      → 外部 HTTPS LB / Cloud DNS / managed 証明書は複製しない（コスト・構成を最小化）。
#    - DB(Litestream state) / agent-sessions / Firestore を本番と分離。
#    - Firestore は 1 プロジェクト 1 (default) 制約があるため、名前付き DB
#      "staging" を使って本番 (default) と混ぜない（アプリは FIRESTORE_DATABASE_ID で切替）。
# ============================================================

locals {
  staging_service_name = "${var.service_name}-staging"

  # 本番の common_env（cloud_run.tf）を土台に、staging 向けの上書きを重ねる。
  staging_env = merge(local.common_env, {
    APP_ENV = "staging"
    # 状態・履歴・利用台帳を本番と分離。
    LITESTREAM_BUCKET     = google_storage_bucket.staging_state.name
    FIRESTORE_DATABASE_ID = google_firestore_database.staging.name
    # OAuth リダイレクト用。初回は空（自動解決）、apply 後に run.app URL を設定して再 apply。
    APP_BASE_URL = var.staging_app_base_url
  })
}

# ---- Basic 認証の資格情報（値は手動投入）--------------------
# 本番サービスに余計な env を注入しないよう、共有の secret_ids には入れず
# staging 専用の入れ物として分離する。
#   printf '%s' "$VALUE" | gcloud secrets versions add STAGING_BASIC_AUTH_USER --data-file=-
resource "google_secret_manager_secret" "staging_basic_auth" {
  for_each  = toset(["STAGING_BASIC_AUTH_USER", "STAGING_BASIC_AUTH_PASSWORD"])
  secret_id = each.value

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_iam_member" "staging_basic_auth_accessor" {
  for_each  = google_secret_manager_secret.staging_basic_auth
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

# ---- 状態バケット（Litestream レプリカ・backups）------------
resource "google_storage_bucket" "staging_state" {
  name                        = "${var.project_id}-${var.service_name}-staging-state"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  versioning {
    enabled = true
  }

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

# ---- AI チャット履歴バケット（GCS FUSE でマウント）----------
resource "google_storage_bucket" "staging_sessions" {
  name                        = "${var.project_id}-${var.service_name}-staging-sessions"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  depends_on = [google_project_service.services]
}

# ---- 実行 SA / デプロイ SA に staging バケット権限を付与 -----
# 実行 SA は staging の状態・履歴バケットを読み書きする。
resource "google_storage_bucket_iam_member" "runtime_staging_bucket" {
  for_each = toset([google_storage_bucket.staging_state.name, google_storage_bucket.staging_sessions.name])
  bucket   = each.value
  role     = "roles/storage.objectAdmin"
  member   = "serviceAccount:${google_service_account.runtime.email}"
}

# デプロイ SA は migrate 前バックアップ（gcloud storage cp）のため staging state を読み書きする。
resource "google_storage_bucket_iam_member" "deployer_staging_bucket" {
  bucket = google_storage_bucket.staging_state.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.deployer.email}"
}

# ---- Firestore: staging 用の名前付き DB（本番 (default) と分離）----
resource "google_firestore_database" "staging" {
  project     = var.project_id
  name        = "staging"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_project_service.services]
}

# ---- ステージング Cloud Run サービス ------------------------
resource "google_cloud_run_v2_service" "staging" {
  name                = local.staging_service_name
  location            = var.region
  deletion_protection = false
  # run.app 直アクセスを許可（LB を張らない）。到達制御はアプリ側の Basic 認証で行う。
  ingress = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.runtime.email

    # 本番と同じく SQLite 単一ライタ制約のため 1 インスタンス固定。
    scaling {
      min_instance_count = 1
      max_instance_count = 1
    }

    volumes {
      name = "sessions"
      gcs {
        bucket    = google_storage_bucket.staging_sessions.name
        read_only = false
      }
    }

    containers {
      image = var.placeholder_image

      ports {
        container_port = 8080
      }

      resources {
        cpu_idle          = false
        startup_cpu_boost = true
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
      }

      volume_mounts {
        name       = "sessions"
        mount_path = "${local.data_mount_path}/${local.sessions_subdir}"
      }

      dynamic "env" {
        for_each = local.staging_env
        content {
          name  = env.key
          value = env.value
        }
      }

      # アプリ用シークレット（本番と同じ入れ物を再利用）。
      dynamic "env" {
        for_each = google_secret_manager_secret.app
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret_id
              version = "latest"
            }
          }
        }
      }

      # Basic 認証の資格情報（staging 専用）。
      dynamic "env" {
        for_each = google_secret_manager_secret.staging_basic_auth
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.services,
    google_secret_manager_secret_iam_member.runtime_accessor,
    google_secret_manager_secret_iam_member.staging_basic_auth_accessor,
    google_storage_bucket_iam_member.runtime_staging_bucket,
  ]
}

# run.app への到達を許可（実際の壁はアプリ側 Basic 認証）。
resource "google_cloud_run_v2_service_iam_member" "staging_public" {
  name     = google_cloud_run_v2_service.staging.name
  location = google_cloud_run_v2_service.staging.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ---- ステージング マイグレーション Job ----------------------
resource "google_cloud_run_v2_job" "staging_migrate" {
  name                = "${local.staging_service_name}-migrate"
  location            = var.region
  deletion_protection = false

  template {
    template {
      service_account = google_service_account.runtime.email
      max_retries     = 0
      timeout         = "600s"

      containers {
        image   = var.placeholder_image
        command = ["/app/migrate-job.sh"]

        resources {
          limits = {
            cpu    = var.cpu
            memory = var.memory
          }
        }

        dynamic "env" {
          for_each = local.staging_env
          content {
            name  = env.key
            value = env.value
          }
        }

        dynamic "env" {
          for_each = google_secret_manager_secret.app
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = env.value.secret_id
                version = "latest"
              }
            }
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.services,
    google_secret_manager_secret_iam_member.runtime_accessor,
    google_storage_bucket_iam_member.runtime_staging_bucket,
  ]
}
