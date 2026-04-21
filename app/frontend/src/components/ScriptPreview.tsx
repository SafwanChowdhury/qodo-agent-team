import { cn } from '@/lib/utils';

interface ScriptPreviewProps {
  content: string;
  className?: string;
}

const BASH_KEYWORDS = [
  'if', 'then', 'else', 'elif', 'fi',
  'for', 'while', 'do', 'done',
  'case', 'esac', 'in',
  'function', 'return', 'exit',
  'local', 'export', 'readonly',
  'echo', 'printf', 'read',
  'source', 'set', 'unset',
  'true', 'false',
];

const BASH_BUILTINS = [
  'cd', 'pwd', 'ls', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'grep', 'sed', 'awk',
  'find', 'chmod', 'chown', 'curl', 'wget', 'git', 'npm', 'node', 'python',
  'python3', 'pip', 'pip3', 'docker', 'kubectl', 'ssh', 'scp', 'tar', 'zip',
  'unzip', 'touch', 'head', 'tail', 'sort', 'uniq', 'wc', 'xargs', 'tee',
  'env', 'which', 'type', 'kill', 'ps', 'top', 'df', 'du', 'date', 'sleep',
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function highlightLine(escaped: string): string {
  if (/^#!/.test(escaped)) {
    return `<span class="text-[#6b7280] italic">${escaped}</span>`;
  }

  if (/^\s*#/.test(escaped)) {
    return `<span class="text-[#9ca3af] italic">${escaped}</span>`;
  }

  let result = escaped;

  result = result.replace(
    /((?:^|[^&])\s)(#[^{].*)$/,
    '$1<span class="text-[#9ca3af] italic">$2</span>'
  );

  result = result.replace(
    /(&quot;[^&]*?&quot;)/g,
    '<span class="text-[#86efac]">$1</span>'
  );

  result = result.replace(
    /(&#039;[^&]*?&#039;)/g,
    '<span class="text-[#86efac]">$1</span>'
  );

  result = result.replace(
    /(\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\$[0-9@#?*!$-])/g,
    '<span class="text-[#fca5a5]">$1</span>'
  );

  const kwPattern = new RegExp(
    `\\b(${BASH_KEYWORDS.join('|')})\\b`,
    'g'
  );
  result = result.replace(
    kwPattern,
    '<span class="text-[#f9a8d4] font-semibold">$1</span>'
  );

  const builtinPattern = new RegExp(
    `((?:^|[|;&\\s]))(${BASH_BUILTINS.join('|')})(?=\\s|$)`,
    'g'
  );
  result = result.replace(
    builtinPattern,
    '$1<span class="text-[#93c5fd]">$2</span>'
  );

  result = result.replace(
    /\b(\d+)\b/g,
    '<span class="text-[#fcd34d]">$1</span>'
  );

  return result;
}

function highlightScript(raw: string): string {
  if (!raw) return '';
  return raw
    .split('\n')
    .map((line) => highlightLine(escapeHtml(line)))
    .join('\n');
}

export function ScriptPreview({ content, className }: ScriptPreviewProps) {
  const highlighted = highlightScript(content);

  return (
    <div
      className={cn(
        'flex-1 overflow-y-auto bg-[#1C0808] border border-[#3A1515] rounded-lg',
        className
      )}
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#2A0E0E] border-b border-[#3A1515] shrink-0">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#3A1515]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#3A1515]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#3A1515]" />
        </div>
        <span className="text-xs font-mono text-[#9ca3af] ml-1">bash</span>
        <span className="text-xs text-[#6b7280]">·</span>
        <span className="text-xs text-[#6b7280]">generated script</span>
      </div>

      {/* Code area */}
      <div className="overflow-x-auto">
        <pre
          className="p-4 font-mono text-xs leading-relaxed text-[#F0E6E0] m-0 min-w-0"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </div>
    </div>
  );
}
