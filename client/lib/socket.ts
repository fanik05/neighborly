import { io, Socket } from 'socket.io-client';
import { getToken } from './api';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

let socket: Socket | null = null;

/**
 * One shared, lazily-created socket for the session. Authenticates with the
 * JWT in the handshake. Used by chat in Phase 3.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      auth: { token: getToken() },
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  s.auth = { token: getToken() };
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  socket?.disconnect();
}
