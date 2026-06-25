import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';

import { pingDb } from './db/index.js';
import { notFound, errorHandler } from './middleware/error.js';
import authRoutes from './routes/authRoutes.js';
import itemRoutes from './routes/itemRoutes.js';
import conversationRoutes from './routes/conversationRoutes.js';
import { registerChat } from './socket/chat.js';

const app = express();
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'neighborly-server' });
});
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/conversations', conversationRoutes);

app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
const io = new SocketServer(server, { cors: { origin: CLIENT_ORIGIN } });
registerChat(io);
app.set('io', io); // controllers can emit via req.app.get('io')

const PORT = process.env.PORT || 5000;

pingDb()
  .then(() => {
    server.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));
  })
  .catch((err: unknown) => {
    console.error('Failed to start:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
