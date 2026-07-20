import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Mermaid from "./Mermaid";

// チャットのアシスタント本文を Markdown でリッチ表示する。
// Tailwind の typography プラグインは未導入のため、要素ごとにクラスを当てる。
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed text-slate-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="marker:text-slate-400">{children}</li>,
          h1: ({ children }) => <h1 className="mb-1.5 mt-2 text-base font-bold text-slate-900 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-1.5 mt-2 text-[15px] font-bold text-slate-900 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold text-slate-800 first:mt-0">{children}</h3>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="font-medium text-cyan-700 underline underline-offset-2 hover:text-cyan-800">
              {children}
            </a>
          ),
          hr: () => <hr className="my-3 border-slate-200" />,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-slate-200 pl-3 text-slate-500">{children}</blockquote>
          ),
          // fenced code block（```）は pre > code、インラインは code のみで届く。
          // pre は素通しにして、mermaid 判定・見た目を code 側に一本化する。
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const text = String(children ?? "");
            const lang = /language-(\w+)/.exec(className ?? "")?.[1];
            if (lang === "mermaid") {
              return <Mermaid chart={text.replace(/\n$/, "")} />;
            }
            // 言語指定つき or 改行を含む＝ブロック。それ以外はインライン。
            if (lang || text.includes("\n")) {
              return (
                <pre className="mb-2 overflow-x-auto rounded-lg bg-slate-100 p-2.5 text-[12px] text-slate-700 last:mb-0">
                  <code>{children}</code>
                </pre>
              );
            }
            return (
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12px] text-slate-700">{children}</code>
            );
          },
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto last:mb-0">
              <table className="w-full border-collapse text-[13px]">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border border-slate-200 px-2 py-1">{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
