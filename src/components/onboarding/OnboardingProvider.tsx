import { createContext, useContext, useState, type ReactNode } from "react";

/** オンボーディング案内のステップ。順序は ORDER で管理する。 */
export type OnboardingKey = "create-project" | "search-spots" | "chat-spot" | "map-spots" | "itinerary-dnd";

export const ONBOARDING_ORDER: OnboardingKey[] = [
  "create-project",
  "search-spots",
  "chat-spot",
  "map-spots",
  "itinerary-dnd",
];

/** 「初回案内を見終わった」ことを記録する localStorage キー。 */
const STORAGE_KEY = "shiori-onboarding-done";

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

/** 案内済みかどうかを localStorage から読む。読めない環境では「済み」扱いにして出さない。 */
function readDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

/**
 * 初回ログイン時のみオンボーディング案内を出すためのプロバイダ。
 * 認証済みユーザーのみをラップする想定（AuthGate 配下に置く）。
 * localStorage の "済み" フラグが立っていなければ、最初のステップから開始する。
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState<number | null>(() => (readDone() ? null : 0));

  const finish = () => {
    setIndex(null);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* 保存できなくても致命的ではない（そのセッション中は案内が続くだけ） */
    }
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
