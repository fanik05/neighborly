import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  geometry,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import type { ItemImage } from '@neighborly/shared';

export const listingTypeEnum = pgEnum('listing_type', ['sale', 'loan', 'free']);
export const itemStatusEnum = pgEnum('item_status', ['available', 'borrowed', 'sold']);
export const loanStatusEnum = pgEnum('loan_status', [
  'pending',
  'approved',
  'declined',
  'active',
  'returned',
]);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    email: varchar('email', { length: 200 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    avatarUrl: text('avatar_url').default('').notNull(),
    neighborhood: varchar('neighborhood', { length: 160 }).default('').notNull(),
    // PostGIS point, [lng, lat] in SRID 4326. mode 'xy' surfaces { x: lng, y: lat }.
    location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('users_location_idx').using('gist', t.location)]
);

export const items = pgTable(
  'items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').default('').notNull(),
    category: varchar('category', { length: 80 }).default('general').notNull(),
    listingType: listingTypeEnum('listing_type').notNull(),
    price: integer('price').default(0).notNull(),
    images: jsonb('images').$type<ItemImage[]>().default([]).notNull(),
    location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }).notNull(),
    address: text('address').default('').notNull(), // human-readable place (reverse-geocoded)
    status: itemStatusEnum('status').default('available').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('items_location_idx').using('gist', t.location),
    index('items_owner_idx').on(t.ownerId),
  ]
);

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id').references(() => items.id, { onDelete: 'set null' }),
  lastMessage: text('last_message').default('').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })]
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    read: boolean('read').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId)]
);

export const loanRequests = pgTable('loan_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id')
    .notNull()
    .references(() => items.id, { onDelete: 'cascade' }),
  borrowerId: uuid('borrower_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  lenderId: uuid('lender_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: loanStatusEnum('status').default('pending').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }),
  dueDate: timestamp('due_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
