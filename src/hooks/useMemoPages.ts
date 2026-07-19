// 複数ページのメモを管理するフック。
// 一覧の取得・作成・更新・削除・画像からの抽出・元画像の削除をまとめる。
// ページの選択はルーティング（/memo・/memo/:id）側で行うため、ここでは保持しない。
import { useCallback, useEffect, useState } from "react";
import type { MemoPage } from "../types";
import { api, type MemoImage } from "../api";

export interface UseMemoPages {
  pages: MemoPage[];
  loading: boolean;
  error: string | null;
  create: () => Promise<MemoPage | null>;
  update: (id: string, patch: Partial<MemoPage>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** 画像を抽出・保存する。抽出できなかった場合の警告文（無ければ null）を返す。 */
  extract: (id: string, images: MemoImage[]) => Promise<string | null>;
  removeImage: (pageId: string, imageId: string) => Promise<void>;
  /** 画像の実体を差し替える（回転保存など）。 */
  replaceImage: (pageId: string, imageId: string, image: MemoImage) => Promise<void>;
  /** サーバから一覧を取り直す（エージェント編集の反映後などに使う）。 */
  reload: () => Promise<void>;
}

export function useMemoPages(): UseMemoPages {
  const [pages, setPages] = useState<MemoPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setPages(await api.listMemoPages());
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await api.listMemoPages();
        if (alive) setPages(list);
      } catch (e) {
        if (alive) setError(String(e instanceof Error ? e.message : e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /** サーバから返ったページで一覧を差し替える（無ければ末尾に追加）。 */
  const upsertLocal = useCallback((page: MemoPage) => {
    setPages((prev) => {
      const i = prev.findIndex((p) => p.id === page.id);
      if (i === -1) return [...prev, page];
      const next = [...prev];
      next[i] = page;
      return next;
    });
  }, []);

  const create = useCallback(async () => {
    try {
      const page = await api.createMemoPage({ title: "無題のメモ" });
      if (page) upsertLocal(page);
      return page;
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      return null;
    }
  }, [upsertLocal]);

  const update = useCallback(
    async (id: string, patch: Partial<MemoPage>) => {
      // 楽観的に反映してからサーバへ送る（入力の体感を軽くする）。
      setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      const page = await api.updateMemoPage(id, patch as Record<string, unknown>);
      if (page) upsertLocal(page);
    },
    [upsertLocal],
  );

  const remove = useCallback(async (id: string) => {
    await api.deleteMemoPage(id);
    setPages((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const extract = useCallback(
    async (id: string, images: MemoImage[]) => {
      const { warning, ...page } = await api.extractMemoPage(id, images);
      upsertLocal(page as MemoPage);
      return warning ?? null;
    },
    [upsertLocal],
  );

  const removeImage = useCallback(async (pageId: string, imageId: string) => {
    // 楽観的に一覧から除外してからサーバへ削除を送る。
    setPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, images: p.images.filter((im) => im.id !== imageId) } : p)),
    );
    await api.deleteMemoImage(imageId);
  }, []);

  const replaceImage = useCallback(async (pageId: string, imageId: string, image: MemoImage) => {
    const meta = await api.replaceMemoImage(imageId, image);
    // 差し替え後のメタ（updated_at 更新）で置き換える → 表示 URL の ?v= が変わり再取得される。
    setPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, images: p.images.map((im) => (im.id === imageId ? meta : im)) } : p)),
    );
  }, []);

  return { pages, loading, error, create, update, remove, extract, removeImage, replaceImage, reload };
}
