import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { items, users } from '../db/schema.js';
import { uploadBuffer, destroyAssets } from '../config/cloudinary.js';
import { asyncHandler, httpError } from '../middleware/error.js';
import { toItemDTO } from '../db/mappers.js';
import type { ItemImage, ListingType } from '@neighborly/shared';

const LISTING_TYPES: ListingType[] = ['sale', 'loan', 'free'];
const ITEM_STATUSES = ['available', 'borrowed', 'sold'] as const;

// Owner columns selected alongside an item, shaped to ItemOwner.
const ownerCols = {
  id: users.id,
  name: users.name,
  avatarUrl: users.avatarUrl,
  neighborhood: users.neighborhood,
};

/**
 * GET /api/items
 * Optional query: lng, lat, radius (meters, default 5000), category, type, q
 * If lng/lat present, results are ordered nearest-first via PostGIS distance.
 */
export const listItems = asyncHandler(async (req, res) => {
  const { lng, lat, radius = 5000, category, type, q } = req.query;
  const conds: SQL[] = [];
  if (category) conds.push(eq(items.category, String(category)));
  if (type) conds.push(eq(items.listingType, String(type) as ListingType));
  if (q) {
    conds.push(
      sql`to_tsvector('english', ${items.title} || ' ' || ${items.description}) @@ plainto_tsquery('english', ${String(q)})`
    );
  }

  const hasGeo = lng !== undefined && lat !== undefined;
  const point = hasGeo
    ? sql`ST_SetSRID(ST_MakePoint(${Number(lng)}, ${Number(lat)}), 4326)::geography`
    : null;
  if (hasGeo && point) {
    conds.push(sql`ST_DWithin(${items.location}::geography, ${point}, ${Number(radius)})`);
  }

  const rows = await db
    .select({ item: items, owner: ownerCols })
    .from(items)
    .innerJoin(users, eq(items.ownerId, users.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(hasGeo && point ? sql`${items.location}::geography <-> ${point}` : desc(items.createdAt))
    .limit(100);

  res.json(rows.map((r) => toItemDTO(r.item, r.owner)));
});

export const getItem = asyncHandler(async (req, res) => {
  const [row] = await db
    .select({ item: items, owner: ownerCols })
    .from(items)
    .innerJoin(users, eq(items.ownerId, users.id))
    .where(eq(items.id, String(req.params.id)));
  if (!row) throw httpError(404, 'Item not found');
  res.json(toItemDTO(row.item, row.owner));
});

/**
 * POST /api/items  (multipart/form-data)
 * Fields: title, description, category, listingType, price, lng, lat
 * Files: images[] (up to 5)
 */
export const createItem = asyncHandler(async (req, res) => {
  if (!req.userId) throw httpError(401, 'Authentication required');
  const { title, description, category, listingType, price, lng, lat, address } = req.body ?? {};
  if (!title || !listingType) throw httpError(400, 'title and listingType are required');
  if (!LISTING_TYPES.includes(listingType)) throw httpError(400, 'invalid listingType');
  if (lng === undefined || lat === undefined) {
    throw httpError(400, 'lng and lat are required to place the item on the map');
  }

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const images: ItemImage[] = [];
  for (const file of files) {
    images.push(await uploadBuffer(file.buffer));
  }

  const [item] = await db
    .insert(items)
    .values({
      ownerId: req.userId,
      title,
      description: description ?? '',
      category: category ?? 'general',
      listingType,
      price: listingType === 'sale' ? Number(price) || 0 : 0,
      images,
      location: { x: Number(lng), y: Number(lat) },
      address: typeof address === 'string' ? address : '',
    })
    .returning();

  const [owner] = await db.select(ownerCols).from(users).where(eq(users.id, req.userId));
  res.status(201).json(toItemDTO(item, owner));
});

export const updateItem = asyncHandler(async (req, res) => {
  const [item] = await db.select().from(items).where(eq(items.id, String(req.params.id)));
  if (!item) throw httpError(404, 'Item not found');
  if (item.ownerId !== req.userId) throw httpError(403, 'Not your item');

  const { title, description, category, listingType, price, status } = req.body ?? {};
  const set: Partial<typeof items.$inferInsert> = {};
  if (title !== undefined) set.title = title;
  if (description !== undefined) set.description = description;
  if (category !== undefined) set.category = category;
  if (listingType !== undefined) {
    if (!LISTING_TYPES.includes(listingType)) throw httpError(400, 'invalid listingType');
    set.listingType = listingType;
  }
  if (price !== undefined) set.price = Number(price);
  if (status !== undefined) {
    if (!ITEM_STATUSES.includes(status)) throw httpError(400, 'invalid status');
    set.status = status;
  }

  const [updated] = await db.update(items).set(set).where(eq(items.id, String(req.params.id))).returning();
  const [owner] = await db.select(ownerCols).from(users).where(eq(users.id, updated.ownerId));
  res.json(toItemDTO(updated, owner));
});

export const deleteItem = asyncHandler(async (req, res) => {
  const [item] = await db.select().from(items).where(eq(items.id, String(req.params.id)));
  if (!item) throw httpError(404, 'Item not found');
  if (item.ownerId !== req.userId) throw httpError(403, 'Not your item');

  await destroyAssets(item.images.map((img) => img.publicId));
  await db.delete(items).where(eq(items.id, String(req.params.id)));
  res.json({ ok: true });
});
