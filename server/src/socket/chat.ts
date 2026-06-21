import jwt from 'jsonwebtoken';
import type { Server } from 'socket.io';

/**
 * Wire up Socket.io chat. Phase 3 expands message persistence; the auth
 * handshake and room plumbing live here so the contract is stable.
 */
export function registerChat(io: Server): void {
  // Authenticate every socket from the JWT in the handshake.
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

  io.on('connection', (socket) => {
    // Join a conversation room to receive its messages.
    socket.on('join', (conversationId: string) => {
      if (conversationId) socket.join(String(conversationId));
    });

    socket.on('leave', (conversationId: string) => {
      if (conversationId) socket.leave(String(conversationId));
    });

    // message:send is implemented in Phase 3 (persist → emit message:new).
  });
}
