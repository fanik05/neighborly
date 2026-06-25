'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { useAuth } from '@/lib/auth';
import type {
  Message,
  MessageNew,
  TypingEvent,
  ReadEvent,
  PresenceEvent,
} from '@/lib/types';

/** One conversation thread: history + live send/typing/presence/receipts. */
export function useChat(conversationId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerReadAt, setPeerReadAt] = useState(false);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!conversationId || !user) return;
    let cancelled = false;
    const socket = connectSocket();

    api<Message[]>(`/conversations/${conversationId}/messages`).then((history) => {
      if (!cancelled) setMessages(history);
    });

    socket.emit('join', conversationId);
    socket.emit('message:read', { conversationId });

    function onNew({ message }: MessageNew) {
      if (message.conversation !== conversationId) return;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      if (message.sender !== user!.id) socket.emit('message:read', { conversationId });
    }
    function onTyping(e: TypingEvent) {
      if (e.conversationId === conversationId && e.userId !== user!.id) setPeerTyping(e.isTyping);
    }
    function onRead(e: ReadEvent) {
      if (e.conversationId === conversationId && e.readerId !== user!.id) setPeerReadAt(true);
    }
    function onPresence(e: PresenceEvent) {
      if (e.userId !== user!.id) setPeerOnline(e.online);
    }

    socket.on('message:new', onNew);
    socket.on('typing', onTyping);
    socket.on('message:read', onRead);
    socket.on('presence:update', onPresence);

    return () => {
      cancelled = true;
      socket.emit('leave', conversationId);
      socket.off('message:new', onNew);
      socket.off('typing', onTyping);
      socket.off('message:read', onRead);
      socket.off('presence:update', onPresence);
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      setMessages([]);
      setPeerTyping(false);
      setPeerReadAt(false);
    };
  }, [conversationId, user]);

  function send(text: string) {
    const body = text.trim();
    if (!body || !conversationId) return;
    connectSocket().emit('message:send', { conversationId, text: body });
    setPeerReadAt(false);
  }

  function setTyping(isTyping: boolean) {
    if (!conversationId) return;
    const socket = connectSocket();
    socket.emit('typing', { conversationId, isTyping });
    if (isTyping) {
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => socket.emit('typing', { conversationId, isTyping: false }), 3000);
    }
  }

  const lastReadByPeer =
    peerReadAt && messages.length > 0 && messages[messages.length - 1].sender === user?.id;

  return { messages, send, setTyping, peerTyping, peerOnline, lastReadByPeer };
}
