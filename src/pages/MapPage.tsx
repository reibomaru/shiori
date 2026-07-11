import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { TbLayoutSidebarRightExpand } from "react-icons/tb";
import { useTrip } from "../store";
import { api, type SpotRating } from "../api";
import MapView from "../components/MapView";
import MoveProcess from "../components/MoveProcess";

const PANEL_MIN = 280;
const PANEL_MAX = 640;

export default function MapPage() {
  const { data, reload } = useTrip();
  const [selectedLeg, setSelectedLeg] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  // いま地図に見えているスポット id（一覧の並び替えに使う）
  const [visibleSpotIds, setVisibleSpotIds] = useState<string[]>([]);
  // 候補スポットのピン表示/非表示（パネルの候補スポット見出し横のチェックで切替）
  const [showSpots, setShowSpots] = useState(true);

  const spots = data?.spots ?? [];
  // 旅程に組み込まれた移動（leg_id）を、旅程の記載順（日→予定順）に並べた leg id 配列。
  const orderedLegIds = useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const d of [...(data?.days ?? [])].sort((a, b) => a.day_no - b.day_no))
      for (const it of [...d.items].sort((a, b) => a.sort_order - b.sort_order))
        if (it.leg_id != null && !seen.has(it.leg_id)) {
          seen.add(it.leg_id);
          ids.push(it.leg_id);
        }
    return ids;
  }, [data?.days]);
  // 詳細を開いている候補スポットは URL クエリ（?spot=<id>）で保持し、共有・復元できるようにする
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSpot = searchParams.get("spot");
  const detailSpotId =
    rawSpot != null && spots.some((s) => s.id === rawSpot) ? rawSpot : null;

  const openSpotDetail = useCallback(
    (id: string) => {
      setPanelOpen(true);
      // スポット選択時は鉄道などの区間ハイライトを解除する
      setSelectedLeg(null);
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set("spot", String(id));
          return p;
        },
        { replace: false }
      );
    },
    [setSearchParams]
  );
  const closeSpotDetail = useCallback(() => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("spot");
        return p;
      },
      { replace: false }
    );
  }, [setSearchParams]);

  // サイドパネルの幅（splitter ドラッグで調整）
  const [panelWidth, setPanelWidth] = useState(320);
  const draggingRef = useRef(false);

  // Google マップの評価・写真。一覧ページと同じソース（DB に30日キャッシュ）。
  const [ratings, setRatings] = useState<Record<string, SpotRating | null>>({});
  const idsKey = spots.map((s) => s.id).join(",");
  useEffect(() => {
    if (spots.length === 0) return;
    let cancelled = false;
    api
      .getSpotRatings()
      .then((r) => {
        if (!cancelled) setRatings(r.ratings ?? {});
      })
      .catch(() => {
        /* 取得失敗時は写真・★ なしで続行 */
      });
    return () => {
      cancelled = true;
    };
  }, [idsKey, spots.length]);

  const clampWidth = (w: number) => Math.min(Math.max(w, PANEL_MIN), Math.min(PANEL_MAX, window.innerWidth - 160));

  const startDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      // パネルは右端固定なので、幅 = ウィンドウ右端 - カーソル位置
      setPanelWidth(clampWidth(window.innerWidth - e.clientX));
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  if (!data) return null;
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* 地図：全面 */}
      <div className="absolute inset-0">
        <MapView
          route={data.route}
          legs={data.legs}
          spots={data.spots}
          selectedLeg={selectedLeg}
          onSelectLeg={setSelectedLeg}
          onSelectSpot={openSpotDetail}
          focusSpotId={detailSpotId}
          rightInset={panelOpen ? panelWidth : 0}
          onVisibleSpotsChange={setVisibleSpotIds}
          showSpots={showSpots}
          itineraryLegOrder={orderedLegIds}
        />
      </div>

      {/* 移動の工程：地図上にオーバーレイ（背景は透過） */}
      {panelOpen ? (
        <div className="absolute right-0 top-0 z-10 flex h-full" style={{ width: panelWidth }}>
          {/* 幅調整スプリッター */}
          <div
            onPointerDown={startDrag}
            role="separator"
            aria-orientation="vertical"
            aria-label="パネルの幅を調整"
            className="group relative w-2 shrink-0 cursor-col-resize touch-none"
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-300/70 transition-colors group-hover:bg-cyan-500/80" />
          </div>
          <MoveProcess
            legs={data.legs}
            spots={data.spots}
            ratings={ratings}
            visibleSpotIds={visibleSpotIds}
            showSpots={showSpots}
            onToggleShowSpots={() => setShowSpots((v) => !v)}
            detailSpotId={detailSpotId}
            onOpenSpot={openSpotDetail}
            onCloseDetail={closeSpotDetail}
            reload={reload}
            selectedLeg={selectedLeg}
            onSelectLeg={setSelectedLeg}
            onClose={() => setPanelOpen(false)}
            itineraryLegOrder={orderedLegIds}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          aria-label="移動の工程を開く"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-white/95 text-slate-600 shadow-md ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <TbLayoutSidebarRightExpand size={20} />
        </button>
      )}
    </div>
  );
}
