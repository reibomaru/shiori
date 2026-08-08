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

Basic 認証を通った後は本番同様 Google SSO でログインする。まず一度ログインを試みると、名前付き DB `staging` の `users` コレクションに `allowed=false`（承認待ち）で JIT 登録される。その後、対象ドキュメントを `allowed=true` にして承認する。

`gcloud` には Firestore ドキュメントを更新するコマンドが無いため、Firestore REST API（`databases/staging` を明示）を叩く:

```bash
# 例: 対象ユーザーの Google sub をキーに allowed=true。
SUB="<GOOGLE_SUB>"
curl -sS -X PATCH \
  "https://firestore.googleapis.com/v1/projects/shinbun-489215/databases/staging/documents/users/${SUB}?updateMask.fieldPaths=allowed" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{"fields":{"allowed":{"booleanValue":true}}}'
```

> GCP コンソールからでも可（Firestore で **データベース `staging` を選択** → `users` → 対象ドキュメントの `allowed` を `true` に）。
> `dev-login` バイパスは staging（`NODE_ENV=production`）では無効。開発者は SSO でログインする。

### （将来オプション）`staging.booklet-ai.com`

独自ドメインが必要になったら、`load_balancer.tf` / `dns.tf` に staging 用の NEG・backend・証明書・`staging.booklet-ai.com` の A/AAAA を追加し、Cloud Run の ingress を LB 限定へ戻す。今回はコスト最小化のため見送り。

---

## 3. デプロイ / CI（#90）

> このセクションは PR #90（`ci.yml` / `deploy-staging.yml` / `deploy-production.yml`）マージ後に実行する。

（PR #90 で追記）
