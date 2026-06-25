import jwt from 'jsonwebtoken';
import type { Server, Socket } from 'socket.io';
import {
  isParticipant,
  persistMessage,
  markRead,
  conversationIdsForUser,
  participantIdsForConversation,
  isValidMessageText,
} from '../services/conversationService.js';
import { goOnline, goOffline, isOnline } from './presence.js';
import type { MessageSend, TypingClient, ReadClient } from '@neighborly/shared';

const userRoom = (userId: string) => `user:${userId}`;

/** Run a socket handler, swallowing errors so one bad event never crashes the server. */
function safe(handler: () => Promise<void>): void {
  handler().catch((err) => console.error('[socket]', err instanceof Error ? err.message : err));
}

/**
 * Wire up Socket.io chat: authed handshake, room join/leave, real-time messages,
 * typing, read receipts, and presence. Persists every message before emitting.
 */
export function registerChat(io: Server): void {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET as string) as { sub: string };
      socket.data.userId = payload.sub; // never trust a client-supplied id — use this
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    socket.join(userRoom(userId));

    // Announce presence to the user's conversations on the 0→1 transition.
    safe(async () => {
      if (!goOnline(userId)) return;
      const ids = await conversationIdsForUser(userId);
      for (const id of ids) io.to(id).emit('presence:update', { userId, online: true });
    });

    socket.on('join', (conversationId: string) =>
      safe(async () => {
        const id = String(conversationId || '');
        if (!id || !(await isParticipant(id, userId))) return;
        socket.join(id);
        // Tell the joiner whether the OTHER participant is currently online.
        const members = await participantIdsForConversation(id);
        const peerId = members.find((m) => m !== userId);
        if (peerId) socket.emit('presence:update', { userId: peerId, online: isOnline(peerId) });
      })
    );

    socket.on('leave', (conversationId: string) => {
      if (conversationId) socket.leave(String(conversationId));
    });

    socket.on('message:send', (payload: MessageSend) =>
      safe(async () => {
        const conversationId = String(payload?.conversationId || '');
        if (!conversationId || !isValidMessageText(payload?.text)) return;
        if (!(await isParticipant(conversationId, userId))) return;
        const message = await persistMessage(conversationId, userId, payload.text);
        io.to(conversationId).emit('message:new', { message });
        // Update both participants' inboxes/badges even if the thread isn't open.
        const members = await participantIdsForConversation(conversationId);
        for (const m of members) {
          io.to(userRoom(m)).emit('inbox:message', { conversationId, message });
        }
      })
    );

    socket.on('typing', (payload: TypingClient) => {
      const conversationId = String(payload?.conversationId || '');
      if (!conversationId) return;
      socket.to(conversationId).emit('typing', {
        conversationId,
        userId,
        isTyping: Boolean(payload?.isTyping),
      });
    });

    socket.on('message:read', (payload: ReadClient) =>
      safe(async () => {
        const conversationId = String(payload?.conversationId || '');
        if (!conversationId || !(await isParticipant(conversationId, userId))) return;
        await markRead(conversationId, userId);
        io.to(conversationId).emit('message:read', { conversationId, readerId: userId });
      })
    );

    socket.on('disconnect', () =>
      safe(async () => {
        if (!goOffline(userId)) return;
        const ids = await conversationIdsForUser(userId);
        for (const id of ids) io.to(id).emit('presence:update', { userId, online: false });
      })
    );
  });
}
