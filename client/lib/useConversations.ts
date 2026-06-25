'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { useAuth } from '@/lib/auth';
import type { Conversation, InboxMessageEvent } from '@/lib/types';

/** Inbox list + total unread badge. Owns the socket connection for the session. */
export function useConversations() {
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
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conversationId);
        if (idx === -1) {
          reload();
          return prev;
        }
        const c = prev[idx];
        const mine = message.sender === user!.id;
        const updated: Conversation = {
          ...c,
          lastMessage: message.text,
          updatedAt: message.createdAt,
          unreadCount: mine ? c.unreadCount : c.unreadCount + 1,
        };
        return [updated, ...prev.filter((x) => x.id !== conversationId)];
      });
    }

    socket.on('inbox:message', onInbox);
    return () => {
      socket.off('inbox:message', onInbox);
    };
  }, [user, reload]);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  return { conversations, totalUnread, reload };
}
