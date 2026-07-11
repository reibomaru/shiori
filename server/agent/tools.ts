// ============================================================
//  AI エージェント用のカスタムツール群。
//
//  設計方針（プレビュー承認制）:
//   - エージェントは DB を直接書き換えない。
//   - 変更は必ず propose_* ツールで「提案」として SSE に流すだけ。
//   - 実際の保存はユーザーが UI のボタンを押したときに REST 経由で行う。
//   - 読み取り（list_spots）と情報補完（web_search / fetch_url /
//     geocode）はツール内で完結してよい（副作用なし）。
// ============================================================
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { AgentToolResult, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { DatabaseSync } from "node:sqlite";
import * as spotsRepo from "../../db/spots-repo.ts";
import type { EmitFn } from "./runner.ts";

/** createSpotTools のオプション。 */
export interface SpotToolsOptions {
  db: DatabaseSync;
  emit: EmitFn;
  /** websearchapi.ai の API キー */
  webSearchApiKey: string;
}

/**
 * 提案カードの ID。toolCall id 由来にすることで、SSE 直後だけでなく
 * 履歴復元（JSONL の toolCall id）でも同じ ID になり、保存/破棄の状態を保てる。
 */
function proposalIdFor(toolCallId: string): string {
  return `prop-${toolCallId}`;
}

const text = (s: string): AgentToolResult<unknown> =>
  ({ content: [{ type: "text", text: s }], details: undefined }) as AgentToolResult<unknown>;

/** スポット下書きから、提案に載せるフィールドだけ抜き出す。 */
function pickDraft(p: Record<string, unknown>): Record<string, unknown> {
  const draft: Record<string, unknown> = {};
  for (const k of spotsRepo.SPOT_FIELDS) {
    if (p[k] !== undefined && p[k] !== null) draft[k] = p[k];
  }
  return draft;
}

/** HTML をざっくりプレーンテキストへ（fetch_url 用）。 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * リクエスト 1 回分のツール一式を生成する。
 */
export function createSpotTools({ db, emit, webSearchApiKey }: SpotToolsOptions): ToolDefinition[] {
  const list_spots = defineTool({
    name: "list_spots",
    label: "候補一覧",
    description:
      "現在登録されている行きたいスポット候補の一覧を返す。重複チェックや、更新・削除の対象 id を特定するために使う。",
    promptSnippet: "list_spots() — 既存の候補一覧を取得",
    parameters: Type.Object({}),
    async execute() {
      const spots = spotsRepo.listSpots(db);
      if (spots.length === 0) return text("候補はまだ 1 件もありません。");
      const lines = spots.map(
        (s) =>
          `#${s.id} ${s.name}${s.name_en ? ` (${s.name_en})` : ""} / ${s.country ?? "?"}${
            s.city ? "・" + s.city : ""
          } / ${s.category ?? "未分類"} / 座標${
            s.lat != null && s.lng != null ? "あり" : "なし"
          }${s.google_maps_url ? " / Mapリンクあり" : ""}`,
      );
      return text(`現在 ${spots.length} 件:\n${lines.join("\n")}`);
    },
  });

  const proposalFields = {
    name: Type.String({ description: "スポット名（日本語）" }),
    name_en: Type.Optional(Type.String({ description: "英語名" })),
    category: Type.Optional(Type.String({ description: "カテゴリ（観光/食事/自然/美術館 など）" })),
    city: Type.Optional(Type.String({ description: "都市名" })),
    country: Type.Optional(Type.String({ description: "国名（スイス / フランス など）" })),
    lat: Type.Optional(Type.Number({ description: "緯度。不明なら省略可" })),
    lng: Type.Optional(Type.Number({ description: "経度。不明なら省略可" })),
    url: Type.Optional(Type.String({ description: "公式サイトの URL" })),
    google_maps_url: Type.Optional(Type.String({ description: "Google マップのリンク。口コミ・評価はリンク先で確認するため、評価値などは保存しない" })),
    note: Type.Optional(Type.String({ description: "メモ・見どころ" })),
    source: Type.Optional(Type.String({ description: "情報の出典（URL やサイト名）" })),
  };

  const propose_upsert_spot = defineTool({
    name: "propose_upsert_spot",
    label: "候補の追加/更新を提案",
    description:
      "スポットの新規追加（id 省略）または既存候補の更新（id 指定）をユーザーに提案する。DB には書き込まず、ユーザーが UI で承認して初めて保存される。緯度経度は分かる範囲で埋め、出典(source)・公式 URL・Google マップのリンク(google_maps_url)もできるだけ付ける。口コミや星評価はリンク先で見られるので保存しない。",
    promptSnippet: "propose_upsert_spot({id?, name, ...}) — 追加/更新を提案（保存はユーザー承認後）",
    parameters: Type.Object({
      id: Type.Optional(Type.String({ description: "更新対象の既存スポット id（UUID）。新規追加なら省略" })),
      ...proposalFields,
    }),
    async execute(toolCallId, p) {
      const op = p.id != null ? "update" : "create";
      let current = null;
      if (p.id != null) {
        current = spotsRepo.getSpot(db, p.id);
        if (!current) return text(`id=${p.id} の候補が見つかりません。list_spots で id を確認してください。`);
      }
      const tempId = proposalIdFor(toolCallId);
      const spot = pickDraft(p as Record<string, unknown>);
      await emit("proposal", { tempId, op, id: p.id ?? null, spot, current });
      return text(
        `${op === "update" ? "更新" : "追加"}の提案を表示しました（「${p.name}」）。` +
          `ユーザーが画面の「保存」を押すと確定します。あなたは保存しないでください。`,
      );
    },
  });

  const propose_delete_spot = defineTool({
    name: "propose_delete_spot",
    label: "候補の削除を提案",
    description:
      "既存候補の削除をユーザーに提案する。DB には書き込まず、ユーザーが UI で承認して初めて削除される。",
    promptSnippet: "propose_delete_spot({id}) — 削除を提案（実行はユーザー承認後）",
    parameters: Type.Object({
      id: Type.String({ description: "削除対象の既存スポット id（UUID）" }),
    }),
    async execute(toolCallId, p) {
      const current = spotsRepo.getSpot(db, p.id);
      if (!current) return text(`id=${p.id} の候補が見つかりません。list_spots で id を確認してください。`);
      const tempId = proposalIdFor(toolCallId);
      await emit("proposal", { tempId, op: "delete", id: p.id, spot: null, current });
      return text(`「${current.name}」の削除を提案しました。ユーザーが「削除」を押すと確定します。`);
    },
  });

  const geocode = defineTool({
    name: "geocode",
    label: "ジオコーディング",
    description:
      "地名・住所・施設名から緯度経度を取得する（OpenStreetMap / Nominatim）。propose_upsert_spot の lat/lng を埋める前に使う。",
    promptSnippet: "geocode(query) — 地名→緯度経度",
    parameters: Type.Object({
      query: Type.String({ description: "施設名や住所（例: Château de Chillon, Montreux）" }),
    }),
    async execute(_id, p, signal) {
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", p.query);
        url.searchParams.set("format", "json");
        url.searchParams.set("limit", "1");
        const res = await fetch(url, {
          signal: signal ?? undefined,
          headers: { "User-Agent": "honeymoon-shiori/1.0 (travel-plans spot agent)" },
        });
        if (!res.ok) return text(`ジオコーディング失敗: HTTP ${res.status}`);
        const arr = await res.json();
        if (!Array.isArray(arr) || arr.length === 0) return text(`「${p.query}」の座標は見つかりませんでした。`);
        const r = arr[0];
        return text(
          `lat=${Number(r.lat)}, lng=${Number(r.lon)}\n名称: ${r.display_name ?? "(不明)"}`,
        );
      } catch (err) {
        return text(`ジオコーディングエラー: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

  const resolve_map_url = defineTool({
    name: "resolve_map_url",
    label: "地図リンク解決",
    description:
      "Google マップの共有リンク（maps.app.goo.gl / goo.gl/maps の短縮URLや google.com/maps の長いURL）を辿って、地名・緯度経度を取り出す。ユーザーが地図リンクを貼ったら、まずこれで地名と座標を取得してから propose_upsert_spot に渡す（lat/lng はここで得た値を使い、geocode は不要）。",
    promptSnippet: "resolve_map_url(url) — Googleマップ共有リンク→地名・緯度経度",
    parameters: Type.Object({
      url: Type.String({ description: "Google マップの共有URL（maps.app.goo.gl など）" }),
    }),
    async execute(_id, p, signal) {
      // 注意: ブラウザ風 UA だと Google は 200 のインタースティシャルを返し redirect しない。
      // 非ブラウザ UA（下記）だとサーバー側 30x で最終 URL が得られる。
      const ua = "honeymoon-shiori/1.0 (travel-plans spot agent)";
      // fetch の redirect:"manual" は Location を隠す（opaqueredirect）ため、
      // redirect:"follow" で辿って最終 URL（res.url）を使う。本文は不要なので破棄する。
      let url = p.url;
      const alreadyResolved = /\/maps\//.test(p.url) || /@-?\d/.test(p.url) || /!3d-?\d/.test(p.url);
      try {
        if (!alreadyResolved) {
          const res = await fetch(p.url, {
            redirect: "follow",
            signal: signal ?? undefined,
            headers: { "User-Agent": ua },
          });
          url = res.url || p.url;
          try {
            await res.body?.cancel();
          } catch {
            /* noop */
          }
        }
      } catch (err) {
        return text(`地図リンクの解決に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
      }

      // 地名: /place/<name>/   座標: !3d<lat>!4d<lng>（実地点）優先、無ければ @lat,lng（地図中心）
      let name: string | null = null;
      const pm = url.match(/\/place\/([^/@?]+)/);
      if (pm) name = decodeURIComponent(pm[1].replace(/\+/g, " "));
      let lat: number | null = null;
      let lng: number | null = null;
      const dm = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
      if (dm) {
        lat = Number(dm[1]);
        lng = Number(dm[2]);
      } else {
        const am = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (am) {
          lat = Number(am[1]);
          lng = Number(am[2]);
        }
      }

      if (name == null && lat == null) {
        return text(
          `このリンクからは地名・座標を取り出せませんでした（解決後URL: ${url}）。ユーザーにスポット名を尋ねてください。`,
        );
      }
      return text(
        `地名: ${name ?? "(不明)"}\n` +
          `lat: ${lat ?? "(不明)"}\nlng: ${lng ?? "(不明)"}\n` +
          `解決後URL: ${url}\n` +
          `この name/lat/lng を使って propose_upsert_spot で提案してください（google_maps_url にはこの解決後URL か元の共有URLを入れる）。`,
      );
    },
  });

  const fetch_url = defineTool({
    name: "fetch_url",
    label: "URL 取得",
    description:
      "指定 URL のページ本文をプレーンテキストで取得する。ユーザーが貼った URL や、web_search で見つけた公式ページから、英名・カテゴリ・概要・出典を読み取るために使う。短縮URL/302 リダイレクトは自動で辿り、最終的に着地した URL も併せて返す（リダイレクト先が Google マップなら resolve_map_url の利用を検討）。",
    promptSnippet: "fetch_url(url) — ページ本文を取得（リダイレクト先も追う）",
    parameters: Type.Object({
      url: Type.String({ description: "取得する URL" }),
    }),
    async execute(_id, p, signal) {
      try {
        // 非ブラウザ UA。Google 等はブラウザ風 UA だと 30x を返さずインタースティシャルになるため。
        const res = await fetch(p.url, {
          signal: signal ?? undefined,
          headers: { "User-Agent": "honeymoon-shiori/1.0 (travel-plans spot agent)" },
          redirect: "follow", // 302 等は最後まで辿り、res.url に最終 URL が入る
        });
        // 着地先が元URLと違う（=リダイレクトされた）なら、その最終URLを明示する
        const redirectedNote = res.url && res.url !== p.url ? `リダイレクト先: ${res.url}\n\n` : "";
        if (!res.ok) return text(`${redirectedNote}取得失敗: HTTP ${res.status}`);
        const body = await res.text();
        const plain = htmlToText(body).slice(0, 4000);
        return text(redirectedNote + (plain || "(本文を抽出できませんでした)"));
      } catch (err) {
        return text(`取得エラー: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

  const web_search = defineTool({
    name: "web_search",
    label: "Web 検索",
    description:
      "Web を検索して、スポットの公式ページ・概要・所在地などの最新情報を得る。URL が分からないスポットを名前だけで調べるときに使う。",
    promptSnippet: "web_search(query) — Web 検索",
    parameters: Type.Object({
      query: Type.String({ description: "検索クエリ" }),
      max_results: Type.Optional(Type.Number({ description: "最大件数（既定 5・最大 10）" })),
    }),
    async execute(_id, p, signal) {
      if (!webSearchApiKey) {
        return text("Web 検索の設定がありません。サーバーの環境変数 WEBSEARCH_API_KEY を .env に設定してください。");
      }
      const limit = Math.min(p.max_results ?? 5, 10);
      console.log(`[web_search] query="${p.query}" maxResults=${limit} → websearchapi.ai`);
      try {
        const res = await fetch("https://api.websearchapi.ai/ai-search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${webSearchApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: p.query, maxResults: limit, includeContent: false }),
          signal: signal ?? undefined,
        });
        if (!res.ok) {
          console.error(`[web_search] HTTP ${res.status} query="${p.query}"`);
          return text(`検索失敗: HTTP ${res.status}（websearchapi.ai）`);
        }
        const data = await res.json() as { organic?: Array<{ title?: string; url?: string; description?: string }> };
        const results = (data.organic ?? []).slice(0, limit);
        console.log(`[web_search] query="${p.query}" → ${results.length} 件`);
        if (results.length === 0) return text("検索結果が見つかりませんでした。");
        const formatted = results
          .map((r, i) => {
            const lines = [`${i + 1}. ${r.title}`, `   URL: ${r.url}`];
            if (r.description) lines.push(`   ${r.description}`);
            return lines.join("\n");
          })
          .join("\n\n");
        return text(formatted);
      } catch (err) {
        console.error(`[web_search] error query="${p.query}":`, err instanceof Error ? err.message : err);
        return text(
          `検索エラー: ${err instanceof Error ? err.message : String(err)}（websearchapi.ai に接続できません）`,
        );
      }
    },
  });

  return [list_spots, propose_upsert_spot, propose_delete_spot, resolve_map_url, geocode, fetch_url, web_search];
}
