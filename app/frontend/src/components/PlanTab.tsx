import { useEffect, useRef, useState } from 'react';
import { Send, CheckCircle, MessageSquare, Edit3, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { ChatBubble } from '@/components/ChatBubble';
import { useRunStore } from '@/store/runStore';
import { emitPlanMessage, emitApprovePlan } from '@/lib/socket';
import type { RunStatus } from '@/types';

const POST_REVIEW_STATUSES: RunStatus[] = [
  'generating',
  'running',
  'chatting',
  'completed',
  'failed',
  'stopped',
  'error',
];

export function PlanTab() {
  const runId = useRunStore((s) => s.runId);
  const runStatus = useRunStore((s) => s.runStatus);
  const planStreaming = useRunStore((s) => s.planStreaming);
  const planOutput = useRunStore((s) => s.planOutput);
  const planConversation = useRunStore((s) => s.planConversation);

  const [chatInput, setChatInput] = useState('');
  const [showChatInput, setShowChatInput] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedPlan, setEditedPlan] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const isPlanning = runStatus === 'planning';
  const isPlanReview = runStatus === 'plan-review';
  const isPostReview =
    runStatus !== null && POST_REVIEW_STATUSES.includes(runStatus);

  useEffect(() => {
    if (isPlanning && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [planStreaming, isPlanning]);

  useEffect(() => {
    if (isPlanReview) {
      setShowChatInput(false);
      setChatInput('');
      setEditMode(false);
    }
  }, [isPlanReview]);

  useEffect(() => {
    if (showChatInput && chatInputRef.current) {
      chatInputRef.current.focus();
    }
  }, [showChatInput]);

  function handleSendMessage() {
    const trimmed = chatInput.trim();
    if (!runId || !trimmed) return;
    emitPlanMessage(runId, trimmed);
    setChatInput('');
    setShowChatInput(false);
  }

  function handleChatKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
    if (e.key === 'Escape') {
      setShowChatInput(false);
      setChatInput('');
    }
  }

  function handleEditPlan() {
    setEditedPlan(planOutput);
    setEditMode(true);
    setShowChatInput(false);
  }

  function handleCancelEdit() {
    setEditMode(false);
    setEditedPlan('');
  }

  function handleApprovePlan() {
    if (!runId) return;
    emitApprovePlan(runId, editMode && editedPlan ? editedPlan : undefined);
  }

  function renderPlanningEmpty() {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 py-16">
        <div className="flex items-center justify-center h-10 w-10 rounded-full bg-[#F3EDE3] border border-[#D4C5B0]">
          <Loader2 className="h-5 w-5 text-[#5C1A1A] animate-spin" />
        </div>
        <span className="text-sm text-[#7A5C4A]">Generating plan…</span>
      </div>
    );
  }

  function renderPlanningContent() {
    if (!planStreaming) return renderPlanningEmpty();
    return (
      <div className="p-5">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#EDE5D8]">
          <Loader2 className="h-3.5 w-3.5 text-[#5C1A1A] animate-spin shrink-0" />
          <span className="text-xs text-[#7A5C4A] font-medium">Generating plan…</span>
        </div>
        <MarkdownRenderer content={planStreaming} />
      </div>
    );
  }

  function renderConversation() {
    if (planConversation.length > 0) {
      return (
        <div className="p-5 space-y-1">
          {planConversation.map((msg, idx) => (
            <ChatBubble key={idx} role={msg.role} content={msg.content} />
          ))}
        </div>
      );
    }

    if (planOutput) {
      return (
        <div className="p-5">
          <MarkdownRenderer content={planOutput} />
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center flex-1 py-12">
        <span className="text-sm text-[#A08570]">No plan content yet.</span>
      </div>
    );
  }

  function renderEditMode() {
    return (
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <Edit3 className="h-4 w-4 text-[#7A5C4A]" />
          <span className="text-sm text-[#7A5C4A] font-medium">
            Edit the plan before approving
          </span>
        </div>
        <Textarea
          value={editedPlan}
          onChange={(e) => setEditedPlan(e.target.value)}
          className="flex-1 min-h-[400px] font-mono text-xs resize-none"
          placeholder="Edit plan content…"
          spellCheck={false}
        />
      </div>
    );
  }

  function renderPostReview() {
    if (!planOutput) {
      return (
        <div className="flex items-center justify-center flex-1 py-12">
          <span className="text-sm text-[#A08570]">Plan not available.</span>
        </div>
      );
    }
    return (
      <div className="p-5">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#EDE5D8]">
          <CheckCircle className="h-3.5 w-3.5 text-[#2D6A2D] shrink-0" />
          <span className="text-xs text-[#2D6A2D] font-semibold uppercase tracking-wide">
            Plan approved
          </span>
        </div>
        <MarkdownRenderer content={planOutput} />
      </div>
    );
  }

  function renderActionBar() {
    return (
      <div className="shrink-0 border-t border-[#D4C5B0] bg-white">
        {showChatInput && (
          <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-[#EDE5D8]">
            <Input
              ref={chatInputRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              placeholder="Describe the changes you want…"
              className="flex-1 text-sm"
            />
            <Button
              size="sm"
              onClick={handleSendMessage}
              disabled={!chatInput.trim()}
              className="gap-1.5 shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowChatInput(false);
                setChatInput('');
              }}
              className="shrink-0 text-[#A08570] hover:text-[#2C1810]"
            >
              Cancel
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <div className="flex items-center gap-2">
            {!editMode ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setShowChatInput((prev) => !prev);
                    setEditMode(false);
                  }}
                  className="gap-1.5"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Request Changes
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleEditPlan}
                  className="gap-1.5"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit Plan
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancelEdit}
                className="gap-1.5 text-[#A08570] hover:text-[#2C1810]"
              >
                Cancel Edit
              </Button>
            )}
          </div>

          <Button
            size="sm"
            variant="success"
            onClick={handleApprovePlan}
            className="gap-1.5 font-medium"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Approve &amp; Generate Script
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto min-h-0"
      >
        {isPlanning && renderPlanningContent()}

        {isPlanReview && (
          <>
            {editMode ? renderEditMode() : renderConversation()}
          </>
        )}

        {isPostReview && renderPostReview()}

        {runStatus === null && (
          <div className="flex items-center justify-center flex-1 h-full py-12">
            <span className="text-sm text-[#A08570]">
              No active run. Start a run to see the plan.
            </span>
          </div>
        )}
      </div>

      {isPlanReview && renderActionBar()}
    </div>
  );
}
