'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useChat } from '@/lib/useChat';
import { useConversations } from '@/lib/useConversations';
import ConversationList from '@/components/ConversationList';
import MessageThread from '@/components/MessageThread';
import MessageComposer from '@/components/MessageComposer';

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const { conversations } = useConversations();
  const { messages, send, setTyping, peerTyping, peerOnline, lastReadByPeer } = useChat(id);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) return <p className="py-16 text-center text-muted">Loading…</p>;

  const active = conversations.find((c) => c.id === id);

  return (
    <div className="grid h-[70vh] grid-cols-1 overflow-hidden rounded-tag border border-line bg-card md:grid-cols-[20rem_1fr]">
      <aside className="hidden border-r border-line md:block md:overflow-y-auto">
        <ConversationList conversations={conversations} activeId={id} />
      </aside>
      <section className="flex min-h-0 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {active?.otherParticipant.name ?? 'Conversation'}
              <span
                className={`ml-2 inline-block h-2 w-2 rounded-full ${peerOnline ? 'bg-available' : 'bg-line'}`}
                title={peerOnline ? 'Online' : 'Offline'}
              />
            </p>
            {active?.item && (
              <Link href={`/items/${active.item.id}`} className="truncate text-xs text-pine hover:underline">
                {active.item.title}
              </Link>
            )}
          </div>
          <Link href="/messages" className="text-sm text-muted hover:text-ink md:hidden">
            ← All
          </Link>
        </header>
        <MessageThread messages={messages} meId={user.id} peerTyping={peerTyping} lastReadByPeer={lastReadByPeer} />
        <MessageComposer onSend={send} onTyping={setTyping} />
      </section>
    </div>
  );
}
