import { createServiceRoleClient } from "../supabase/client";

export interface ChatMessage {
  id: number;
  senderCanonicalId: string;
  senderDisplayName: string;
  content: string;
  createdAt: string;
}

const RECENT_MESSAGE_LIMIT = 100;

/**
 * Most recent club chat messages, oldest first (ready to render top-to-
 * bottom). Not itself an authz boundary — every caller (src/app/chat/page.tsx)
 * is responsible for requiring a logged-in session first, same convention as
 * getGameCheckinDetails() in src/lib/matchday/data.ts.
 */
export async function listRecentMessages(): Promise<ChatMessage[]> {
  const client = createServiceRoleClient();

  const { data: messages } = await client
    .from("chat_messages")
    .select("id, sender_canonical_id, content, created_at")
    .order("created_at", { ascending: false })
    .limit(RECENT_MESSAGE_LIMIT);

  if (!messages || messages.length === 0) return [];

  const senderIds = Array.from(new Set(messages.map((m) => m.sender_canonical_id)));
  const { data: players } = await client
    .from("players")
    .select("canonical_id, display_name")
    .in("canonical_id", senderIds);

  const nameById = new Map((players ?? []).map((p) => [p.canonical_id, p.display_name]));

  return messages
    .map((m) => ({
      id: m.id,
      senderCanonicalId: m.sender_canonical_id,
      senderDisplayName: nameById.get(m.sender_canonical_id) ?? m.sender_canonical_id,
      content: m.content,
      createdAt: m.created_at,
    }))
    .reverse();
}
