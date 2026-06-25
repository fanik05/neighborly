'use client';

import Link from 'next/link';
import type { Conversation } from '@/lib/types';

export default function ConversationList({
  conversations,
  activeId,
}: {
  conversations: Conversation[];
  activeId?: string;
}) {
  if (!conversations.length) {
    return <p className="p-6 text-sm text-muted">No conversations yet. Message a neighbor from a listing.</p>;
  }
  return (
    <ul className="divide-y divide-line">
      {conversations.map((c) => (
        <li key={c.id}>
          <Link
            href={`/messages/${c.id}`}
            className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper ${
              c.id === activeId ? 'bg-paper' : ''
            }`}
          >
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-tag border border-line bg-paper">
              {c.item?.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.item.cover} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{c.otherParticipant.name}</span>
                {c.unreadCount > 0 && (
                  <span className="shrink-0 rounded-full bg-marigold px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold text-onaccent">
                    {c.unreadCount}
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted">{c.item?.title ?? '(listing removed)'}</p>
              <p className="truncate text-sm text-ink/80">{c.lastMessage || 'No messages yet'}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
