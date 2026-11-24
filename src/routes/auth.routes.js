import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as auth from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import {
  registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema,
} from '../validators/auth.validator.js';

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: '嘗試次數過多，請 15 分鐘後再試' },
});

router.post('/register', authLimiter, validate(registerSchema), auth.register);
router.post('/login', authLimiter, validate(loginSchema), auth.login);
router.get('/me', authenticate, auth.me);

// 忘記密碼另外限制得更嚴，避免被拿來大量寄信
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: '申請次數過多，請 15 分鐘後再試' },
});
router.post('/forgot-password', forgotLimiter, validate(forgotPasswordSchema), auth.forgotPassword);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), auth.resetPassword);
router.patch('/password', authLimiter, authenticate, validate(changePasswordSchema), auth.changePassword);

export default router;
