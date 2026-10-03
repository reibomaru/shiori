import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../../api";
import { useAuth } from "../AuthGate";

/** オンボーディング案内のステップ。順序は ORDER で管理する。 */
export type OnboardingKey = "create-project" | "search-spots" | "chat-spot" | "map-spots" | "itinerary-dnd";

export const ONBOARDING_ORDER: OnboardingKey[] = [
  "create-project",
  "search-spots",
  "chat-spot",
  "map-spots",
  "itinerary-dnd",
];

/**
 * 旧実装で「初回案内を見終わった」ことを記録していた localStorage キー。
 * 正は Firestore（users.onboardingDone）。旧フラグが残っている端末は済み扱いにし、Firestore へ移行する。
 */
const LEGACY_STORAGE_KEY = "shiori-onboarding-done";

interface OnboardingCtx {
  /** 現在アクティブなステップ。案内していない/完了済みなら null。 */
  activeKey: OnboardingKey | null;
  /** 次のステップへ進む（最後なら完了）。 */
  next: () => void;
  /** 案内を途中終了する（以降は自動表示しない）。 */
  skip: () => void;
  /** 指定ステップが現在アクティブなときだけ次へ進める（実操作の完了に連動させる用）。 */
  completeStep: (key: OnboardingKey) => void;
}

const Ctx = createContext<OnboardingCtx | null>(null);

/** オンボーディングの状態を参照する（OnboardingProvider 配下でのみ有効）。 */
export function useOnboarding(): OnboardingCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOnboarding must be used within OnboardingProvider");
  return c;
}

/** 旧実装の localStorage フラグが立っているか。 */
function readLegacyDone(): boolean {
  try {
    return localStorage.getItem(LEGACY_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 初回ログイン時のみオンボーディング案内を出すためのプロバイダ。
 * 認証済みユーザーのみをラップする想定（AuthGate 配下に置く）。
 * /auth/me の onboardingDone（Firestore の users ドキュメント）が立っていなければ、
 * 最初のステップから開始する。完了/スキップで Firestore のフラグを true にする。
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { me, applyMe } = useAuth();
  const legacyDone = readLegacyDone();
  const [index, setIndex] = useState<number | null>(() => (me.onboardingDone || legacyDone ? null : 0));

  /** Firestore に表示済みを記録し、手元の me にも反映する（失敗しても案内は閉じたまま）。 */
  const persistDone = () => {
    applyMe({ ...me, onboardingDone: true });
    api.markOnboardingDone().catch((e) => console.error("オンボーディング表示済みの保存に失敗しました:", e));
  };

  // 旧 localStorage フラグだけ立っている端末は、Firestore 側へ移行しておく。
  useEffect(() => {
    if (legacyDone && !me.onboardingDone) persistDone();
    // マウント時に一度だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => {
    setIndex(null);
    persistDone();
  };

  const next = () => {
    if (index === null) return;
    const n = index + 1;
    if (n >= ONBOARDING_ORDER.length) finish();
    else setIndex(n);
  };

  const skip = () => finish();

  const completeStep = (key: OnboardingKey) => {
    if (index === null) return;
    if (ONBOARDING_ORDER[index] !== key) return;
    next();
  };

  const activeKey = index === null ? null : ONBOARDING_ORDER[index];

  return <Ctx.Provider value={{ activeKey, next, skip, completeStep }}>{children}</Ctx.Provider>;
}
