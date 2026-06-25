'use client';

import { useEffect, useRef } from 'react';
import type { Message } from '@/lib/types';

export default function MessageThread({
  messages,
  meId,
  peerTyping,
  lastReadByPeer,
}: {
  messages: Message[];
  meId: string;
  peerTyping: boolean;
  lastReadByPeer: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, peerTyping]);

  return (
    <div className="flex-1 space-y-2 overflow-y-auto p-4">
      {messages.map((m) => {
        const mine = m.sender === meId;
        return (
          <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] rounded-tag px-3 py-2 text-sm ${
                mine ? 'bg-pine text-onaccent' : 'border border-line bg-card text-ink'
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              <span className={`mt-0.5 block font-mono text-[0.6rem] ${mine ? 'text-onaccent/70' : 'text-muted'}`}>
                {new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
          </div>
        );
      })}
      {lastReadByPeer && <p className="pr-1 text-right font-mono text-[0.6rem] text-muted">Seen</p>}
      {peerTyping && <p className="font-mono text-xs text-muted">typing…</p>}
      <div ref={endRef} />
    </div>
  );
}
