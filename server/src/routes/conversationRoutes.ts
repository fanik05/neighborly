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
