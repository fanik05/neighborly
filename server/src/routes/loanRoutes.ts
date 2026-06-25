import { Router } from 'express';
import { createLoan, getLoans, actOnLoan } from '../controllers/loanController.js';
import { auth } from '../middleware/auth.js';

const router = Router();

router.post('/', auth, createLoan);
router.get('/', auth, getLoans);
router.patch('/:id', auth, actOnLoan);

export default router;
