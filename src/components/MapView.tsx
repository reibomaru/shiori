import { useEffect, useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { WebMercatorViewport, type PickingInfo } from "@deck.gl/core";
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
const MODE_LABEL: Record<string, string> = { train: "鉄道", bus: "バス・登山", car: "車", flight: "飛行機", walk: "徒歩" };
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
const BASEMAPS: Record<BaseId, { label: string; url: string; maxZoom: number; attribution: string; dark?: boolean }> = {
  osm: {
    label: "標準",
    url: "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
  },
  satellite: {
    label: "衛星",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 19,
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    dark: true,
  },
  topo: {
    label: "地形",
    url: "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
    maxZoom: 17,
    attribution: "© OpenTopoMap (CC-BY-SA) · © OpenStreetMap contributors",
  },
  light: {
    label: "白黒",
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
}: {
  route: RoutePoint[];
  legs: LegFeature[];
  spots?: Spot[];
  selectedLeg?: number | null;
  onSelectLeg?: (order: number | null) => void;
}) {
  const [base, setBase] = useState<BaseId>("osm");
  const [showSpots, setShowSpots] = useState(true);

  // lat/lng を持つ候補スポットのみ地図に出せる。未設定分は注意表示用に件数を保持
  const spotPoints = spots
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({ ...s, position: [s.lng as number, s.lat as number] as [number, number] }));
  const spotsMissingCoords = spots.length - spotPoints.length;

  const cities = route
    .filter((p) => p.lat != null && p.lng != null)
    .map((p, i) => ({ index: i, name: p.name, hub: !!p.hub, note: p.note, position: [p.lng as number, p.lat as number] as [number, number] }));

  const legByOrder = new Map(legs.map((f) => [f.properties.order_index, f]));
  const detailed = legs.filter((f) => f.geometry && f.geometry.coordinates.length >= 2);
  const detailedOrders = new Set(detailed.map((f) => f.properties.order_index));
  const detailedFC: FeatureCollection = { type: "FeatureCollection", features: detailed as unknown as Feature[] };

  const arcs = cities.slice(0, -1).map((c, i) => {
    if (detailedOrders.has(i)) return null;
    const next = cities[i + 1];
    const mode = legByOrder.get(i)?.properties.mode ?? route[i + 1]?.leg_type ?? "flight";
    return { order: i, from: c.position, to: next.position, mode, fromName: c.name, toName: next.name };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const initialViewState = useMemo(() => {
    const euro = cities.filter((c) => c.position[1] > 40 && c.position[1] < 52 && c.position[0] > -6 && c.position[0] < 20);
    const base = { longitude: 7, latitude: 46.4, zoom: 6.4, pitch: 45, bearing: -12 };
    if (euro.length < 2) return base;
    const lons = euro.map((c) => c.position[0]); const lats = euro.map((c) => c.position[1]);
    try {
      const vp = new WebMercatorViewport({ width: 1200, height: 700 });
      const { longitude, latitude, zoom } = vp.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: 90 }
      );
      return { longitude, latitude, zoom: Math.min(zoom, 9), pitch: 45, bearing: -12 };
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
      getLineWidth: (f: any) => (f.properties?.order_index === selectedLeg ? 6 : 3),
      lineWidthUnits: "pixels", lineWidthMinPixels: 2,
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
      data: cities, pickable: true,
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
      data: cities,
      getPosition: (d: any) => d.position,
      getText: (d: any) => `${d.index + 1}. ${d.name}`,
      getSize: 12, getColor: [30, 41, 59], getPixelOffset: [0, -16],
      getTextAnchor: "middle", getAlignmentBaseline: "bottom",
      fontFamily: '"Hiragino Sans", system-ui, sans-serif',
      outlineWidth: 3, outlineColor: [255, 255, 255], fontSettings: { sdf: true },
    }),
    // 行きたいスポット候補：Google マップ保存リスト風のピン。want_level が高いほど大きく表示
    showSpots &&
      new IconLayer({
        id: "spots",
        data: spotPoints, pickable: true,
        getPosition: (d: any) => d.position,
        getIcon: (d: any) => spotPinIcon(resolveSpotIcon(d)),
        getSize: (d: any) => 38 + Math.max(0, Math.min(5, d.want_level ?? 0)) * 4,
        sizeUnits: "pixels",
        billboard: true,
        updateTriggers: { getIcon: spotPoints.map((s) => s.icon ?? s.category).join(","), getSize: showSpots },
      }),
    showSpots &&
      new TextLayer({
        id: "spot-labels",
        data: spotPoints,
        getPosition: (d: any) => d.position,
        getText: (d: any) => d.name,
        // 都市ラベルは上方向(-16)。候補ラベルはピンの下に出して干渉を避ける
        getSize: 11, getColor: SPOT_RGB, getPixelOffset: [0, 6],
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
      html = `<b>${p.from ?? ""} → ${p.to ?? ""}</b><br>${MODE_LABEL[p.mode] ?? p.mode}（GeoJSON詳細・${n}点）${p.note ? "<br>" + p.note : ""}`;
    } else if (layer?.id === "arcs") {
      const o = object as any;
      html = `<b>${o.fromName} → ${o.toName}</b><br>${MODE_LABEL[o.mode] ?? o.mode}（直線）`;
    } else if (layer?.id === "borders") {
      const p = (object as Feature).properties ?? {};
      html = `<b>${p.name_ja ?? p.name ?? ""}</b>（国境）`;
    } else if (layer?.id === "cities" || layer?.id === "labels") {
      const o = object as any;
      html = `<b>${o.index + 1}. ${o.name}</b>${o.note ? "<br>" + o.note : ""}`;
    } else if (layer?.id === "spots" || layer?.id === "spot-labels") {
      const o = object as Spot;
      const lv = Math.max(0, Math.min(5, o.want_level ?? 0));
      const meta = [o.category, o.city || o.country].filter(Boolean).join(" · ");
      const stars = "★".repeat(lv) + "☆".repeat(5 - lv);
      html =
        `<b>${resolveSpotIcon(o).emoji} ${o.name}</b>` +
        (meta ? `<br>${meta}` : "") +
        `<br><span style="color:#f9a8d4">${stars}</span>` +
        (o.note ? `<br>${o.note}` : "");
    } else return null;
    return { html, style: { background: "rgba(15,23,42,.92)", color: "#fff", fontSize: "12px", borderRadius: "6px", padding: "6px 8px" } };
  };

  return (
    <div className="relative h-full w-full bg-slate-200">
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
          // 候補スポットのクリックは区間選択に影響させない
          else if (info.layer?.id === "spots" || info.layer?.id === "spot-labels") return;
          else onSelectLeg(null);
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
        <div className="inline-flex overflow-hidden rounded-lg bg-white/90 shadow-sm backdrop-blur ring-1 ring-black/5">
          {BASE_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setBase(id)}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                base === id ? "bg-cyan-700 text-white" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {BASEMAPS[id].label}
            </button>
          ))}
        </div>
        <div className="inline-flex gap-1.5">
          <button
            type="button"
            onClick={toggle3D}
            className="rounded-lg bg-white/90 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-black/5 backdrop-blur hover:bg-slate-100"
          >
            {is3D ? "2D表示" : "3D表示"}
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded-lg bg-white/90 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-black/5 backdrop-blur hover:bg-slate-100"
          >
            全体表示
          </button>
          {spots.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSpots((v) => !v)}
              aria-pressed={showSpots}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-sm ring-1 ring-black/5 backdrop-blur transition-colors ${
                showSpots ? "bg-pink-600 text-white" : "bg-white/90 text-slate-700 hover:bg-slate-100"
              }`}
            >
              候補スポット
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  showSpots ? "bg-white/25" : "bg-slate-100 text-slate-500"
                }`}
              >
                {spotPoints.length}
              </span>
            </button>
          )}
        </div>

        {/* 凡例（操作群の下にまとめる） */}
        <div className="max-w-[15rem] rounded-xl bg-white/85 px-3 py-2 text-xs text-slate-600 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {usedModes.map((m) => (
              <span key={m} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-5 rounded" style={{ background: cssColor(rgb(m)) }} />
                {MODE_LABEL[m] ?? m}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1 w-5 rounded" style={{ background: cssColor(BORDER_RGB) }} />
              国境
            </span>
            {showSpots && spots.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="text-sm leading-none">📍</span>
                候補スポット
              </span>
            )}
          </div>
          {showSpots && spotsMissingCoords > 0 && (
            <p className="mt-1 text-[11px] text-slate-400">
              座標未設定のため非表示: {spotsMissingCoords} 件
            </p>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-white/70 px-1.5 text-[10px] text-slate-500">
        {cfg.attribution}
      </div>
    </div>
  );
}
