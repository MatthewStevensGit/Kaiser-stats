import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listRecentMessages } from "@/lib/chat/data";
import { ChatPanel } from "../_components/ChatPanel";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const messages = await listRecentMessages();

  return (
    <main>
      <header className="screen-header-row">
        <h1 className="screen-header">Club Chat</h1>
      </header>

      <ChatPanel messages={messages} currentUserCanonicalId={user.canonicalId} />
    </main>
  );
}
