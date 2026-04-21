import { createContext, useContext } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

const InsidePreContext = createContext(false);

function CodeBlock({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  const isInsidePre = useContext(InsidePreContext);

  if (isInsidePre) {
    return (
      <code
        className={cn('font-mono text-xs text-[#F0E6E0]', className)}
        {...props}
      >
        {children}
      </code>
    );
  }

  return (
    <code
      className="bg-[#F3EDE3] px-1.5 py-0.5 rounded font-mono text-xs text-[#5C1A1A] border border-[#D4C5B0]"
      {...props}
    >
      {children}
    </code>
  );
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn('text-[#2C1810] leading-relaxed', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-[#5C1A1A] text-2xl font-bold mt-4 mb-2 leading-tight">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-[#5C1A1A] text-xl font-semibold mt-3 mb-2 leading-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[#5C1A1A] text-base font-semibold mt-3 mb-1.5 leading-tight">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-[#5C1A1A] text-sm font-semibold mt-2 mb-1 leading-tight">
              {children}
            </h4>
          ),
          h5: ({ children }) => (
            <h5 className="text-[#7A2828] text-sm font-medium mt-2 mb-1">
              {children}
            </h5>
          ),
          h6: ({ children }) => (
            <h6 className="text-[#7A5C4A] text-sm font-medium mt-2 mb-1">
              {children}
            </h6>
          ),

          p: ({ children }) => (
            <p className="text-[#2C1810] my-2 leading-relaxed">{children}</p>
          ),

          pre: ({ children }) => (
            <InsidePreContext.Provider value={true}>
              <pre className="bg-[#1C0808] p-3 rounded overflow-x-auto font-mono text-xs my-2 border border-[#3A1515]">
                {children}
              </pre>
            </InsidePreContext.Provider>
          ),

          code: CodeBlock,

          ul: ({ children }) => (
            <ul className="ml-6 my-2 list-disc space-y-0.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="ml-6 my-2 list-decimal space-y-0.5">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="my-1 text-[#2C1810] leading-relaxed">{children}</li>
          ),

          strong: ({ children }) => (
            <strong className="text-[#2C1810] font-semibold">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="text-[#2C1810] italic">{children}</em>
          ),

          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[#5C1A1A] pl-3 my-2 text-[#7A5C4A] italic bg-[#F9F3EC] py-2 rounded-r">
              {children}
            </blockquote>
          ),

          hr: () => <hr className="border-[#D4C5B0] my-4" />,

          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="border-collapse w-full text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-[#D4C5B0]">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="border border-[#D4C5B0] px-2 py-1 text-sm bg-[#F3EDE3] font-semibold text-[#2C1810] text-left">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-[#D4C5B0] px-2 py-1 text-sm text-[#2C1810]">
              {children}
            </td>
          ),

          a: ({ children, href }) => (
            <a
              href={href}
              className="text-[#5C1A1A] hover:text-[#7A2828] underline underline-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),

          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt}
              className="max-w-full rounded my-2 border border-[#D4C5B0]"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
