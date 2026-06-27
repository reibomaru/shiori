import { useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { WebMercatorViewport, type PickingInfo } from "@deck.gl/core";
import { TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer, GeoJsonLayer, ArcLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { ZoomWidget, CompassWidget, FullscreenWidget } from "@deck.gl/widgets";
import "@deck.gl/widgets/stylesheet.css";
import type { Feature, FeatureCollection } from "geojson";
import { FaMapLocationDot } from "react-icons/fa6";
import type { RoutePoint, LegFeature } from "../types";
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
const rgb = (m: string): RGB => MODE_RGB[m] ?? [100, 116, 139];
const cssColor = (c: RGB) => `rgb(${c.join(",")})`;

export default function MapView({ route, legs }: { route: RoutePoint[]; legs: LegFeature[] }) {
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
    return { from: c.position, to: next.position, mode, fromName: c.name, toName: next.name };
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

  const usedModes = Array.from(new Set([...detailed.map((f) => f.properties.mode), ...arcs.map((a) => a.mode)]));

  const layers = [
    new TileLayer({
      id: "osm",
      data: "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
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
      getLineColor: (f: any) => rgb(f.properties?.mode),
      getLineWidth: 3, lineWidthUnits: "pixels", lineWidthMinPixels: 3,
      lineJointRounded: true, lineCapRounded: true,
    }),
    new ArcLayer({
      id: "arcs",
      data: arcs,
      pickable: true,
      getSourcePosition: (d: any) => d.from,
      getTargetPosition: (d: any) => d.to,
      getSourceColor: (d: any) => rgb(d.mode),
      getTargetColor: (d: any) => rgb(d.mode),
      getWidth: 2.5, getHeight: 0.5,
    }),
    new ScatterplotLayer({
      id: "cities",
      data: cities, pickable: true,
      getPosition: (d: any) => d.position,
      getRadius: (d: any) => (d.hub ? 7 : 5), radiusUnits: "pixels",
      getFillColor: (d: any) => (d.hub ? [14, 116, 144] : [148, 163, 184]),
      stroked: true, getLineColor: [255, 255, 255], lineWidthMinPixels: 2,
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
  ];

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
    } else return null;
    return { html, style: { background: "rgba(15,23,42,.92)", color: "#fff", fontSize: "12px", borderRadius: "6px", padding: "6px 8px" } };
  };

  return (
    <div className="relative h-full w-full bg-slate-200">
      <DeckGL
        initialViewState={initialViewState}
        controller={{ dragRotate: true }}
        layers={layers}
        widgets={[new ZoomWidget(), new CompassWidget(), new FullscreenWidget()]}
        getTooltip={getTooltip}
      />

      {/* タイトル（左上オーバーレイ） */}
      <div className="pointer-events-none absolute left-3 top-3 rounded-xl bg-white/85 px-3 py-2 shadow-sm backdrop-blur">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <FaMapLocationDot className="text-cyan-700" /> 移動プラン（deck.gl）
        </h2>
      </div>

      {/* 凡例（左下オーバーレイ） */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl bg-white/85 px-3 py-2 text-xs text-slate-600 shadow-sm backdrop-blur">
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
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-1 right-1 rounded bg-white/70 px-1.5 text-[10px] text-slate-500">
        © OpenStreetMap contributors
      </div>
    </div>
  );
}
