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

（PR #89 で追記）

---

## 3. デプロイ / CI（#90）

> このセクションは PR #90（`ci.yml` / `deploy-staging.yml` / `deploy-production.yml`）マージ後に実行する。

（PR #90 で追記）
