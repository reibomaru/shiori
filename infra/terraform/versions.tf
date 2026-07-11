terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  # 状態ファイルは GCS で管理する。バケットは事前に手動作成しておく:
  #   gcloud storage buckets create gs://<PROJECT_ID>-tfstate --location=asia-northeast1 \
  #     --uniform-bucket-level-access
  # 初回のみ backend をコメントアウトしたまま `terraform init && terraform apply` で
  # バケットを作り、その後この backend を有効化して `terraform init -migrate-state` でも可。
  backend "gcs" {
    bucket = "shinbun-489215-tfstate"
    prefix = "shiori/infra"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
