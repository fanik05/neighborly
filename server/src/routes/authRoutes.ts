import { Router } from 'express';
import { register, login, me, updateMe } from '../controllers/authController.js';
import { auth } from '../middleware/auth.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', auth, me);
router.patch('/me', auth, updateMe);

export default router;
