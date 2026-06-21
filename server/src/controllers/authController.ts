import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { signToken } from '../middleware/auth.js';
import { asyncHandler, httpError } from '../middleware/error.js';
import { toUserDTO } from '../db/mappers.js';

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body ?? {};
  if (!name || !email || !password) {
    throw httpError(400, 'name, email and password are required');
  }
  if (String(password).length < 6) {
    throw httpError(400, 'Password must be at least 6 characters');
  }

  const normalizedEmail = String(email).toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail));
  if (existing.length) throw httpError(409, 'Email already registered');

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(users)
    .values({ name, email: normalizedEmail, passwordHash })
    .returning();

  res.status(201).json({ user: toUserDTO(user), token: signToken(user.id) });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) throw httpError(400, 'email and password are required');

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, String(email).toLowerCase()));
  if (!user) throw httpError(401, 'Invalid credentials');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw httpError(401, 'Invalid credentials');

  res.json({ user: toUserDTO(user), token: signToken(user.id) });
});

export const me = asyncHandler(async (req, res) => {
  if (!req.userId) throw httpError(401, 'Authentication required');
  const [user] = await db.select().from(users).where(eq(users.id, req.userId));
  if (!user) throw httpError(404, 'User not found');
  res.json(toUserDTO(user));
});

export const updateMe = asyncHandler(async (req, res) => {
  if (!req.userId) throw httpError(401, 'Authentication required');
  const { name, neighborhood, lng, lat } = req.body ?? {};

  const set: Partial<typeof users.$inferInsert> = {};
  if (name !== undefined) set.name = name;
  if (neighborhood !== undefined) set.neighborhood = neighborhood;
  if (lng !== undefined && lat !== undefined) {
    set.location = { x: Number(lng), y: Number(lat) };
  }

  const [user] = await db.update(users).set(set).where(eq(users.id, req.userId)).returning();
  if (!user) throw httpError(404, 'User not found');
  res.json(toUserDTO(user));
});
