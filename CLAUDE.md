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
