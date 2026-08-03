# 開発環境セットアップ Runbook

Epic #44「開発環境の整備」を**有効化**するための手動手順。コード/設定（Terraform・ワークフロー・ドキュメント）は各 PR で入るが、以下は課金・不可逆・チーム影響があるため、リポジトリ管理者が意図して実行する。

前提: `gh`（認証済み）・`gcloud`（該当プロジェクトの権限）・`terraform`。GCP プロジェクトは `shinbun-489215`、リージョンは `asia-northeast1`。

---

## 1. ブランチ運用（#91）

### `develop` ブランチを作成する

```bash
git fetch origin
git switch -c develop origin/main
git push -u origin develop
```

- **default ブランチは `main` のまま**（本番）。`develop` は統合/ステージング用の常設ブランチ。
- 以後の feature 作業は `develop` を起点にし、`develop` への PR で統合する。

### リリースラベルを登録する

`.github/labels.yml` の定義に合わせて作成する（bump 判定・リリースノートのカテゴリ分けに使う）。

```bash
gh label create "release:major" --color B60205 --description "SemVer: major bump（破壊的変更）"
gh label create "release:minor" --color 0E8A16 --description "SemVer: minor bump（後方互換の機能追加）"
gh label create "release:patch" --color FBCA04 --description "SemVer: patch bump（バグ修正・小改善）"
gh label create "feature"       --color 1D76DB --description "リリースノート: Features"
gh label create "fix"           --color D93F0B --description "リリースノート: Bug Fixes"
gh label create "chore"         --color CFD3D7 --description "リリースノート: Maintenance"
```

### branch protection を設定する

`develop` と `main` の両方に、直 push 禁止・PR 必須・レビュー必須・PR CI（`ci.yml` の `quality` チェック）成功必須をかける。GitHub UI（Settings → Branches）または API で:

```bash
# 例: main。develop も branch 名を変えて同様に。
gh api -X PUT repos/reibomaru/travel-plans/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["quality"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "restrictions": null
}
JSON
```

> `contexts` の名前は `ci.yml` のジョブ名（`quality`）に合わせる。CI が一度も走っていないと status check 名が候補に出ないため、先に PR を1本流してから設定するとよい。

---

## 2. ステージング環境（#89）

> このセクションは PR #89（`infra/terraform` の staging リソース + Basic 認証ゲート）マージ後に実行する。

ステージングは本番と分離した Cloud Run（`shiori-staging`）で、`run.app` 直アクセス + **アプリ側 Basic 認証**を壁にする（LB / DNS / 証明書は複製しない）。

### 2-1. Terraform で staging リソースを作成

```bash
cd infra/terraform
terraform plan    # staging.* の新規追加のみ・本番リソースに変更が無いことを確認
terraform apply
```

作成されるもの: Cloud Run `shiori-staging` / Job `shiori-staging-migrate` / state・sessions バケット（`…-staging-state` / `…-staging-sessions`）/ 名前付き Firestore DB `staging` / Basic 認証シークレットの入れ物（`STAGING_BASIC_AUTH_USER` / `STAGING_BASIC_AUTH_PASSWORD`）。

### 2-2. Basic 認証の資格情報を投入

```bash
printf '%s' "dev"                 | gcloud secrets versions add STAGING_BASIC_AUTH_USER --data-file=-
printf '%s' "$(openssl rand -hex 16)" | gcloud secrets versions add STAGING_BASIC_AUTH_PASSWORD --data-file=-
```

- 未投入だとサーバ起動時に警告が出て Basic 認証は無効のまま（壁が無くなる）ので、**apply 直後に必ず投入**する。
- GEMINI / WEBSEARCH / GOOGLE_MAPS / GOOGLE_OAUTH_* / SESSION_SECRET は本番と同じ入れ物を再利用する（すでに値がある前提）。分離したい場合は staging 専用シークレットを別途用意する。

### 2-3. OAuth リダイレクト URI と ベース URL を確定

