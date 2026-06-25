'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { useAuth } from '@/lib/auth';
import type { Conversation, InboxMessageEvent, ReadEvent } from '@/lib/types';

interface ConversationsValue {
  conversations: Conversation[];
  totalUnread: number;
  reload: () => void;
}

const ConversationsContext = createContext<ConversationsValue>({
  conversations: [],
  totalUnread: 0,
  reload: () => {},
});

/** Single source of truth for the inbox list + unread badge. Mount once (layout). */
export function ConversationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const reload = useCallback(() => {
    api<Conversation[]>('/conversations')
      .then(setConversations)
      .catch(() => setConversations([]));
  }, []);

  useEffect(() => {
    if (!user) {
      setConversations([]);
      return;
    }
    reload();
    const socket = connectSocket();

    function onInbox({ conversationId, message }: InboxMessageEvent) {
      const mine = message.sender === user!.id;
      let known = true;
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conversationId);
        if (idx === -1) {
          known = false;
          return prev;
        }
        const c = prev[idx];
        const updated: Conversation = {
          ...c,
          lastMessage: message.text,
          updatedAt: message.createdAt,
          unreadCount: mine ? c.unreadCount : c.unreadCount + 1,
        };
        return [updated, ...prev.filter((x) => x.id !== conversationId)];
      });
      if (!known) reload();
    }

    function onRead({ conversationId, readerId }: ReadEvent) {
      if (readerId !== user!.id) return; // clear only when *I* read the thread
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
      );
    }

    socket.on('inbox:message', onInbox);
    socket.on('message:read', onRead);
    return () => {
      socket.off('inbox:message', onInbox);
      socket.off('message:read', onRead);
    };
  }, [user, reload]);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <ConversationsContext.Provider value={{ conversations, totalUnread, reload }}>
      {children}
    </ConversationsContext.Provider>
  );
}

/** Read the shared conversations state. Must be under <ConversationsProvider>. */
export function useConversations(): ConversationsValue {
  return useContext(ConversationsContext);
}
