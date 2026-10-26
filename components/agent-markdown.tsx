"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";

const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  a: ({ href, children }) => (
    <a href={href} className="underline underline-offset-2">
      {children}
    </a>
  ),
  h1: ({ children }) => <p className="mb-2 font-semibold last:mb-0">{children}</p>,
  h2: ({ children }) => <p className="mb-2 font-semibold last:mb-0">{children}</p>,
  h3: ({ children }) => <p className="mb-2 font-semibold last:mb-0">{children}</p>,
  h4: ({ children }) => <p className="mb-2 font-semibold last:mb-0">{children}</p>,
  h5: ({ children }) => <p className="mb-2 font-semibold last:mb-0">{children}</p>,
  h6: ({ children }) => <p className="mb-2 font-semibold last:mb-0">{children}</p>,
};

export function AgentMarkdown({ text }: { text: string }) {
  return (
    <div className="text-[15px] leading-6">
      <ReactMarkdown remarkPlugins={[remarkBreaks]} skipHtml components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
