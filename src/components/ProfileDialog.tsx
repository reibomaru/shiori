// プロフィール編集ダイアログ（表示名・アバター）。
// ネイティブ確認は使わず、見た目を揃えた自前モーダルにする（CLAUDE.md 準拠）。
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaCamera, FaXmark } from "react-icons/fa6";
import { api } from "../api";
import { resizeToSquareDataUrl } from "../lib/resizeImage";
import { useAuth } from "./AuthGate";
import { Avatar } from "./Avatar";

export default function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, applyMe } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  // 入力欄は「本人が設定した表示名」だけを保持し、未設定時は placeholder に name を出す。
  const [displayName, setDisplayName] = useState(me.displayName ?? "");
  // avatar: undefined=変更なし / string=新規 data URL / null=削除
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined);
  const [preview, setPreview] = useState<string | null>(me.avatarUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 開くたびに現在値へリセットする。
  useEffect(() => {
    if (!open) return;
    setDisplayName(me.displayName ?? "");
    setAvatar(undefined);
    setPreview(me.avatarUrl ?? null);
    setError(null);
    setBusy(false);
  }, [open, me.displayName, me.avatarUrl]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pickFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await resizeToSquareDataUrl(file, 256);
      setAvatar(dataUrl);
      setPreview(dataUrl);
    } catch {
      setError("この画像は読み込めませんでした。別の画像（PNG / JPEG）でお試しください。");
    }
  };

  const removeAvatar = () => {
    setAvatar(null);
    setPreview(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const patch: { displayName?: string; avatar?: string | null } = {};
    // 表示名は現在の設定値から変わったときだけ送る（空文字はサーバ側で「未設定」に戻す）。
    if (displayName.trim() !== (me.displayName ?? "")) patch.displayName = displayName.trim();
    if (avatar !== undefined) patch.avatar = avatar;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    try {
      const updated = await api.updateProfile(patch);
      applyMe(updated);
      onClose();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="プロフィール編集"
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">プロフィール</h3>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <FaXmark />
          </button>
        </div>

        {/* アバター */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <Avatar src={preview} name={me.displayName ?? me.name} email={me.email} size={88} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="画像を変更"
              title="画像を変更"
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-cyan-700 text-white shadow transition-colors hover:bg-cyan-600"
            >
              <FaCamera size={13} />
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <button type="button" onClick={() => fileRef.current?.click()} className="font-medium text-cyan-700 hover:underline">
              画像をアップロード
            </button>
            {preview && (
              <button type="button" onClick={removeAvatar} className="font-medium text-slate-400 hover:text-rose-600 hover:underline">
                削除
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/*"
            className="hidden"
            onChange={(e) => {
              void pickFile(e.target.files?.[0]);
              e.target.value = ""; // 同じファイルの再選択も検知できるようにする
            }}
          />
        </div>

        {/* 表示名 */}
        <label className="mt-5 block">
          <span className="mb-1 block text-xs font-medium text-slate-500">表示名</span>
          <input
            type="text"
            value={displayName}
            maxLength={60}
            placeholder={me.name || "表示名"}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
          />
          <span className="mt-1 block text-[11px] text-slate-400">
            未入力の場合はアカウント名（{me.name || me.email}）が使われます。
          </span>
        </label>

        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
