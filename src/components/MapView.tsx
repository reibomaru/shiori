import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import DeckGL from "@deck.gl/react";
import { WebMercatorViewport, FlyToInterpolator, type PickingInfo } from "@deck.gl/core";
import { TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer, GeoJsonLayer, ArcLayer, ScatterplotLayer, TextLayer, IconLayer } from "@deck.gl/layers";
import { ZoomWidget, CompassWidget, FullscreenWidget } from "@deck.gl/widgets";
import "@deck.gl/widgets/stylesheet.css";
import type { Feature, FeatureCollection } from "geojson";
import type { RoutePoint, LegFeature, Spot } from "../types";
import { resolveSpotIcon, spotPinIcon } from "../spotIcons";
import bordersData from "../data/borders.geojson.json";

const COUNTRY_BORDERS = bordersData as unknown as FeatureCollection;

type RGB = [number, number, number];
const MODE_RGB: Record<string, RGB> = {
  train: [14, 116, 144],
  bus: [8, 145, 178],
  car: [217, 119, 6],
  flight: [37, 99, 235],
  walk: [22, 163, 74],
};
const BORDER_RGB: RGB = [220, 38, 38];
// 行きたいスポット候補（都市・ルートと色を差別化：マゼンタ系）
const SPOT_RGB: RGB = [219, 39, 119];
const rgb = (m: string): RGB => MODE_RGB[m] ?? [100, 116, 139];
const cssColor = (c: RGB) => `rgb(${c.join(",")})`;

// 2点間の大円距離（km）
const haversineKm = (a: [number, number], b: [number, number]) => {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};
// 巡航高度（km）。飛行機は約10km、地上移動は0（平坦）
const CRUISE_ALT_KM = 10;
// 実高度は距離比だとほぼ平坦になるため、空に浮いて見えるよう誇張＋上限でクランプ
const ALT_EXAGGERATION = 70;
const MAX_ARC_HEIGHT = 0.35;

// ベースマップ（地図タイル）の種類
type BaseId = "osm" | "satellite" | "topo" | "light";
// label は i18n（map.json の basemap.<id>）で表示するためここには持たない
const BASEMAPS: Record<BaseId, { url: string; maxZoom: number; attribution: string; dark?: boolean }> = {
  osm: {
    url: "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 19,
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    dark: true,
  },
  topo: {
    url: "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
    maxZoom: 17,
    attribution: "© OpenTopoMap (CC-BY-SA) · © OpenStreetMap contributors",
  },
  light: {
    url: "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    maxZoom: 19,
    attribution: "© CARTO · © OpenStreetMap contributors",
  },
};
const BASE_ORDER: BaseId[] = ["osm", "satellite", "topo", "light"];
// 衛星写真に重ねる地名・境界ラベル（ハイブリッド表示）
const SAT_REFERENCE = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

