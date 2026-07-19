"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/client";

const MAX_MESSAGE_LENGTH = 2000;

/**
 * Independently re-checks who's logged in server-side — same "never trust
 * the caller, re-derive from the session" pattern as every other Server
 * Action in this app (see requireAdminResult() in matchday/actions.ts).
 */
export async function postChatMessage(
  content: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "Message can't be empty." };
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).` };
  }

  const client = createServiceRoleClient();
  const { error } = await client.from("chat_messages").insert({
    sender_canonical_id: user.canonicalId,
    content: trimmed,
  });
  if (error) return { ok: false, error: "Could not send that message." };

  revalidatePath("/chat");
  return { ok: true };
}
