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
  const body = text.trim();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(messages)
      .values({ conversationId, senderId, text: body })
      .returning();
    await tx
      .update(conversations)
      .set({ lastMessage: body })
      .where(eq(conversations.id, conversationId));
    return toMessageDTO(row);
  });
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

export async function participantIdsForConversation(conversationId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId));
  return rows.map((r) => r.userId);
}
