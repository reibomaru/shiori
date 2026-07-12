// 移動データ（leg）を OSRM で作成する UI。出発地・目的地を選び、
// 複数の経路候補から 1 つを選んで確定 → POST /api/legs で保存する。
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FaTrain,
  FaPlane,
  FaCableCar,
  FaCar,
  FaPersonWalking,
  FaPlus,
  FaArrowRightLong,
  FaRoute,
  FaMagnifyingGlass,
  FaLocationDot,
  FaXmark,
} from "react-icons/fa6";
import type { IconType } from "react-icons";
import { api, type OsrmRoute, type GeocodeResult } from "../../api";

export interface Place {
  name: string;
  lng: number;
  lat: number;
}

const MODES: { key: string; label: string; Icon: IconType; color: string }[] = [
  { key: "train", label: "鉄道", Icon: FaTrain, color: "#0e7490" },
  { key: "flight", label: "飛行機", Icon: FaPlane, color: "#2563eb" },
  { key: "bus", label: "バス・登山", Icon: FaCableCar, color: "#0891b2" },
  { key: "car", label: "車", Icon: FaCar, color: "#d97706" },
  { key: "walk", label: "徒歩", Icon: FaPersonWalking, color: "#16a34a" },
];

const fmtKm = (m: number) => `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
const fmtDur = (s: number) => {
  const min = Math.round(s / 60);
  if (min < 60) return `${min} 分`;
  return `${Math.floor(min / 60)} 時間 ${min % 60} 分`;
};

/**
 * 出発地・目的地の入力。フリーテキスト（Photon でジオコード補完）＋
 * 登録済みの地点（スポット/ルート）のクイック選択を併用する。
 * OSRM は座標しか受け取らないため、選択時に必ず {name,lng,lat} を確定させる。
 */
function PlaceInput({
  places,
  bias,
  value,
  onChange,
  placeholder,
  tag,
}: {
  places: Place[];
  bias?: { lat: number; lng: number };
  value: Place | null;
  onChange: (p: Place) => void;
  placeholder: string;
  tag?: string; // OSM 種別フィルタ（例: 空港 = aeroway:aerodrome）
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 入力をデバウンスして Photon を呼ぶ（2 文字以上）。
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const kw = q.trim();
    if (kw.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await api.geocode(kw, bias, tag);
        setResults(r.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, bias?.lat, bias?.lng, tag]);

  const kw = q.trim().toLowerCase();
  const knownMatches = (kw ? places.filter((p) => p.name.toLowerCase().includes(kw)) : places).slice(0, 6);

  function pick(p: Place) {
    onChange(p);
    setOpen(false);
    setQ("");
    setResults([]);
  }

  return (
    <div className="relative min-w-0 flex-1">
      <div className="relative">
        <FaMagnifyingGlass className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400" />
        <input
          value={open ? q : value?.name ?? ""}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          placeholder={placeholder}
          className="w-full rounded-md border border-slate-300 py-1.5 pl-7 pr-2 text-sm focus:border-cyan-500 focus:outline-none"
        />
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-slate-200">
            {/* 登録済み地点（クイック選択） */}
            {knownMatches.length > 0 && (
              <>
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  登録済みの地点
                </p>
                {knownMatches.map((p, i) => (
                  <button
                    key={`known-${p.name}-${i}`}
                    type="button"
                    onClick={() => pick(p)}
                    className="flex w-full items-center gap-2 truncate rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-100"
                  >
                    <FaLocationDot className="shrink-0 text-[10px] text-cyan-600" />
                    {p.name}
                  </button>
                ))}
              </>
            )}
            {/* ジオコード検索結果 */}
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              検索結果{loading ? "（検索中…）" : ""}
            </p>
            {q.trim().length < 2 ? (
              <p className="px-2 py-2 text-[11px] text-slate-400">2 文字以上で地名を検索</p>
            ) : results.length === 0 && !loading ? (
              <p className="px-2 py-2 text-[11px] text-slate-400">該当なし</p>
            ) : (
              results.map((r, i) => (
                <button
                  key={`geo-${i}`}
                  type="button"
                  onClick={() => pick({ name: r.name, lng: r.lng, lat: r.lat })}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-100"
                >
                  <FaMagnifyingGlass className="mt-0.5 shrink-0 text-[9px] text-slate-400" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-700">{r.name}</span>
                    {r.label && r.label !== r.name && (
                      <span className="block truncate text-[10px] text-slate-400">{r.label}</span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function LegCreator({
  places,
  nextOrderIndex,
  onCreated,
}: {
  places: Place[];
  nextOrderIndex: number;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  // 検索の近傍バイアス（登録地点の重心）。旅行エリア周辺の候補を優先する。
  const bias = places.length
    ? {
        lat: places.reduce((s, p) => s + p.lat, 0) / places.length,
        lng: places.reduce((s, p) => s + p.lng, 0) / places.length,
      }
    : undefined;
  const [mode, setMode] = useState("train");
  const [vias, setVias] = useState<(Place | null)[]>([]); // 経由地（飛行機は経由空港 / それ以外は経路の経由地）
  const [candidates, setCandidates] = useState<OsrmRoute[] | null>(null);
  const [sel, setSel] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 飛行機は OSRM を使わず、空港（経由地含む）を直接つないで保存する。
  const isFlight = mode === "flight";
  // 経由地を変更したら、取得済みの経路候補は無効化する（OSRM 再計算が必要）。
  const addVia = () => {
    setVias((v) => [...v, null]);
    setCandidates(null);
  };
  const setVia = (i: number, p: Place) => {
    setVias((v) => v.map((x, j) => (j === i ? p : x)));
    setCandidates(null);
  };
  const removeVia = (i: number) => {
    setVias((v) => v.filter((_, j) => j !== i));
    setCandidates(null);
  };

  function reset() {
    setFrom(null);
    setTo(null);
    setVias([]);
    setMode("train");
    setCandidates(null);
    setSel(0);
    setError(null);
  }

  // モーダル表示中は Escape で閉じる。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        reset();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function fetchCandidates() {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    setCandidates(null);
    try {
      const viaCoords = (vias.filter(Boolean) as Place[]).map((v) => `${v.lng},${v.lat}`);
      const r = await api.osrmRoute(`${from.lng},${from.lat}`, `${to.lng},${to.lat}`, "driving", viaCoords);
      if (!r.routes?.length) setError(r.error ? `経路が見つかりません（${r.error}）` : "経路が見つかりません");
      else {
        setCandidates(r.routes);
        setSel(0);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!from || !to) return;
    setSaving(true);
    try {
      if (isFlight) {
        // 空港を直接つないだ直線ルート（出発 → 経由空港… → 到着）。
        const pts = [from, ...(vias.filter(Boolean) as Place[]), to];
        await api.createLeg({
          order_index: nextOrderIndex,
          from_name: from.name,
          to_name: to.name,
          mode: "flight",
          geojson: { type: "LineString", coordinates: pts.map((p) => [p.lng, p.lat]) },
          note: pts.map((p) => p.name).join(" → "),
        });
      } else {
        if (!candidates) return;
        const chosen = candidates[sel];
        // 通過サマリ。ユーザー指定の経由地があればそれを優先、無ければ逆ジオコードの通過町名。
        const viaNames = (vias.filter(Boolean) as Place[]).map((v) => v.name);
        const pass = viaNames.length ? viaNames : chosen.waypoints ?? [];
        await api.createLeg({
          order_index: nextOrderIndex,
          from_name: from.name,
          to_name: to.name,
          mode,
          geojson: chosen.geometry,
          note: `${fmtKm(chosen.distance)} / ${fmtDur(chosen.duration)}${
            pass.length ? ` · 通過: ${pass.join(" → ")}` : chosen.via ? ` · ${chosen.via}` : ""
          }`,
        });
      }
      onCreated();
      reset();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function close() {
    reset();
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-cyan-300 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-50"
      >
        <FaPlus className="text-xs" /> 移動を作成
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[600] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:p-8"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <div className="my-auto w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
                <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                  <FaRoute className="text-cyan-700" /> 移動を作成
                </h3>
                <button
                  type="button"
                  onClick={close}
                  aria-label="閉じる"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <FaXmark size={20} />
                </button>
              </div>

              <div className="space-y-4 p-5">
                {/* 交通手段 */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">交通手段</label>
                  <div className="flex flex-wrap gap-1.5">
                    {MODES.map((m) => {
                      const on = mode === m.key;
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => {
                            setMode(m.key);
                            setCandidates(null);
                            setError(null);
                          }}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
                            on ? "text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                          }`}
                          style={on ? { background: m.color } : undefined}
                        >
                          <m.Icon className="text-xs" /> {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {isFlight ? (
                  /* 飛行機：空港を直接入力（経由地つき）。OSRM は使わない。 */
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-500">空港（出発 → 経由 → 到着）</label>
                    <PlaceInput places={places} bias={bias} tag="aeroway:aerodrome" value={from} onChange={setFrom} placeholder="出発空港（地名で検索）" />
                    {vias.map((v, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="shrink-0 text-slate-300">↳</span>
                        <PlaceInput places={places} bias={bias} tag="aeroway:aerodrome" value={v} onChange={(p) => setVia(i, p)} placeholder={`経由空港 ${i + 1}`} />
                        <button
                          type="button"
                          onClick={() => removeVia(i)}
                          aria-label="経由地を削除"
                          className="shrink-0 rounded p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <FaXmark />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addVia}
                      className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-cyan-300 hover:text-cyan-700"
                    >
                      <FaPlus className="text-[10px]" /> 経由空港を追加
                    </button>
                    <PlaceInput places={places} bias={bias} tag="aeroway:aerodrome" value={to} onChange={setTo} placeholder="到着空港（地名で検索）" />
                    <p className="text-[11px] leading-relaxed text-slate-400">
                      入力した空港を直線でつないで保存します（経路計算なし）。経由空港を追加すると、その空港を通る線になります。
                    </p>
                  </div>
                ) : (
                  /* それ以外：出発地・目的地から経路候補を計算 */
                  <>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-500">出発地・目的地</label>
                      <div className="flex items-center gap-2">
                        <PlaceInput places={places} bias={bias} value={from} onChange={setFrom} placeholder="出発地（地名で検索）" />
                        <FaArrowRightLong className="shrink-0 text-slate-400" />
                        <PlaceInput places={places} bias={bias} value={to} onChange={setTo} placeholder="目的地（地名で検索）" />
                      </div>
                      {/* 経由地（from → via… → to の順で経路を計算） */}
                      <div className="mt-2 space-y-2">
                        {vias.map((v, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <span className="shrink-0 text-slate-300">↳</span>
                            <PlaceInput places={places} bias={bias} value={v} onChange={(p) => setVia(i, p)} placeholder={`経由地 ${i + 1}（地名で検索）`} />
                            <button
                              type="button"
                              onClick={() => removeVia(i)}
                              aria-label="経由地を削除"
                              className="shrink-0 rounded p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                            >
                              <FaXmark />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={addVia}
                          className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-cyan-300 hover:text-cyan-700"
                        >
                          <FaPlus className="text-[10px]" /> 経由地を追加
                        </button>
                        {vias.some(Boolean) && (
                          <p className="text-[11px] leading-relaxed text-slate-400">
                            指定した経由地を通る経路を計算します（出発地 → 経由地… → 目的地）。
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={fetchCandidates}
                      disabled={!from || !to || loading}
                      className="w-full rounded-lg bg-cyan-600 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-40"
                    >
                      {loading ? "経路を取得中…" : "ルート候補を取得"}
                    </button>

                    {error && <p className="text-sm text-rose-600">{error}</p>}
                  </>
                )}

                {!isFlight && candidates && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500">候補から選択（道路ルートで計算）</p>
                    {candidates.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSel(i)}
                        className={`block w-full rounded-xl border px-3.5 py-2.5 text-left transition ${
                          sel === i ? "border-cyan-500 bg-cyan-50/60 ring-1 ring-cyan-400" : "border-slate-200 bg-white hover:border-cyan-300"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2.5 font-medium text-slate-700">
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                                sel === i ? "border-cyan-600 bg-cyan-600" : "border-slate-300"
                              }`}
                            >
                              {sel === i && <span className="h-2 w-2 rounded-full bg-white" />}
                            </span>
                            候補 {i + 1}
                          </span>
                          <span className="text-sm font-medium text-slate-600">
                            {fmtKm(r.distance)} · {fmtDur(r.duration)}
                          </span>
                        </div>
                        {r.waypoints && r.waypoints.length > 0 ? (
                          <p className="mt-1.5 pl-7 text-xs leading-relaxed text-slate-600">
                            <span className="text-slate-400">通過：</span>
                            {[from?.name, ...r.waypoints, to?.name].filter(Boolean).join(" → ")}
                          </p>
                        ) : r.via ? (
                          <p className="mt-1.5 pl-7 text-xs leading-relaxed text-slate-500">
                            <span className="text-slate-400">主な経路：</span>
                            {r.via}
                          </p>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 p-5">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  キャンセル
                </button>
                <button
                  onClick={confirm}
                  disabled={saving || (isFlight ? !(from && to) : !candidates)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  {saving ? "保存中…" : "確定して移動を追加"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
