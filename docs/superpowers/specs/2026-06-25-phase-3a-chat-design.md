# Phase 3a — Real-time Chat

**Date:** 2026-06-25
**Status:** Approved design, ready for implementation plan
**Context:** Phase 3 in the README is "Socket.io chat + loan request workflow." We decompose it:
this spec covers **chat** only; the **loan request workflow** is a separate later cycle (3b).
Scaffolding already exists: an authed Socket.io handshake (`socket.data.userId`) with `join`/`leave`
rooms ([server/src/socket/chat.ts]), `app.set('io')` for controller emits, a shared authenticated
client socket singleton ([client/lib/socket.ts]), the `conversations` /
`conversation_participants` / `messages` tables, and `MessageDTO` / `ConversationDTO` in
`@neighborly/shared`.

## Goal

Real-time 1:1 messaging between an item's owner and an interested neighbor, with unread badges,
typing indicators, read receipts, and online presence — in the established "Lending Desk" UI.

Non-goals: group chat, attachments/images in messages, message editing/deletion, push
notifications, search. The loan workflow is out of scope (3b).

## Model & entry point

- A **conversation = (item, owner, interestedNeighbor)**, deduped by `(itemId, {ownerId, otherUserId})`.
  Uses the existing `conversations.itemId` (FK, `onDelete: set null`) + `conversation_participants`
  (composite PK). Exactly two participants per conversation in this phase.
- **Entry point:** the item detail page shows a **"Message owner"** button (hidden when the viewer
  is the owner or is logged out → prompt to sign in). It calls `POST /api/conversations { itemId }`,
  which find-or-creates the conversation between the viewer and the owner for that item, then the
  client navigates to `/messages/[id]`.
- **Self-message guard:** the server rejects creating a conversation where owner === viewer (400).

## Surfaces (client)

- **`/messages`** — inbox. Conversation rows (Lending-Desk checkout-card style): other neighbor's
  name/avatar, item title + thumbnail, last message preview, mono timestamp, and an **unread count**
  badge. Ordered by `updatedAt` desc. Desktop = two-pane (list left, open thread right); mobile =
  list, tapping a row routes to the thread.
- **`/messages/[id]`** — thread. Header with the other neighbor + **online dot** + item context;
  scrollable message history (mine right / theirs left, mono timestamps); a composer; a **typing
  indicator** ("<name> is typing…"); and a **"Seen"** receipt under the last message I sent once read.
- **Navbar** — a "Messages" link carrying a **total unread badge** (sum of per-conversation unread).
- Auth-gated: `/messages*` redirects to `/login` when logged out (same pattern as `/sell`).

## Socket protocol

Extends `registerChat(io)`. Auth handshake already sets `socket.data.userId`; never trust
client-supplied ids.

**Client → server**
- `message:send { conversationId, text }`
- `typing { conversationId, isTyping }`
- `message:read { conversationId }`
- (existing) `join(conversationId)` / `leave(conversationId)`

**Server → client**
- `message:new { message: MessageDTO }`
- `typing { conversationId, userId, isTyping }`
- `message:read { conversationId, readerId }`
- `presence:update { userId, online }`

**Behaviors**
- On **connect**: increment a refcounted online map (`Map<userId, number>`); query the user's
  conversation ids and emit `presence:update {userId, online:true}` to each conversation room; the
  socket also joins its personal room `user:<userId>`.
- On **disconnect**: decrement; when the count hits 0, emit `presence:update {online:false}` to the
  user's conversation rooms.
- On **`join`**: verify membership (DB), join the room, and emit the peer's current presence to the
  joining socket.
- **`message:send`**: verify the sender is a participant → **persist the message to Postgres
  before emitting** → update `conversation.lastMessage` + `updatedAt` → emit `message:new` to the
  conversation room AND to each participant's `user:<id>` room (so a recipient who only has the inbox
  open still gets live last-message/unread updates). Validate text is a non-empty string ≤ 2000
  chars; ignore otherwise.
- **`typing`**: relay `typing {conversationId, userId, isTyping}` to the room except the sender.
- **`message:read`**: mark all messages in the conversation where `senderId ≠ me` and `read=false`
  as `read=true`, then emit `message:read {conversationId, readerId:me}` to the room (sender shows
  "Seen").
- Socket handlers are wrapped so a thrown error never crashes the server; on failure emit nothing.

## REST API

All under `auth`; every handler checks the caller is a participant of the target conversation.
Success returns the resource/array directly; errors `{ error }` via the central middleware.

