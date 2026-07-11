# しおり 本番インフラ（Terraform）

Cloud Run + Litestream + GCS + Secret Manager + Workload Identity Federation 一式。
設計の背景は [`docs/gcp-deployment-design.md`](../../docs/gcp-deployment-design.md) を参照。

`terraform apply` は手動で実行する。

## 作成されるリソース

- Cloud Run **Service**（`shiori`）: フロント静的配信 + Hono API + Litestream 常駐。min=max=1、CPU 常時割当、公開（認証はアプリ層の Basic 認証）。
- Cloud Run **Job**（`shiori-migrate`）: マイグレーション実行用。
- **Artifact Registry**（Docker リポジトリ）。
- **GCS バケット** 2 つ: `*-state`（Litestream レプリカ + backups）、`*-sessions`（AI チャット履歴 JSONL, FUSE マウント）。
- **Secret Manager**: `GEMINI_API_KEY` / `WEBSEARCH_API_KEY` / `GOOGLE_MAPS_API_KEY` / `BASIC_AUTH_USER` / `BASIC_AUTH_PASS`（入れ物のみ。値は手動投入）。
- **IAM**: 実行 SA、デプロイ SA、GitHub Actions 用 Workload Identity 連携。

## 手順

### 1. 事前準備（1 回だけ）

```bash
gcloud auth application-default login
gcloud config set project <PROJECT_ID>

# tfstate 用バケットを作成し、versions.tf の backend の bucket 名を書き換える。
gcloud storage buckets create gs://<PROJECT_ID>-tfstate \
  --location=asia-northeast1 --uniform-bucket-level-access
```

### 2. 変数設定

```bash
cp terraform.tfvars.example terraform.tfvars
# project_id などを編集
```

### 3. apply

```bash
terraform init
terraform plan
terraform apply
```

初回はイメージが未 push のため、Service/Job はダミーイメージ
（`cloudrun/container/hello`）で作成される。実イメージは GitHub Actions が差し替える
（Terraform は image の変更を無視する設定）。

### 4. シークレットの値を投入

```bash
printf '%s' "$GEMINI_API_KEY"     | gcloud secrets versions add GEMINI_API_KEY --data-file=-
printf '%s' "$WEBSEARCH_API_KEY"  | gcloud secrets versions add WEBSEARCH_API_KEY --data-file=-
printf '%s' "$GOOGLE_MAPS_API_KEY"| gcloud secrets versions add GOOGLE_MAPS_API_KEY --data-file=-
printf '%s' "shiori"              | gcloud secrets versions add BASIC_AUTH_USER --data-file=-
printf '%s' "<好きなパスワード>"    | gcloud secrets versions add BASIC_AUTH_PASS --data-file=-
```

### 5. GitHub Actions 用の Variables を設定

`terraform output` の値を GitHub リポジトリの **Variables** に登録する:

| GitHub Variable | 値 |
| --- | --- |
| `GCP_PROJECT_ID` | プロジェクト ID |
| `GCP_REGION` | `asia-northeast1` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `terraform output -raw workload_identity_provider` |
| `GCP_DEPLOY_SA` | `terraform output -raw deployer_service_account` |
| `SERVICE_NAME` | `shiori` |

### 6. 初回デプロイ

`main` へ push すると `deploy` ワークフローが実イメージをビルド・デプロイする。
スキーマ変更を伴うときは先に `migrate` ワークフローを手動実行する。

## 注意

- コンテナ内スクリプト（`migrate-job.sh` / Litestream 起動 entrypoint / `db/migrate.ts`）は
  **アプリ側実装**で用意する。CI/インフラはそれらの存在を前提にしている。
- マイグレーションは利用者のいない時間帯に実行する（単一ライタ窓の制約）。
