import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Send, MessageSquare, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type RespondMode = 'respond' | 'chat' | 'waiting' | 'none';

interface RespondBarProps {
  mode: RespondMode;
  runId: string | null;
  className?: string;
}

export function RespondBar({ mode, runId, className }: RespondBarProps) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'respond' || mode === 'chat') {
      inputRef.current?.focus();
    }
  }, [mode]);

  if (mode === 'none') return null;

  async function handleSubmit() {
    if (!runId || !value.trim() || sending) return;

    const endpoint =
      mode === 'respond'
        ? `/api/runs/${runId}/respond`
        : `/api/runs/${runId}/chat`;

    const body =
      mode === 'respond'
        ? { response: value.trim() }
        : { message: value.trim() };

    setSending(true);
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setValue('');
    } catch {
      // socket events will reflect errors
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const isWaiting = mode === 'waiting';
  const isDisabled = isWaiting || sending || !runId;

  const placeholder =
    mode === 'respond'
      ? 'Type a response to the running script…'
      : mode === 'chat'
      ? 'Ask a follow-up question…'
      : 'Waiting for script…';

  const buttonLabel = mode === 'respond' ? 'Send' : 'Chat';
  const ButtonIcon = mode === 'chat' ? MessageSquare : Send;

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-3 bg-white border-t border-[#D4C5B0] shrink-0',
        className
      )}
    >
      <div className="shrink-0">
        {isWaiting ? (
          <Loader2 className="h-4 w-4 text-[#A08570] animate-spin" />
        ) : mode === 'chat' ? (
          <MessageSquare className="h-4 w-4 text-[#6B2D6B]" />
        ) : (
          <Send className="h-4 w-4 text-[#7A5C4A]" />
        )}
      </div>

      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isDisabled}
        placeholder={placeholder}
        className={cn(
          'flex-1 bg-[#F9F6F1] border border-[#D4C5B0] rounded-md px-3 py-1.5',
          'text-sm text-[#2C1810] placeholder:text-[#A08570]',
          'focus:outline-none focus:ring-2 focus:ring-[#5C1A1A] focus:ring-offset-0 focus:border-[#5C1A1A]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'transition-colors'
        )}
      />

      <Button
        size="sm"
        variant={mode === 'chat' ? 'purple' : 'default'}
        onClick={handleSubmit}
        disabled={isDisabled || !value.trim()}
        className="gap-1.5 shrink-0"
      >
        {sending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ButtonIcon className="h-3.5 w-3.5" />
        )}
        {buttonLabel}
      </Button>
    </div>
  );
}
