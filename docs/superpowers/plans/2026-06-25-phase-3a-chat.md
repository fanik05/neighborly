# Phase 3a — Real-time Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1:1 real-time messaging between an item's owner and an interested neighbor — with unread badges, typing indicators, read receipts, and online presence — in the Lending Desk UI.

**Architecture:** Conversations are keyed by `(item, owner, otherUser)`. History/list come over REST; message sends and all live signals go over the existing authed Socket.io connection. The server persists every message before emitting. A shared service holds find-or-create + query logic reused by REST and the socket. The client uses two hooks: `useConversations` (inbox + total unread, connects the socket) and `useChat` (one thread: history, send, typing, presence, receipts).

**Tech Stack:** Express 5 + Socket.io + Drizzle/PostGIS (server), Next.js 16 + React 19 + socket.io-client (client), TypeScript, npm workspaces. No test framework (Vitest breaks the Turbopack build).

## Global Constraints

- Socket auth is already done via the JWT handshake; use `socket.data.userId`, NEVER a client-supplied id. **Persist every message to Postgres before emitting.**
- All REST routes under `auth`; every conversation handler verifies the caller is a participant before reading/mutating.
- Never return `password_hash`; map rows through `db/mappers.ts` / select only owner columns.
- Coordinates stay out of chat; this phase touches no geo.
- Server is ESM + NodeNext: relative imports use the `.js` extension even from `.ts`.
- Shared API + socket payload types live ONCE in `@neighborly/shared`, imported with `import type` on both sides. Keep that package types-only (no runtime values).
- Tailwind v4 CSS-first: reuse Lending Desk tokens/classes (`btn-primary`, `field`, `rounded-tag`, `text-pine`, `text-muted`, `bg-card`, `bg-paper`, `border-line`, mono via `font-mono`). Never use `bg-white` (use `bg-card`).
- Message text: non-empty after trim, ≤ 2000 chars. Reject otherwise (socket ignores; REST returns 400 where applicable).
- Each commit must leave `npm run typecheck` (whole repo) clean.

---

### Task 1: Shared contract — conversation DTO + socket payload types

**Files:**
- Modify: `shared/src/index.ts` (replace `ConversationDTO`; add socket payload interfaces)
- Modify: `client/lib/types.ts` (re-export the new types under client names)

**Interfaces:**
- Consumes: existing `ItemOwner`, `MessageDTO`.
- Produces: the new `ConversationDTO`, `ConversationItemRef`, and socket payload types used by every later task.

- [ ] **Step 1: Replace `ConversationDTO` and add socket types in `shared/src/index.ts`**

Find the existing `ConversationDTO` interface and replace it with:
```ts
/** Compact item reference shown on a conversation row. */
export interface ConversationItemRef {
  id: string;
  title: string;
  cover?: string;
}

export interface ConversationDTO {
  id: string;
  /** The other participant (never the caller). */
  otherParticipant: ItemOwner;
  /** The listing this thread is about; absent if the item was deleted. */
  item?: ConversationItemRef;
  lastMessage: string;
  /** Messages addressed to the caller that they haven't read yet. */
  unreadCount: number;
  updatedAt: string;
}

/* ---- Socket.io payloads (shared by client and server) ---- */
/** client → server */
export interface MessageSend {
  conversationId: string;
  text: string;
}
export interface TypingClient {
  conversationId: string;
  isTyping: boolean;
}
export interface ReadClient {
  conversationId: string;
}
/** server → client */
export interface MessageNew {
  message: MessageDTO;
}
export interface InboxMessageEvent {
  conversationId: string;
  message: MessageDTO;
}
export interface TypingEvent {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}
export interface ReadEvent {
  conversationId: string;
  readerId: string;
}
export interface PresenceEvent {
  userId: string;
  online: boolean;
}
```

- [ ] **Step 2: Re-export under client names in `client/lib/types.ts`**

