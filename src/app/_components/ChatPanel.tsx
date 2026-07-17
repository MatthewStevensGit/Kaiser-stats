"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { postChatMessage } from "@/lib/chat/actions";
import { formatChatTimestamp } from "@/lib/format";
import type { ChatMessage } from "@/lib/chat/data";

const POLL_INTERVAL_MS = 4000;

export function ChatPanel({
  messages,
  currentUserCanonicalId,
}: {
  messages: ChatMessage[];
  currentUserCanonicalId: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  // Polls for new messages from other people — no Realtime wiring here (see
  // chat_messages' doc comment in supabase/schema.sql: that would need a
  // public/authenticated SELECT policy, which this app deliberately never
  // adds — every table stays RLS-with-no-public-policies, service-role only).
  useEffect(() => {
    const interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const toSend = text;
    setError(null);
    startTransition(async () => {
      const result = await postChatMessage(toSend);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setText("");
      router.refresh();
    });
  }

  return (
    <div className="chat-panel">
      <div className="chat-message-list" ref={listRef}>
        {messages.length === 0 ? (
          <div className="empty-state">No messages yet — say hello.</div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={
                m.senderCanonicalId === currentUserCanonicalId
                  ? "chat-message chat-message-own"
                  : "chat-message"
              }
            >
              <div className="chat-message-meta">
                <span className="chat-message-sender">{m.senderDisplayName}</span>
                <span className="chat-message-time">{formatChatTimestamp(m.createdAt)}</span>
              </div>
              <p className="chat-message-content">{m.content}</p>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="chat-form">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message the club..."
          className="login-form-input chat-form-input"
          disabled={isPending}
          required
        />
        <button type="submit" className="login-form-submit" disabled={isPending || !text.trim()}>
          Send
        </button>
      </form>
      {error && <p className="note login-form-error">{error}</p>}
    </div>
  );
}
