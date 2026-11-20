import { Router } from 'express';
import * as cart from '../controllers/cart.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { validateObjectId } from '../middlewares/validateObjectId.js';
import { addItemSchema, updateItemSchema } from '../validators/cart.validator.js';

const router = Router();
router.use(authenticate);

router.get('/', cart.getMyCart);
router.post('/items', validate(addItemSchema), cart.addItem);
router.patch('/items/:productId', validateObjectId('productId'), validate(updateItemSchema), cart.updateItem);
router.delete('/items/:productId', validateObjectId('productId'), cart.removeItem);
router.delete('/', cart.clearCart);

export default router;