Append:
```ts
export type {
  MessageDTO as Message,
  ConversationDTO as Conversation,
  ConversationItemRef,
  MessageSend,
  TypingClient,
  ReadClient,
  MessageNew,
  InboxMessageEvent,
  TypingEvent,
  ReadEvent,
  PresenceEvent,
} from '@neighborly/shared';
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no consumers of the old `ConversationDTO.participants` shape exist yet).

- [ ] **Step 4: Commit**

```bash
git add shared/src/index.ts client/lib/types.ts
git commit -m "feat(shared): conversation DTO + socket payload types for chat"
```

---

### Task 2: Server data layer — mappers + conversation service

**Files:**
- Modify: `server/src/db/mappers.ts` (add `toMessageDTO`; keep existing exports)
- Create: `server/src/services/conversationService.ts`

**Interfaces:**
- Consumes: `db`, schema tables `conversations`, `conversationParticipants`, `messages`, `items`, `users`; `MessageDTO`, `ConversationDTO`, `ItemOwner`, `ConversationItemRef` from `@neighborly/shared`.
- Produces:
  - `toMessageDTO(row): MessageDTO`
  - `isValidMessageText(text: unknown): text is string`
  - `findOrCreateConversation(itemId, userId): Promise<{ id: string }>` (throws `httpError` 404/400)
  - `isParticipant(conversationId, userId): Promise<boolean>`
  - `listConversations(userId): Promise<ConversationDTO[]>`
  - `getMessages(conversationId): Promise<MessageDTO[]>`
  - `persistMessage(conversationId, senderId, text): Promise<MessageDTO>`
  - `markRead(conversationId, userId): Promise<void>`
  - `conversationIdsForUser(userId): Promise<string[]>`

- [ ] **Step 1: Add `toMessageDTO` to `server/src/db/mappers.ts`**

Add the import for `MessageDTO` to the existing top import and `messages` to the schema import, then append:
```ts
export function toMessageDTO(m: typeof messages.$inferSelect): MessageDTO {
  return {
    id: m.id,
    conversation: m.conversationId,
    sender: m.senderId,
    text: m.text,
    read: m.read,
    createdAt: m.createdAt.toISOString(),
  };
}
```
(Update line 1 to `import type { UserDTO, ItemDTO, ItemOwner, GeoPoint, MessageDTO } from '@neighborly/shared';` and line 2 to `import type { users, items, messages } from './schema.js';`.)

- [ ] **Step 2: Create `server/src/services/conversationService.ts`**

```ts
import { and, desc, eq, ne, inArray, count, asc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db/index.js';
import { conversations, conversationParticipants, messages, items, users } from '../db/schema.js';
import { toMessageDTO } from '../db/mappers.js';
import { httpError } from '../middleware/error.js';
import type { ConversationDTO, ConversationItemRef, ItemOwner, MessageDTO } from '@neighborly/shared';

const MAX_MESSAGE_LEN = 2000;

/** A message body is valid when it is a non-empty (trimmed) string within the length cap. */
export function isValidMessageText(text: unknown): text is string {
  return typeof text === 'string' && text.trim().length > 0 && text.length <= MAX_MESSAGE_LEN;
}

/** Is this user one of the conversation's participants? */
export async function isParticipant(conversationId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      )
    )
    .limit(1);
  return Boolean(row);
}

/** The ids of every conversation a user participates in. */
export async function conversationIdsForUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.userId, userId));
  return rows.map((r) => r.id);
}

/**
 * Find the existing conversation for this item between the caller and the item's
 * owner, or create it. Throws 404 if the item is gone, 400 if you own the item.
 */
export async function findOrCreateConversation(
  itemId: string,
  userId: string
): Promise<{ id: string }> {
  const [item] = await db
    .select({ id: items.id, ownerId: items.ownerId })
    .from(items)
    .where(eq(items.id, itemId));
  if (!item) throw httpError(404, 'Item not found');
  if (item.ownerId === userId) throw httpError(400, 'You cannot message yourself about your own item');

  const cpMe = alias(conversationParticipants, 'cp_me');
  const cpOwner = alias(conversationParticipants, 'cp_owner');
  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .innerJoin(cpMe, and(eq(cpMe.conversationId, conversations.id), eq(cpMe.userId, userId)))
    .innerJoin(
      cpOwner,
      and(eq(cpOwner.conversationId, conversations.id), eq(cpOwner.userId, item.ownerId))
    )
    .where(eq(conversations.itemId, itemId))
    .limit(1);
  if (existing) return existing;

  return db.transaction(async (tx) => {
    const [conv] = await tx.insert(conversations).values({ itemId }).returning({ id: conversations.id });
    await tx.insert(conversationParticipants).values([
      { conversationId: conv.id, userId },
      { conversationId: conv.id, userId: item.ownerId },
    ]);
    return conv;
  });
}

