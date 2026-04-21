import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface TerminalProps {
  content: string;
  className?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function colorizeLine(escaped: string): string {
  if (/^[═]{3,}/.test(escaped) || /PHASE/.test(escaped)) {
    return `<span class="text-[#c084fc] font-bold">${escaped}</span>`;
  }

  if (/^[━]{3,}/.test(escaped) || /CHECKPOINT/.test(escaped)) {
    return `<span class="text-[#fbbf24] font-bold">${escaped}</span>`;
  }

  if (escaped.includes('✅') || escaped.includes('&#x2705;')) {
    return `<span class="text-[#4ade80]">${escaped}</span>`;
  }

  if (escaped.includes('❌') || escaped.includes('&#x274C;')) {
    return `<span class="text-[#f87171]">${escaped}</span>`;
  }

  if (escaped.includes('⏭') || escaped.includes('&#x23ED;')) {
    return `<span class="text-[#9ca3af]">${escaped}</span>`;
  }

  if (escaped.includes('🔵') || escaped.includes('&#x1F535;')) {
    return `<span class="text-[#93c5fd]">${escaped}</span>`;
  }

  if (/\[Script completed/i.test(escaped)) {
    return `<span class="text-[#4ade80]">${escaped}</span>`;
  }

  if (/\[Script failed/i.test(escaped)) {
    return `<span class="text-[#f87171]">${escaped}</span>`;
  }

  if (/\[Generating/i.test(escaped)) {
    return `<span class="text-[#fbbf24]">${escaped}</span>`;
  }

  if (/\[Stage \d+\/\d+/i.test(escaped)) {
    return `<span class="text-[#c084fc] font-bold">${escaped}</span>`;
  }

  let result = escaped;

  result = result.replace(
    /(\[\d{2}:\d{2}:\d{2}\])/g,
    '<span class="text-[#6b7280]">$1</span>'
  );

  result = result.replace(
    /(\[(?:Opus|Sonnet|Claude[^\]]*)\])/gi,
    '<span class="text-[#93c5fd]">$1</span>'
  );

  return result;
}

function colorizeContent(raw: string): string {
  if (!raw) return '';
  return raw
    .split('\n')
    .map((line) => colorizeLine(escapeHtml(line)))
    .join('\n');
}

export function Terminal({ content, className }: TerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 120;
    if (nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [content]);

  const colorized = colorizeContent(content);

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex-1 overflow-y-auto bg-[#1C0808] p-4 font-mono text-xs leading-relaxed text-[#F0E6E0]',
        className
      )}
    >
      <pre
        className="whitespace-pre-wrap break-words m-0"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: colorized }}
      />
      <div ref={bottomRef} />
    </div>
  );
}