export default function MapView({
  route,
  legs,
  spots = [],
  selectedLeg = null,
  onSelectLeg,
  onSelectSpot,
  focusSpotId = null,
  rightInset = 0,
  onVisibleSpotsChange,
  showSpots = true,
  itineraryLegOrder = [],
}: {
  route: RoutePoint[];
  legs: LegFeature[];
  spots?: Spot[];
  selectedLeg?: number | null;
  onSelectLeg?: (order: number | null) => void;
  onSelectSpot?: (id: string) => void;
  focusSpotId?: string | null;
  rightInset?: number; // 右オーバーレイ（工程パネル）の幅。中心をその分だけ可視領域へ寄せる
  onVisibleSpotsChange?: (ids: string[]) => void; // いま地図に見えているスポット id
  showSpots?: boolean; // 候補スポットのピン表示/非表示（パネルのチェックで切替）
  itineraryLegOrder?: string[]; // 旅程に組み込まれた leg id を旅程順に並べた配列。指定時はこれだけを順番表示
}) {
  const { t } = useTranslation("map");
  const modeLabel = (m: string) => t(`mode.${m}`, { defaultValue: m });
  const [base, setBase] = useState<BaseId>("osm");
  const containerRef = useRef<HTMLDivElement>(null);
  const lastVisibleKey = useRef<string>("");

  // lat/lng を持つ候補スポットのみ地図に出せる。未設定分は注意表示用に件数を保持
  const spotPoints = spots
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({ ...s, position: [s.lng as number, s.lat as number] as [number, number] }));
  const spotsMissingCoords = spots.length - spotPoints.length;

  const cities = route
    .filter((p) => p.lat != null && p.lng != null)
    .map((p, i) => ({ index: i, name: p.name, hub: !!p.hub, note: p.note, position: [p.lng as number, p.lat as number] as [number, number] }));

  // 旅程に組み込まれた移動だけを旅程順に表示する（指定があれば）。
  const legSeq = new Map(itineraryLegOrder.map((id, i) => [id, i] as const));
  const itinActive = itineraryLegOrder.length > 0;
  const inItin = (legId: string | undefined) => !itinActive || (legId != null && legSeq.has(legId));

  // leg の端点（[lng,lat]）。geojson があれば両端、無ければ route の order_index 対応点。
  const cityByIndex = new Map(cities.map((c) => [c.index, c]));
  const legEndpoints = (f: LegFeature): [[number, number], [number, number]] | null => {
    const cs = f.geometry?.coordinates as [number, number][] | undefined;
    if (cs && cs.length >= 2) return [cs[0], cs[cs.length - 1]];
    const oi = f.properties.order_index;
    const a = cityByIndex.get(oi)?.position;
    const b = cityByIndex.get(oi + 1)?.position;
    return a && b ? [a, b] : null;
  };

  // 詳細ルート（GeoJSON 線・平面）として描くのは地上移動のみ。
  // 空路（flight）は geojson の有無にかかわらず、必ず下の arcs で高度アークとして描く。
  const detailed = legs.filter(
    (f) => f.properties.mode !== "flight" && f.geometry && f.geometry.coordinates.length >= 2 && inItin(f.properties.id)
  );
  const detailedOrders = new Set(detailed.map((f) => f.properties.order_index));
  const detailedFC: FeatureCollection = { type: "FeatureCollection", features: detailed as unknown as Feature[] };

  // アーク：空路（必ず高度付き）と、詳細線を持たない地上移動（高度0の直線）。
  // 空路は geojson の経由地（成田→香港→…）も各区間を高度アークでつなぐ。
  const arcs = legs
    .filter((f) => inItin(f.properties.id) && !detailedOrders.has(f.properties.order_index))
    .flatMap((f) => {
      const order = f.properties.order_index;
      const mode = f.properties.mode;
      const fromName = f.properties.from;
      const toName = f.properties.to;
      const cs = f.geometry?.coordinates as [number, number][] | undefined;
      if (mode === "flight" && cs && cs.length >= 2) {
        // 経由地を含め、各区間を 1 本ずつアーク化（経由便を正しく表現）
        return cs.slice(0, -1).map((p, i) => ({ order, from: p, to: cs[i + 1], mode, fromName, toName }));
      }
      const ep = legEndpoints(f);
      if (!ep) return [];
      return [{ order, from: ep[0], to: ep[1], mode, fromName, toName }];
    });

  // 地点マーカーは、旅程に残っている移動（leg）の端点になっているものだけ表示する。
  // route 配列の添字 i は leg.order_index に対応（route[i]→route[i+1] が leg i）。
  // 旅程から移動を削除すると、その端点が他の移動に使われていなければマーカーも消える。
  // ※ route 行自体は消さない（添字と order_index の対応＝線の描画を壊さないため）。
  const activeCityIndex = useMemo(() => {
    if (!itinActive) return null; // 旅程フィルタ未使用時は従来どおり全地点を表示
    const set = new Set<number>();
    for (const f of legs) {
      if (!inItin(f.properties.id)) continue;
      const oi = f.properties.order_index;
      set.add(oi); // 出発地 route[oi]
      set.add(oi + 1); // 到着地 route[oi+1]
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itinActive, legs, itineraryLegOrder.join(",")]);
  const visibleCities = activeCityIndex ? cities.filter((c) => activeCityIndex.has(c.index)) : cities;

  const initialViewState = useMemo(() => {
    const euro = cities.filter((c) => c.position[1] > 40 && c.position[1] < 52 && c.position[0] > -6 && c.position[0] < 20);
    const base = { longitude: 7, latitude: 46.4, zoom: 6.4, pitch: 0, bearing: 0 };
    if (euro.length < 2) return base;
    const lons = euro.map((c) => c.position[0]); const lats = euro.map((c) => c.position[1]);
    try {
      const vp = new WebMercatorViewport({ width: 1200, height: 700 });
      const { longitude, latitude, zoom } = vp.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: 90 }
      );
      return { longitude, latitude, zoom: Math.min(zoom, 9), pitch: 0, bearing: 0 };
    } catch {
      return base;
    }
  }, [JSON.stringify(cities.map((c) => c.position))]);

  // 視点はコントロール（2D/3D 切替・全体表示リセットのため）
  const [viewState, setViewState] = useState<any>(initialViewState);
  useEffect(() => { setViewState(initialViewState); }, [initialViewState]);
  const is3D = (viewState.pitch ?? 0) > 0;
  const toggle3D = () => setViewState((v: any) => ({ ...v, pitch: is3D ? 0 : 45, transitionDuration: 400 }));
  const resetView = () => setViewState({ ...initialViewState, transitionDuration: 600 });

  // スポットが選択されたら、その位置へ滑らかに移動（座標があるもののみ）。
  // 右側の工程パネルに隠れないよう、可視領域（パネルの左側）の中心へ寄せる。
  useEffect(() => {
    if (focusSpotId == null) return;
    const s = spots.find((x) => x.id === focusSpotId);
    if (!s || s.lat == null || s.lng == null) return;
    setViewState((v: any) => {
      const zoom = Math.max(v.zoom ?? 8, 9.5);
      let longitude = s.lng as number;
      let latitude = s.lat as number;
      const el = containerRef.current;
      if (el && rightInset > 0) {
        try {
          const vp = new WebMercatorViewport({
            width: el.clientWidth,
            height: el.clientHeight,
            longitude,
            latitude,
            zoom,
            pitch: v.pitch ?? 0,
            bearing: v.bearing ?? 0,
          });
          // 地図中心をスポットの右（東）へ inset/2 px ずらすと、スポットは可視領域の中央に来る
          const [lng2, lat2] = vp.unproject([el.clientWidth / 2 + rightInset / 2, el.clientHeight / 2]);
          longitude = lng2;
          latitude = lat2;
        } catch {
          /* 失敗時はスポット中心にフォールバック */
        }
      }
      return {
        ...v,
        longitude,
        latitude,
        zoom,
        transitionDuration: 900,
        transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }),
      };
    });
    // spots/rightInset は選択時点の値を使えばよい。focusSpotId の変化時のみ移動する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSpotId]);

  // いま地図に見えている（ピン表示中＋ビューポート内・パネルに隠れない）スポットを親へ通知。
  // 一覧の並び替えに使う。集合が変わったときだけ通知して再描画の連鎖を抑える。
  useEffect(() => {
    if (!onVisibleSpotsChange) return;
    const el = containerRef.current;
    let ids: string[] = [];
    if (el && showSpots && el.clientWidth > 0) {
      try {
        const vp = new WebMercatorViewport({
          width: el.clientWidth,
          height: el.clientHeight,
          longitude: viewState.longitude,
          latitude: viewState.latitude,
          zoom: viewState.zoom,
          pitch: viewState.pitch ?? 0,
          bearing: viewState.bearing ?? 0,
        });
        const maxX = el.clientWidth - Math.max(0, rightInset);
        const h = el.clientHeight;
        ids = spotPoints
          .filter((s) => {
            const [x, y] = vp.project(s.position);
            return x >= 0 && x <= maxX && y >= 0 && y <= h;
          })
          .map((s) => s.id);
      } catch {
        /* 投影失敗時は通知しない */
      }
    }
    const key = ids.join(",");
    if (key !== lastVisibleKey.current) {
      lastVisibleKey.current = key;
      onVisibleSpotsChange(ids);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewState, showSpots, rightInset, spots.map((s) => s.id).join(",")]);

  const usedModes = Array.from(new Set([...detailed.map((f) => f.properties.mode), ...arcs.map((a) => a.mode)]));
  const cfg = BASEMAPS[base];
  const hasSelection = selectedLeg != null;
  // 選択時：選択区間は太く不透明、それ以外は細く半透明にして強調
  const lineColor = (mode: string, order: number): [number, number, number, number] => {
    const c = rgb(mode);
    if (!hasSelection) return [...c, 235];
    return order === selectedLeg ? [...c, 255] : [...c, 55];
  };

  const layers = [
    new TileLayer({
      id: `basemap-${base}`,
      data: cfg.url,
      minZoom: 0, maxZoom: cfg.maxZoom, tileSize: 256,
      renderSubLayers: (props: any) => {
        const { boundingBox } = props.tile;
        return new BitmapLayer(props, {
          data: undefined,
          image: props.data,
          bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
        });
      },
    }),
    // 衛星写真のときは地名・境界ラベルを重ねて読みやすく（ハイブリッド）
    base === "satellite" &&
      new TileLayer({
        id: "sat-reference",
        data: SAT_REFERENCE,
        minZoom: 0, maxZoom: 19, tileSize: 256,
        renderSubLayers: (props: any) => {
          const { boundingBox } = props.tile;
          return new BitmapLayer(props, {
            data: undefined,
            image: props.data,
            bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
          });
        },
      }),
    // 周辺国の国境（スイス・フランス・モナコ・イタリア・ドイツ等）
    new GeoJsonLayer({
      id: "borders",
      data: COUNTRY_BORDERS,
      stroked: true, filled: false, pickable: true,
      getLineColor: [...BORDER_RGB, 200] as any,
      getLineWidth: 1.5, lineWidthUnits: "pixels", lineWidthMinPixels: 1.5,
      lineJointRounded: true,
    }),
    new GeoJsonLayer({
      id: "rail",
      data: detailedFC,
      stroked: true, filled: false, pickable: true,
      getLineColor: (f: any) => lineColor(f.properties?.mode, f.properties?.order_index),
      getLineWidth: (f: any) => (f.properties?.order_index === selectedLeg ? 9 : 6),
      lineWidthUnits: "pixels", lineWidthMinPixels: 4,
      lineJointRounded: true, lineCapRounded: true,
      updateTriggers: { getLineColor: selectedLeg, getLineWidth: selectedLeg },
    }),
    new ArcLayer({
      id: "arcs",
      data: arcs,
      pickable: true,
      getSourcePosition: (d: any) => d.from,
      getTargetPosition: (d: any) => d.to,
      getSourceColor: (d: any) => lineColor(d.mode, d.order),
      getTargetColor: (d: any) => lineColor(d.mode, d.order),
      getWidth: (d: any) => (d.order === selectedLeg ? 5 : 2.5),
      // アークの高さ＝(巡航高度×誇張)/水平距離。地上移動は平坦
      getHeight: (d: any) => {
        const distKm = haversineKm(d.from, d.to);
        if (d.mode !== "flight" || distKm <= 0) return 0;
        return Math.min(MAX_ARC_HEIGHT, (CRUISE_ALT_KM * ALT_EXAGGERATION) / distKm);
      },
      updateTriggers: { getSourceColor: selectedLeg, getTargetColor: selectedLeg, getWidth: selectedLeg },
    }),
    new ScatterplotLayer({
      id: "cities",
      data: visibleCities, pickable: true,
      getPosition: (d: any) => d.position,
      getRadius: (d: any) => {
        const endpoint = hasSelection && (d.index === selectedLeg || d.index === selectedLeg + 1);
        return endpoint ? 9 : d.hub ? 7 : 5;
      },
      radiusUnits: "pixels",
      getFillColor: (d: any) => {
        const endpoint = hasSelection && (d.index === selectedLeg || d.index === selectedLeg + 1);
        if (endpoint) return [217, 119, 6];
        return d.hub ? [14, 116, 144] : [148, 163, 184];
      },
      stroked: true, getLineColor: [255, 255, 255], lineWidthMinPixels: 2,
      updateTriggers: { getRadius: selectedLeg, getFillColor: selectedLeg },
    }),
    new TextLayer({
      id: "labels",
      data: visibleCities,
      getPosition: (d: any) => d.position,
      getText: (d: any) => `${d.index + 1}. ${d.name}`,
      getSize: 12, getColor: [30, 41, 59], getPixelOffset: [0, -16],
      getTextAnchor: "middle", getAlignmentBaseline: "bottom",
      fontFamily: '"Hiragino Sans", system-ui, sans-serif',
      outlineWidth: 3, outlineColor: [255, 255, 255], fontSettings: { sdf: true },
    }),
    // 行きたいスポット候補：Google マップ保存リスト風のピン。表示/非表示は凡例のチェックで切替。
    showSpots &&
      new IconLayer({
        id: "spots",
        data: spotPoints, pickable: true,
        getPosition: (d: any) => d.position,
        getIcon: (d: any) => spotPinIcon(resolveSpotIcon(d)),
        getSize: 34,
        sizeUnits: "pixels",
        billboard: true,
        // 3D（pitch）時に billboard アイコンが地面の深度にめり込んで半分クリップされるのを防ぐ
        parameters: { depthTest: false },
        updateTriggers: { getIcon: spotPoints.map((s) => s.icon ?? s.category).join(",") },
      }),
    showSpots &&
      new TextLayer({
        id: "spot-labels",
        data: spotPoints,
        getPosition: (d: any) => d.position,
        getText: (d: any) => d.name,
        // 都市ラベルは上方向(-16)。候補ラベルは丸マーカー（中心アンカー）の下に出して干渉を避ける
        getSize: 11, getColor: SPOT_RGB, getPixelOffset: [0, 14],
        getTextAnchor: "middle", getAlignmentBaseline: "top",
        fontFamily: '"Hiragino Sans", system-ui, sans-serif',
        outlineWidth: 3, outlineColor: [255, 255, 255], fontSettings: { sdf: true },
      }),
  ].filter(Boolean) as any[];

  const getTooltip = ({ object, layer }: PickingInfo): any => {
    if (!object) return null;
    let html = "";
    if (layer?.id === "rail") {
      const p = (object as Feature).properties ?? {};
      const n = ((object as any).geometry?.coordinates?.length) ?? 0;
      html = `<b>${p.from ?? ""} → ${p.to ?? ""}</b><br>${modeLabel(p.mode)}（${t("tooltip.geojsonDetail", { count: n })}）${p.note ? "<br>" + p.note : ""}`;
    } else if (layer?.id === "arcs") {
      const o = object as any;
      html = `<b>${o.fromName} → ${o.toName}</b><br>${modeLabel(o.mode)}（${t("tooltip.straight")}）`;
    } else if (layer?.id === "borders") {
      const p = (object as Feature).properties ?? {};
      html = `<b>${p.name_ja ?? p.name ?? ""}</b>${t("tooltip.border")}`;
    } else if (layer?.id === "cities" || layer?.id === "labels") {
      const o = object as any;
      html = `<b>${o.index + 1}. ${o.name}</b>${o.note ? "<br>" + o.note : ""}`;
    } else if (layer?.id === "spots" || layer?.id === "spot-labels") {
      const o = object as Spot;
      const meta = [o.category, o.city || o.country].filter(Boolean).join(" · ");
      html =
        `<b>${resolveSpotIcon(o).emoji} ${o.name}</b>` +
        (meta ? `<br>${meta}` : "") +
        (o.note ? `<br>${o.note}` : "");
    } else return null;
    return { html, style: { background: "rgba(15,23,42,.92)", color: "#fff", fontSize: "12px", borderRadius: "6px", padding: "6px 8px" } };
  };

  return (
    <div ref={containerRef} className="relative h-full w-full bg-slate-200 dark:bg-slate-900">
      <DeckGL
        viewState={viewState}
        onViewStateChange={(e: any) => setViewState(e.viewState)}
        controller={{ dragRotate: true }}
        layers={layers}
        onClick={(info: PickingInfo) => {
          if (!onSelectLeg) return;
          const o = info.object as any;
          if (info.layer?.id === "rail") onSelectLeg(o?.properties?.order_index ?? null);
          else if (info.layer?.id === "arcs") onSelectLeg(o?.order ?? null);
          // 候補スポットのクリックは区間選択ではなく詳細表示を開く
          else if (info.layer?.id === "spots" || info.layer?.id === "spot-labels") {
            if (o?.id != null) onSelectSpot?.(o.id);
          } else onSelectLeg(null);
        }}
        widgets={[
          // 左下に集約（右側は工程パネルのオーバーレイ用に空ける）
          new ZoomWidget({ placement: "bottom-left" }),
          new CompassWidget({ placement: "bottom-left" }),
          new FullscreenWidget({ placement: "bottom-left" }),
        ]}
        getTooltip={getTooltip}
      />

      {/* レイヤー切替 + 表示操作（左上） */}
      <div className="pointer-events-auto absolute left-3 top-3 flex flex-col items-start gap-2">
        <div className="inline-flex overflow-hidden rounded-lg bg-white/90 shadow-sm backdrop-blur ring-1 ring-black/5 dark:bg-slate-800/90 dark:ring-white/10">
          {BASE_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setBase(id)}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                base === id
                  ? "bg-cyan-700 text-white"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {t(`basemap.${id}`)}
            </button>
          ))}
        </div>
        <div className="inline-flex gap-1.5">
          <button
            type="button"
            onClick={toggle3D}
            className="rounded-lg bg-white/90 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-black/5 backdrop-blur hover:bg-slate-100 dark:bg-slate-800/90 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-slate-700"
          >
            {is3D ? t("controls.view2d") : t("controls.view3d")}
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded-lg bg-white/90 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-black/5 backdrop-blur hover:bg-slate-100 dark:bg-slate-800/90 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-slate-700"
          >
            {t("controls.resetView")}
          </button>
        </div>

        {/* 凡例（操作群の下にまとめる） */}
        <div className="max-w-[15rem] rounded-xl bg-white/85 px-3 py-2 text-xs text-slate-600 shadow-sm backdrop-blur dark:bg-slate-800/85 dark:text-slate-300">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {usedModes.map((m) => (
              <span key={m} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-5 rounded" style={{ background: cssColor(rgb(m)) }} />
                {modeLabel(m)}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1 w-5 rounded" style={{ background: cssColor(BORDER_RGB) }} />
              {t("legend.border")}
            </span>
            {showSpots && spots.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="text-sm leading-none">📍</span>
                {t("legend.spots")}
              </span>
            )}
          </div>
          {showSpots && spotsMissingCoords > 0 && (
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              {t("legend.missingCoords", { count: spotsMissingCoords })}
            </p>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-white/70 px-1.5 text-[10px] text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
        {cfg.attribution}
      </div>
    </div>
  );
}
