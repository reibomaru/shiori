import { FaCompass, FaLink, FaStar, FaRegStar } from "react-icons/fa6";
import type { Spot } from "../types";
import { api } from "../api";

function Stars({ n }: { n: number }) {
  const v = Math.max(0, Math.min(5, n));
  return (
    <span className="inline-flex items-center text-amber-400">
      {Array.from({ length: 5 }, (_, i) =>
        i < v ? <FaStar key={i} className="text-xs" /> : <FaRegStar key={i} className="text-xs" />
      )}
    </span>
  );
}

export default function Spots({ spots, edit, reload }: { spots: Spot[]; edit: boolean; reload: () => void }) {
  async function remove(s: Spot) {
    if (!confirm(`候補「${s.name}」を削除しますか？`)) return;
    await api.deleteSpot(s.id);
    reload();
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
          <FaCompass className="text-cyan-700" /> 行きたいスポット候補
        </h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{spots.length} 件</span>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        ガイドブックを見ながら Skill で登録した候補。旅程に組み込む前の「行きたいリスト」。
      </p>
      {spots.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-400">
          まだ候補がありません。Skill から登録してみましょう。
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {spots.map((s) => (
            <li key={s.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800">
                    {s.name}
                    {s.name_en && <span className="ml-1 text-xs font-normal text-slate-400">{s.name_en}</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                    {s.country && <span>{s.country}</span>}
                    {s.city && <span>· {s.city}</span>}
                    {s.category && <span className="rounded bg-slate-100 px-1.5 py-0.5">{s.category}</span>}
                    <Stars n={s.want_level} />
                  </div>
                  {s.note && <p className="mt-1 text-sm text-slate-600">{s.note}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-cyan-700 hover:underline">
                        <FaLink className="text-[10px]" /> リンク
                      </a>
                    )}
                    {s.source && <span className="text-slate-400">出典: {s.source}</span>}
                  </div>
                </div>
                {edit && (
                  <button onClick={() => remove(s)} className="shrink-0 rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">削除</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
