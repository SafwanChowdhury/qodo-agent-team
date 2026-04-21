import { MarkdownRenderer } from '@/components/MarkdownRenderer';

interface ChatBubbleProps {
  role: 'user' | 'agent';
  content: string;
}

export function ChatBubble({ role, content }: ChatBubbleProps) {
  if (role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1 my-3">
        <span className="text-xs text-[#A08570] mr-1">You</span>
        <div className="max-w-[80%] bg-[#5C1A1A] rounded-lg px-4 py-2.5">
          <p className="text-sm text-[#F9F6F1] leading-relaxed whitespace-pre-wrap break-words">
            {content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1 my-3">
      <span className="text-xs text-[#A08570] ml-1">🧠 Planner</span>
      <div className="w-full bg-[#F9F3EC] border border-[#E8D8C4] rounded-lg px-4 py-3">
        <MarkdownRenderer content={content} />
      </div>
    </div>
  );
}
