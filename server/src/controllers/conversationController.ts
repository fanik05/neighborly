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