```bash
terraform output staging_service_url        # 例: https://shiori-staging-xxxx.asia-northeast1.run.app
```

1. その URL を `variables.tf` の `staging_app_base_url`（または `terraform.tfvars`）に設定して再 `terraform apply`。
2. GCP コンソール → APIとサービス → 認証情報 → OAuth 2.0 クライアントの **承認済みリダイレクト URI** に `<staging_service_url>/auth/google` を追加。

### 2-4. staging の利用許可（Firestore）

Basic 認証を通った後は本番同様 Google SSO でログインする。名前付き DB `staging` の `users` コレクションで開発者を承認する:

```bash
# 例: 対象ユーザーの Google sub をキーに allowed=true。
gcloud firestore documents update \
  "projects/shinbun-489215/databases/staging/documents/users/<GOOGLE_SUB>" \
  --update-mask allowed --data '{"fields":{"allowed":{"booleanValue":true}}}'
```

> `dev-login` バイパスは staging（`NODE_ENV=production`）では無効。開発者は SSO でログインする。

### （将来オプション）`staging.booklet-ai.com`

独自ドメインが必要になったら、`load_balancer.tf` / `dns.tf` に staging 用の NEG・backend・証明書・`staging.booklet-ai.com` の A/AAAA を追加し、Cloud Run の ingress を LB 限定へ戻す。今回はコスト最小化のため見送り。

---

## 3. デプロイ / CI（#90）

> このセクションは PR #90（`ci.yml` / `deploy-staging.yml` / `deploy-production.yml` / `release-drafter.yml`）マージ後に実行する。

### 3-1. GitHub Environments を作成し変数を分離

`Settings → Environments` で `production` と `staging` を作成し、それぞれに Variables を設定する（従来リポジトリ変数だった `GCP_*` などを環境ごとに持たせる）。

| Variable | `production` | `staging` |
| --- | --- | --- |
| `GCP_PROJECT_ID` | `shinbun-489215` | `shinbun-489215` |
| `GCP_REGION` | `asia-northeast1` | `asia-northeast1` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `terraform output workload_identity_provider` | 同左 |
| `GCP_DEPLOY_SA` | `terraform output deployer_service_account` | 同左 |
| `SERVICE_NAME` | `shiori` | **`shiori-staging`** |
| `ARTIFACT_REPO` | （任意・未設定なら `shiori`） | （同左。staging も同じ `shiori` リポジトリを使う） |

```bash
# 例（gh CLI）。production も同様に --env production で。
gh variable set SERVICE_NAME --env staging --body "shiori-staging"
gh variable set GCP_PROJECT_ID --env staging --body "shinbun-489215"
# … 残りの変数も同様に設定
```

- WIF（`google_iam_workload_identity_pool_provider.github`）は `reibomaru/travel-plans` リポジトリ全体を許可しているため、staging/production で SA を共用できる。
- 必要なら `production` 環境に「required reviewers」等の保護ルールを付ける。

### 3-2. 初回の SemVer タグを打つ

`release-drafter` は直近タグからの bump を計算する。初回だけ基準タグを手で打っておく（`package.json` の version に合わせる）。

```bash
git checkout main && git pull
git tag v1.0.0
git push origin v1.0.0
```

以降は `develop → main` のリリース PR に付いた `release:*` ラベルで自動 bump される（ラベル無しは patch）。

### 3-3. 動作確認

- `develop` に何かを push（またはリリース PR 以外の feature をマージ）→ `deploy-staging` が走り、`shiori-staging` が更新される。
- `develop → main` のリリース PR をマージ → `deploy-production` が本番へデプロイし、成功後に `release` ジョブが `vX.Y.Z` タグ + リリースノートを発行する。

> ⚠ `deploy-production.yml` は従来の `deploy.yml` を改名・拡張したもの。PR #90 を `main` にマージすると、その push で本番デプロイ + 初回リリース処理が走る。マージは §3-1 / §3-2 を整えてから意図的に行うこと。
