import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaGoogle, FaMagnifyingGlass, FaEnvelope } from "react-icons/fa6";
import type { ExpenseExtraction } from "../../types";
import { api, gmailOAuthStartUrl, type GmailMessageSummary, type GmailStatus } from "../../api";

/**
 * Gmail から購入/予約完了メールを検索して選び、本文から実費情報を抽出するパネル。
 * OAuth 資格情報が未設定なら案内だけ表示し、機能はグレースフルに無効化する。
 */
export default function GmailImport({
  onExtracted,
  onWarning,
  disabled,
}: {
  onExtracted: (x: ExpenseExtraction) => void;
  onWarning: (msg: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("budget");
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GmailMessageSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [awaitingAuth, setAwaitingAuth] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await api.getGmailStatus());
    } catch {
      /* 取得失敗時は未設定扱いのまま */
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // OAuth ポップアップを開いた後、連携完了までステータスをポーリングする。
  useEffect(() => {
    if (!awaitingAuth) return;
    let tries = 0;
    pollRef.current = setInterval(async () => {
      tries += 1;
      const s = await api.getGmailStatus().catch(() => null);
      if (s?.connected) {
        setStatus(s);
        setAwaitingAuth(false);
      } else if (tries > 40) {
        setAwaitingAuth(false); // 約60秒で諦める
      }
    }, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [awaitingAuth]);

  function connect() {
    window.open(gmailOAuthStartUrl(), "gmail-oauth", "width=520,height=640");
    setAwaitingAuth(true);
  }

  async function disconnect() {
    await api.disconnectGmail();
    setResults([]);
    void refreshStatus();
  }

  async function search() {
    setSearching(true);
    try {
      const res = await api.searchGmail(query.trim() || undefined);
      if (res.error) onWarning(res.error);
      setResults(res.messages);
    } finally {
      setSearching(false);
    }
  }

  async function importMessage(id: string) {
    setImportingId(id);
    try {
      const res = await api.extractGmail(id);
      if (res.warning) onWarning(res.warning);
      if (res.extraction) onExtracted(res.extraction);
    } finally {
      setImportingId(null);
    }
  }

  if (!status) return null;

  if (!status.configured) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:text-slate-500 dark:ring-slate-700">
        {t("gmail.notConfigured")}
      </p>
    );
  }

  if (!status.connected) {
    return (
      <button
        onClick={connect}
        disabled={disabled}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        <FaGoogle className="text-rose-500" /> {awaitingAuth ? t("gmail.awaiting") : t("gmail.connect")}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:ring-slate-700">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <FaGoogle className="text-rose-500" /> {status.email ?? t("gmail.connected")}
        </span>
        <button
          onClick={() => void disconnect()}
          className="text-slate-400 hover:text-rose-600 hover:underline dark:text-slate-500 dark:hover:text-rose-400"
        >
          {t("gmail.disconnect")}
        </button>
      </div>
      <div className="flex gap-1.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void search();
          }}
          placeholder={t("gmail.searchPlaceholder")}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-cyan-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
        />
        <button
          onClick={() => void search()}
          disabled={searching || disabled}
          className="flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:opacity-50 dark:bg-slate-600 dark:hover:bg-slate-500"
        >
          <FaMagnifyingGlass className="text-xs" /> {searching ? t("gmail.searching") : t("gmail.search")}
        </button>
      </div>

      {results.length > 0 && (
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {results.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => void importMessage(m.id)}
                disabled={importingId !== null || disabled}
                className="flex w-full items-start gap-2 rounded-lg bg-white px-2.5 py-2 text-left ring-1 ring-slate-200 transition hover:ring-cyan-400 disabled:opacity-50 dark:bg-slate-800 dark:ring-slate-700 dark:hover:ring-cyan-500/60"
              >
                <FaEnvelope className="mt-0.5 shrink-0 text-slate-300 dark:text-slate-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-700 dark:text-slate-200">{m.subject}</span>
                  <span className="block truncate text-[11px] text-slate-400 dark:text-slate-500">
                    {m.from} · {m.snippet}
                  </span>
                </span>
                {importingId === m.id && <span className="shrink-0 text-[11px] text-cyan-600 dark:text-cyan-400">{t("gmail.importing")}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