const ownerCols = {
  id: users.id,
  name: users.name,
  avatarUrl: users.avatarUrl,
  neighborhood: users.neighborhood,
};

/** The caller's conversations, newest activity first, with other participant, item, unread count. */
export async function listConversations(userId: string): Promise<ConversationDTO[]> {
  const myCp = alias(conversationParticipants, 'my_cp');
  const otherCp = alias(conversationParticipants, 'other_cp');

  const rows = await db
    .select({
      id: conversations.id,
      lastMessage: conversations.lastMessage,
      updatedAt: conversations.updatedAt,
      other: ownerCols,
      itemId: items.id,
      itemTitle: items.title,
      itemImages: items.images,
    })
    .from(conversations)
    .innerJoin(myCp, and(eq(myCp.conversationId, conversations.id), eq(myCp.userId, userId)))
    .innerJoin(
      otherCp,
      and(eq(otherCp.conversationId, conversations.id), ne(otherCp.userId, userId))
    )
    .innerJoin(users, eq(users.id, otherCp.userId))
    .leftJoin(items, eq(items.id, conversations.itemId))
    .orderBy(desc(conversations.updatedAt));

  const ids = rows.map((r) => r.id);
  const unreadByConv = new Map<string, number>();
  if (ids.length) {
    const counts = await db
      .select({ cid: messages.conversationId, n: count() })
      .from(messages)
      .where(
        and(inArray(messages.conversationId, ids), ne(messages.senderId, userId), eq(messages.read, false))
      )
      .groupBy(messages.conversationId);
    for (const c of counts) unreadByConv.set(c.cid, Number(c.n));
  }

  return rows.map((r) => {
    const other: ItemOwner = {
      id: r.other.id,
      name: r.other.name,
      avatarUrl: r.other.avatarUrl,
      neighborhood: r.other.neighborhood,
    };
    const item: ConversationItemRef | undefined = r.itemId
      ? { id: r.itemId, title: r.itemTitle as string, cover: (r.itemImages as { url: string }[])?.[0]?.url }
      : undefined;
    return {
      id: r.id,
      otherParticipant: other,
      item,
      lastMessage: r.lastMessage,
      unreadCount: unreadByConv.get(r.id) ?? 0,
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

/** Full message history for a conversation, oldest first. */
export async function getMessages(conversationId: string): Promise<MessageDTO[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
  return rows.map(toMessageDTO);
}

/** Persist a message, bump the conversation's last message, and return the DTO. */
export async function persistMessage(
  conversationId: string,
  senderId: string,
  text: string
): Promise<MessageDTO> {
  const [row] = await db
    .insert(messages)
    .values({ conversationId, senderId, text: text.trim() })
    .returning();
  await db.update(conversations).set({ lastMessage: text.trim() }).where(eq(conversations.id, conversationId));
  return toMessageDTO(row);
}

/** Mark every message NOT sent by this user in the conversation as read. */
export async function markRead(conversationId: string, userId: string): Promise<void> {
  await db
    .update(messages)
    .set({ read: true })
    .where(
      and(
        eq(messages.conversationId, conversationId),
        ne(messages.senderId, userId),
        eq(messages.read, false)
      )
    );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w server`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/db/mappers.ts server/src/services/conversationService.ts
git commit -m "feat(server): conversation service (find-or-create, list, messages, read)"
```

---

### Task 3: Conversation REST controller + routes

**Files:**
- Create: `server/src/controllers/conversationController.ts`
- Create: `server/src/routes/conversationRoutes.ts`
- Modify: `server/src/index.ts` (mount the routes)

**Interfaces:**
- Consumes: the conversation service from Task 2; `auth`, `asyncHandler`, `httpError`.
- Produces: `POST /api/conversations`, `GET /api/conversations`, `GET /api/conversations/:id/messages`.

- [ ] **Step 1: Create `server/src/controllers/conversationController.ts`**

```ts
import { asyncHandler, httpError } from '../middleware/error.js';
import {
  findOrCreateConversation,
  listConversations,
  getMessages,
  isParticipant,
  markRead,
} from '../services/conversationService.js';

/** POST /api/conversations { itemId } — find or create the thread for this item. */
export const createConversation = asyncHandler(async (req, res) => {
  if (!req.userId) throw httpError(401, 'Authentication required');
  const itemId = (req.body ?? {}).itemId;
  if (!itemId || typeof itemId !== 'string') throw httpError(400, 'itemId is required');
  const conv = await findOrCreateConversation(itemId, req.userId);
  const [dto] = (await listConversations(req.userId)).filter((c) => c.id === conv.id);
  res.status(201).json(dto);
});

/** GET /api/conversations — the caller's conversations. */
export const getConversations = asyncHandler(async (req, res) => {
  if (!req.userId) throw httpError(401, 'Authentication required');
  res.json(await listConversations(req.userId));
});

/** GET /api/conversations/:id/messages — history; marks the caller's unread as read. */
export const getConversationMessages = asyncHandler(async (req, res) => {
  if (!req.userId) throw httpError(401, 'Authentication required');
  const conversationId = String(req.params.id);
  if (!(await isParticipant(conversationId, req.userId))) throw httpError(403, 'Not your conversation');
  const history = await getMessages(conversationId);
  await markRead(conversationId, req.userId);
  res.json(history);
});
```

- [ ] **Step 2: Create `server/src/routes/conversationRoutes.ts`**

```ts
import { Router } from 'express';
import {
  createConversation,
  getConversations,
  getConversationMessages,
} from '../controllers/conversationController.js';
import { auth } from '../middleware/auth.js';

const router = Router();

router.post('/', auth, createConversation);
router.get('/', auth, getConversations);
router.get('/:id/messages', auth, getConversationMessages);

export default router;
```

- [ ] **Step 3: Mount in `server/src/index.ts`**

Add the import after the `itemRoutes` import:
```ts
import conversationRoutes from './routes/conversationRoutes.js';
```
Add the mount after `app.use('/api/items', itemRoutes);`:
```ts
app.use('/api/conversations', conversationRoutes);
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck -w server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/conversationController.ts server/src/routes/conversationRoutes.ts server/src/index.ts
git commit -m "feat(server): conversation REST routes (create, list, messages)"
```

---

### Task 4: Socket protocol — messages, typing, read receipts, presence

**Files:**
- Create: `server/src/socket/presence.ts`
- Modify: `server/src/socket/chat.ts` (implement the full protocol)

**Interfaces:**
- Consumes: the conversation service (Task 2); shared payload types `MessageSend`, `TypingClient`, `ReadClient`.
- Produces: server emits `message:new`, `inbox:message`, `typing`, `message:read`, `presence:update`.

- [ ] **Step 1: Create `server/src/socket/presence.ts`**

```ts
/** Ref-counted online tracking (a user may have several tabs/sockets). */
const counts = new Map<string, number>();

/** Mark a connection online. Returns true on the 0→1 transition (became online). */
export function goOnline(userId: string): boolean {
  const next = (counts.get(userId) ?? 0) + 1;
  counts.set(userId, next);
  return next === 1;
}

/** Mark a connection offline. Returns true on the 1→0 transition (went offline). */
export function goOffline(userId: string): boolean {
  const next = (counts.get(userId) ?? 1) - 1;
  if (next <= 0) {
    counts.delete(userId);
    return true;
  }
  counts.set(userId, next);
  return false;
}

export function isOnline(userId: string): boolean {
  return (counts.get(userId) ?? 0) > 0;
}
```

- [ ] **Step 2: Add `participantIdsForConversation` to the service**

In `server/src/services/conversationService.ts`, append:
```ts
export async function participantIdsForConversation(conversationId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId));
  return rows.map((r) => r.userId);
}
```

- [ ] **Step 3: Replace `server/src/socket/chat.ts` with the full protocol**

Replace the entire file contents with:
```ts
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
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck -w server`
Expected: PASS — all imports resolved, no unused vars.

- [ ] **Step 5: Commit**

```bash
git add server/src/socket/presence.ts server/src/socket/chat.ts server/src/services/conversationService.ts
git commit -m "feat(server): socket chat protocol — messages, typing, receipts, presence"
```

---

### Task 5: Client hooks — `useConversations` (inbox + unread) and `useChat` (thread)

**Files:**
- Create: `client/lib/useConversations.ts`
- Create: `client/lib/useChat.ts`

**Interfaces:**
- Consumes: `api` from `@/lib/api`; `connectSocket`, `getSocket` from `@/lib/socket`; `useAuth`; shared types via `@/lib/types`.
- Produces:
  - `useConversations(): { conversations: Conversation[]; totalUnread: number; reload: () => void }`
  - `useChat(conversationId): { messages: Message[]; send: (text: string) => void; setTyping: (t: boolean) => void; peerTyping: boolean; peerOnline: boolean; lastReadByPeer: boolean }`

- [ ] **Step 1: Create `client/lib/useConversations.ts`**

```ts
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
```

- [ ] **Step 2: Create `client/lib/useChat.ts`**

```ts
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
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w client`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/lib/useConversations.ts client/lib/useChat.ts
git commit -m "feat(client): useConversations + useChat hooks"
```

---

### Task 6: Client chat components

**Files:**
- Create: `client/components/ConversationList.tsx`
- Create: `client/components/MessageThread.tsx`
- Create: `client/components/MessageComposer.tsx`

**Interfaces:**
- Consumes: shared types; the hooks' return shapes from Task 5.
- Produces: presentational components used by the pages in Task 7.

- [ ] **Step 1: Create `client/components/ConversationList.tsx`**

```tsx
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
```

- [ ] **Step 2: Create `client/components/MessageComposer.tsx`**

```tsx
'use client';

import { useState } from 'react';

export default function MessageComposer({
  onSend,
  onTyping,
}: {
  onSend: (text: string) => void;
  onTyping: (isTyping: boolean) => void;
}) {
  const [text, setText] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText('');
    onTyping(false);
  }

  return (
    <form onSubmit={submit} className="flex gap-2 border-t border-line p-3">
      <input
        className="field"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onTyping(e.target.value.length > 0);
        }}
        placeholder="Write a message…"
        aria-label="Message"
        maxLength={2000}
      />
      <button type="submit" className="btn-primary shrink-0" disabled={!text.trim()}>
        Send
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Create `client/components/MessageThread.tsx`**

```tsx
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
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck -w client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/components/ConversationList.tsx client/components/MessageComposer.tsx client/components/MessageThread.tsx
git commit -m "feat(client): chat components (list, thread, composer)"
```

---

### Task 7: Messages pages (inbox + thread)

**Files:**
- Create: `client/app/messages/page.tsx`
- Create: `client/app/messages/[id]/page.tsx`

**Interfaces:**
- Consumes: `useConversations`, `useChat`, the three components, `useAuth`.
- Produces: `/messages` (inbox) and `/messages/[id]` (thread) routes.

- [ ] **Step 1: Create `client/app/messages/page.tsx`**

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useConversations } from '@/lib/useConversations';
import ConversationList from '@/components/ConversationList';

export default function MessagesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { conversations } = useConversations();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) return <p className="py-16 text-center text-muted">Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-3xl font-bold">Messages</h1>
      <div className="overflow-hidden rounded-tag border border-line bg-card">
        <ConversationList conversations={conversations} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `client/app/messages/[id]/page.tsx`**

```tsx
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
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck -w client && npm run build -w client`
Expected: PASS, and the build compiles (no Turbopack errors). If a stale `.next` error about a missing module appears, run `rm -rf client/.next` and rebuild.

- [ ] **Step 4: Commit**

```bash
git add client/app/messages/page.tsx "client/app/messages/[id]/page.tsx"
git commit -m "feat(client): messages inbox + thread pages"
```

---

### Task 8: Item "Message owner" wiring + Navbar unread badge

**Files:**
- Modify: `client/app/items/[id]/page.tsx` (make the Message button create the conversation + navigate)
- Modify: `client/components/Navbar.tsx` (add Messages link + unread badge)

**Interfaces:**
- Consumes: `api`; `useConversations` (Navbar); shared `Conversation` type.
- Produces: working entry point + live navbar badge.

- [ ] **Step 1: Wire the Message button in `client/app/items/[id]/page.tsx`**

Add to the imports at the top (the file already imports `api`, `useAuth`, `useRouter`):
```ts
import type { Conversation } from '@/lib/types';
```
Add a handler inside the component (near `onDelete`):
```ts
  async function messageOwner() {
    try {
      const conv = await api<Conversation>('/conversations', {
        method: 'POST',
        body: JSON.stringify({ itemId: id }),
      });
      router.push(`/messages/${conv.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start conversation');
    }
  }
```
Replace the disabled placeholder button (the `user ?` branch currently rendering the disabled "Message …" button) with:
```tsx
          ) : user ? (
            <button onClick={messageOwner} className="btn-primary">
              Message {item.owner?.name?.split(' ')[0]}
            </button>
          ) : (
```

- [ ] **Step 2: Add Messages link + unread badge to `client/components/Navbar.tsx`**

Add the import:
```ts
import { useConversations } from '@/lib/useConversations';
```
Inside the component, after `const { user, logout, loading } = useAuth();`:
```ts
  const { totalUnread } = useConversations();
```
In the authenticated branch (`user ? ( ... )`), add a Messages link before the "+ List an item" link:
```tsx
              <Link href="/messages" className="relative px-3 py-2 text-sm font-medium text-muted hover:text-ink">
                Messages
                {totalUnread > 0 && (
                  <span className="absolute -right-1 -top-0.5 rounded-full bg-marigold px-1.5 font-mono text-[0.6rem] font-semibold text-onaccent">
                    {totalUnread}
                  </span>
                )}
              </Link>
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck -w client && npm run build -w client`
Expected: PASS / compiles.

- [ ] **Step 4: Commit**

```bash
git add "client/app/items/[id]/page.tsx" client/components/Navbar.tsx
git commit -m "feat(client): message-owner entry point + navbar unread badge"
```

---

### Task 9: Full verification (typecheck + build + manual e2e)

**Files:** none.

- [ ] **Step 1: Whole-repo typecheck**

Run: `npm run typecheck`
Expected: PASS (server + client).

- [ ] **Step 2: Client production build**

Run: `npm run build -w client`
Expected: "✓ Compiled successfully" — no Module-not-found.

- [ ] **Step 3: Server build**

Run: `npm run build -w server`
Expected: exit 0.

- [ ] **Step 4: Start Postgres + both servers**

```bash
docker start neighborly-pg 2>/dev/null || docker run -d --name neighborly-pg -p 5432:5432 -e POSTGRES_USER=neighborly -e POSTGRES_PASSWORD=neighborly -e POSTGRES_DB=neighborly postgis/postgis:16-3.4
PORT=5001 npm run dev:server
npm run dev:client
```
(Match `client/.env.local` `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_SOCKET_URL` to the chosen port.)

- [ ] **Step 5: Manual e2e (two accounts / two browsers, CLAUDE.md definition of done)**

  - As neighbor B, open neighbor A's item → "Message {A}" → lands in `/messages/[id]`.
  - Send a message; as A (second browser) open `/messages` → unread badge in navbar + row unread count; open the thread → message appears in real time, badge clears.
  - Both directions deliver live; verify the **typing** indicator, the peer **online dot** (and that it goes grey when the peer closes the tab), the **"Seen"** receipt after the peer reads, and the inbox **reordering** to newest-first.
  - Reopen the item as A (the owner) → no Message button (own listing).
  - Delete the item → existing thread still loads; item ref shows "(listing removed)".

- [ ] **Step 6: Final commit (only if fixups were needed)**

```bash
git add -A
git commit -m "chore: verify Phase 3a chat end-to-end"
```

---

## Self-Review notes

- **Spec coverage:** model + entry point (Tasks 2,8), inbox + thread surfaces (Tasks 6,7), navbar badge (Task 8), socket protocol incl. presence/typing/receipts/inbox fan-out (Task 4), REST list/create/history (Task 3), shared contract additions (Task 1), error handling (validation in service + membership checks throughout), testing posture (Task 9, no Vitest). All spec sections mapped.
- **Type consistency:** `Conversation`/`Message` re-exports (Task 1) used by hooks (Task 5), components (Task 6), pages (Task 7), entry point (Task 8); hook return shapes in Task 5 match their consumers; socket event names/payloads identical across server (Task 4) and client (Tasks 5). `participantIdsForConversation` is defined in Task 4 Step 3 and used in Step 4.
- **Each task ends green:** every task closes with a passing typecheck (and a build for UI/page tasks).
- **Refinement vs spec:** the spec said `message:new` fans out to rooms + user rooms; the plan splits that into `message:new` (conversation room → thread) + `inbox:message` (each participant's `user:<id>` room → inbox/badge), avoiding double-delivery to a socket that is in both. Same behavior, cleaner.
- **Placeholder scan:** none — every code step contains complete code.