- `POST /api/conversations { itemId }` → find-or-create; returns `ConversationDTO`. 400 if owner ===
  caller; 404 if item missing.
- `GET /api/conversations` → caller's conversations as `ConversationDTO[]` (other participant, item
  ref, last message, `unreadCount`), `updatedAt` desc.
- `GET /api/conversations/:id/messages` → `MessageDTO[]` ascending; marks the caller's unread
  messages read as a side effect (and the socket layer emits the receipt when the thread is open).
  403 if not a participant, 404 if unknown.

Messages are **sent over the socket** (real-time first); REST is only history + list. Persistence
still precedes any emit.

## Shared contract additions (`@neighborly/shared`)

Keep the package types-only. Extend/added:
- `ConversationDTO`: add `unreadCount: number`, `otherParticipant: ItemOwner`, and an item ref
  `item?: { id: string; title: string; cover?: string }` (replacing the bare `item?: string`).
- `MessageDTO`: unchanged shape (`id, conversation, sender, text, read, createdAt`).
- Socket payload types shared by both sides: `MessageSend`, `TypingEvent`, `ReadEvent`,
  `PresenceEvent` (and `MessageNew`).

## Server structure

- `controllers/conversationController.ts` — `createConversation`, `listConversations`,
  `getMessages` (thin handlers; membership checks; map via `db/mappers.ts`).
- `routes/conversationRoutes.ts` — wires the three routes under `auth`; mounted at
  `/api/conversations` in `index.ts`.
- `db/mappers.ts` — add `toMessageDTO`, `toConversationDTO`.
- `socket/chat.ts` — implement the protocol above; extract a small `presence` helper + a
  `conversationsForUser(userId)` query; keep message persistence in one place reused by the socket.
- `services/` — a `conversationService` for `findOrCreateConversation(itemId, userId)` and the
  unread-count query, so REST and socket share the logic.

## Client structure

- `lib/types.ts` — re-export the new shared types for client use.
- `lib/useConversations.ts` — fetch + hold the inbox list and total unread; subscribe to
  `message:new`/`message:read` to update live.
- `lib/useChat.ts` (or `useThread`) — for a single conversation: load history, join/leave the room,
  send messages, and expose typing/presence/receipt state from socket events.
- `components/MessageThread.tsx`, `components/MessageComposer.tsx`,
  `components/ConversationList.tsx` — focused presentational pieces.
- `app/messages/page.tsx` + `app/messages/[id]/page.tsx` — compose the above.
- `components/Navbar.tsx` — add the Messages link + unread badge (driven by `useConversations`).

## Error handling & edge cases

- Non-member access to a conversation → 403; unknown conversation/item → 404.
- Empty/whitespace or >2000-char message → rejected (socket ignores; REST n/a).
- Messaging your own item → 400 at conversation creation.
- Socket disconnects mid-session → client auto-reconnects (socket.io default) and re-joins the open
  thread; presence re-emitted on reconnect.
- Sending while briefly disconnected → message queued by socket.io or surfaced as a send failure;
  no optimistic duplicate on reconnect (server is the source of truth; UI renders on `message:new`).
- Item deleted while a conversation exists → `itemId` becomes null; thread still works, item ref
  shown as "(listing removed)".

## Testing strategy

- **No Vitest** (breaks the Next 16 Turbopack build). If a server-side runner is wanted, use
  `node:test` via `tsx`; otherwise typecheck + manual e2e.
- **Pure units** worth covering: `findOrCreateConversation` dedupe (same pair+item returns the same
  conversation; different item → new), unread-count derivation, and message-text validation.
- **Manual e2e** (CLAUDE.md definition of done): two browsers / two accounts — message owner from an
  item, send both ways in real time, see typing + online dot + "Seen" + unread badge update, and the
  inbox reorder. Verify `npm run build -w client` compiles and whole-repo `npm run typecheck` passes.

## Conventions honored (CLAUDE.md)

- Socket auth via JWT handshake; use `socket.data.userId`, never a client id. Persist every message
  before emitting.
- All write/owned routes through `auth`; check participant membership before reads/mutations.
- Never return `password_hash`; map rows through `db/mappers.ts`.
- Server ESM + NodeNext: relative imports use `.js`. Shared API types live once in
  `@neighborly/shared`, imported with `import type`.
- Tailwind v4 CSS-first; reuse the Lending Desk tokens/classes; no `bg-white` (use `bg-card`).
