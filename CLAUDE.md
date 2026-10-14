# CLAUDE.md

このリポジトリで作業するときの指針。特に UI の一貫性に関する制約をまとめる。

## UI 規約

### 削除・破壊的操作は必ず確認モーダルを挟む
- ネイティブの `window.confirm()` / `alert()` は使わない。代わりに `src/components/ConfirmDialog.tsx` を使う。
- 新しく削除（や取り消し不可の破壊的操作）を追加するときも、必ず `ConfirmDialog` を経由させる。
- 実装パターン: ローカル state（例 `confirmOpen` / `deleting`）でダイアログ開閉と処理中を管理し、`onConfirm` で実 API を呼ぶ。処理中は `busy` でボタンを無効化する。
- 既存の適用箇所: スポット削除（`Spots.tsx`）、旅程の予定削除（`builder/ItineraryBuilder.tsx`）、実費の削除（`Expenses.tsx`）、会話履歴の削除（`spotChat/SpotChat.tsx`）。

### ネイティブのフォーム部品は見た目を揃えた自前実装にする
- OS 依存で見た目が崩れる `<select>` は避け、自前のドロップダウンを使う（例: 会話履歴の `spotChat/SessionSelect.tsx`）。

### アイコン
- 既存アイコンは `react-icons/fa6` を使用。
- パネルの開閉系など [open-cowork](https://github.com/reibomaru/open-cowork) と揃えたいものは `lucide-react` を使う（例: `PanelRightOpen` / `PanelRightClose`）。

### 編集モードは持たない（常時編集）
- 編集モードのトグル（旧 `EditToggle` / `useTrip` の `edit`）は廃止済み。各ページは常時、追加・編集・削除を直接操作できる。
- 旅程（`builder/ItineraryBuilder`）・スポット候補（`Spots.tsx`）・費用（`Expenses.tsx`）いずれも常時編集。削除だけは必ず `ConfirmDialog` を挟む。

### 印刷（PDF 出力）
- 画面操作用の UI（トグル・ボタン等）は印刷に出さないよう `no-print` クラスを付ける。

## 多言語対応（i18n）

- 対応言語は日本語 / 英語 / フランス語 / 中国語（簡体字）（`src/i18n.ts` の `SUPPORTED_LANGUAGES`）。言語を増やすときは `src/locales/{lng}/` に全名前空間の JSON を揃え、`SUPPORTED_LANGUAGES` / `LANGUAGE_LABELS` / `LANGUAGE_SHORT`、`server/i18n.ts` の `LANGS` と `MESSAGES` を更新する。
- UI 文言はベタ書きせず `useTranslation` で `t()` を使う。コンポーネント外（hooks / lib）では `i18n.t(key, { ns })` を使う。ログイン前の LP も `landing` 名前空間で翻訳する。
- 言語の判定順は `?lng=` → `localStorage`（`shiori-lang`）→ ブラウザ言語。選択言語は `X-Lang` ヘッダ（`langHeader()`）と同名 Cookie でサーバにも伝える。
- サーバ側のユーザー向け文言（API のエラー・警告、OAuth の承認待ち/エラーページ、既定値）は `server/i18n.ts` の `tc(c, key)` / `t(lang, key)` を使う。AI キー関連のエラーは `LocalizedError` を継承し、返却時に `translateError` で翻訳する。
- AI エージェントのシステムプロンプトは日本語のまま、応答言語だけ `PROMPT_LANG_NAME[lang]` で指示する（`spotSystemPrompt(lang)` / `memoSystemPrompt(lang)` / `extract.ts`）。
- DB に保存する分類値（実費の費目 `宿泊/交通/食事/観光/買い物/その他`、アイコンキー、予定種別）は翻訳しない。表示だけ `src/lib/expenseCategory.ts` の `expenseCategoryKey` や `spots:icon.*` / `itinerary:itemType.*` で翻訳する。
- `index.html` の OG/メタタグは静的（日本語）のまま。
