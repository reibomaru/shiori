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

export const SUPPORTED_LANGUAGES = ["ja", "en"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** 言語表示名（言語切り替え UI 用）。 */
export const LANGUAGE_LABELS: Record<Language, string> = {
  ja: "日本語",
  en: "English",
};

/** 言語コードの短縮表記（トグルのチップ用）。 */
export const LANGUAGE_SHORT: Record<Language, string> = {
  ja: "JA",
  en: "EN",
};

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
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "shiori-lang",
      caches: ["localStorage"],
    },
  });

// <html lang> を選択言語に追従させる。
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});
if (i18n.language) document.documentElement.lang = i18n.language;

export default i18n;
