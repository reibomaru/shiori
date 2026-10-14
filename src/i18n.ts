import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

/** 言語リソースは src/locales/{lng}/{namespace}.json に配置する。
 *  ここで glob 収集しているので、名前空間 JSON を追加するだけで自動的に読み込まれる
 *  （この初期化ファイルを編集する必要はない）。 */
const modules = import.meta.glob<{ default: Record<string, unknown> }>("./locales/*/*.json", {
  eager: true,
});

const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const path in modules) {
  const m = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!m) continue;
  const [, lng, ns] = m;
  (resources[lng] ??= {})[ns] = modules[path].default;
}

export const SUPPORTED_LANGUAGES = ["ja", "en", "fr", "zh"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** 言語表示名（言語切り替え UI 用）。各言語の自称表記なので翻訳しない。 */
export const LANGUAGE_LABELS: Record<Language, string> = {
  ja: "日本語",
  en: "English",
  fr: "Français",
  zh: "简体中文",
};

/** 言語コードの短縮表記（トグルのチップ用）。 */
export const LANGUAGE_SHORT: Record<Language, string> = {
  ja: "JA",
  en: "EN",
  fr: "FR",
  zh: "ZH",
};

/** localStorage / Cookie に保存するキー。サーバ（server/i18n.ts）も同じ Cookie 名を読む。 */
export const LANG_STORAGE_KEY = "shiori-lang";

/** 現在の表示言語を SUPPORTED_LANGUAGES のいずれかに正規化して返す（例 "en-US" → "en"）。 */
export function currentLanguage(): Language {
  const lng = i18n.language ?? "";
  return SUPPORTED_LANGUAGES.find((l) => lng === l || lng.startsWith(`${l}-`)) ?? "ja";
}

/**
 * API リクエストに付ける表示言語ヘッダ。サーバはこれを見てエラーメッセージや
 * AI エージェントの応答言語を切り替える（server/i18n.ts）。
 */
export function langHeader(): Record<string, string> {
  return { "X-Lang": currentLanguage() };
}

/**
 * サーバ側で描画する画面（OAuth コールバックの承認待ち/エラーページ等）は
 * カスタムヘッダを付けられないため、同じ言語を Cookie でも共有する。
 */
function syncLangCookie(lng: string): void {
  try {
    document.cookie = `${LANG_STORAGE_KEY}=${encodeURIComponent(lng)}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* Cookie を書けない環境（プレビュー等）では無視する */
  }
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "ja",
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    detection: {
      // ?lng=fr のようにクエリで明示 → 保存済み設定 → ブラウザ言語、の順。
      order: ["querystring", "localStorage", "navigator"],
      lookupQuerystring: "lng",
      lookupLocalStorage: LANG_STORAGE_KEY,
      caches: ["localStorage"],
    },
  });

// <html lang> と Cookie を選択言語に追従させる。
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
  syncLangCookie(currentLanguage());
});
if (i18n.language) {
  document.documentElement.lang = i18n.language;
  syncLangCookie(currentLanguage());
}

export default i18n;
