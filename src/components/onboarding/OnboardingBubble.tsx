import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useOnboarding, ONBOARDING_ORDER, type OnboardingKey } from "./OnboardingProvider";

/** 対象要素（data-onboarding="<key>"）の位置を追う。アクティブな間だけ監視する。 */
function useTargetRect(key: OnboardingKey, active: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!active) {
      setRect(null);
      return;
    }
    let raf = 0;
    const update = () => {
      const el = document.querySelector(`[data-onboarding="${key}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    update();
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    // 対象が遅れてマウントされる/位置が変わるケースに備えて軽くポーリング。
    const timer = window.setInterval(update, 400);
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.clearInterval(timer);
      cancelAnimationFrame(raf);
    };
  }, [key, active]);
  return rect;
}

/** 対象が画面内に見えているか（サイドバーがオフキャンバス等で隠れている場合は出さない）。 */
function isVisible(r: DOMRect): boolean {
  if (r.width === 0 || r.height === 0) return false;
  return r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
}

/**
 * 指定ステップがアクティブな間だけ、対象要素の脇に吹き出しで案内を表示する。
 * 対象は data-onboarding="<stepKey>" 属性で指し示す。
 */
export function OnboardingBubble({
  stepKey,
  side = "bottom",
}: {
  stepKey: OnboardingKey;
  side?: "bottom" | "top" | "right";
}) {
  const { t } = useTranslation("onboarding");
  const { activeKey, next, skip } = useOnboarding();
  const active = activeKey === stepKey;
  const rect = useTargetRect(stepKey, active);

  if (!active || !rect || !isVisible(rect)) return null;

  const index = ONBOARDING_ORDER.indexOf(stepKey);
  const isLast = index === ONBOARDING_ORDER.length - 1;

  const GAP = 12;
  const style =
    side === "right"
      ? { top: rect.top + rect.height / 2, left: rect.right + GAP, transform: "translateY(-50%)" }
      : side === "top"
        ? { top: rect.top - GAP, left: rect.left, transform: "translateY(-100%)" }
        : { top: rect.bottom + GAP, left: rect.left };
  const caret =
    side === "right"
      ? "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2"
      : side === "top"
        ? "left-6 bottom-0 translate-y-1/2"
        : "left-6 top-0 -translate-y-1/2";

  return createPortal(
    <div
      role="dialog"
      aria-label={t(`${stepKey}.title`)}
      style={{ position: "fixed", ...style }}
      className="no-print z-[720] w-72 max-w-[calc(100vw-2rem)] rounded-xl bg-slate-800 p-4 text-white shadow-xl ring-1 ring-cyan-400/30"
    >
      <span className={`absolute h-3 w-3 rotate-45 bg-slate-800 ${caret}`} aria-hidden />
      <div className="mb-1 text-xs font-semibold text-cyan-300">
        {t("progress", { current: index + 1, total: ONBOARDING_ORDER.length })}
      </div>
      <h3 className="text-sm font-bold">{t(`${stepKey}.title`)}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-300">{t(`${stepKey}.body`)}</p>
      <div className="mt-3 flex items-center justify-between">
        <button onClick={skip} className="text-xs text-slate-400 transition-colors hover:text-white">
          {t("skip")}
        </button>
        <button
          onClick={next}
          className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400"
        >
          {isLast ? t("done") : t("next")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
