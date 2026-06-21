import { Router } from 'express';
import {
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
} from '../controllers/itemController.js';
import { auth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = Router();

router.get('/', listItems);
router.get('/:id', getItem);
router.post('/', auth, upload.array('images', 5), createItem);
router.put('/:id', auth, updateItem);
router.delete('/:id', auth, deleteItem);

export default router;
