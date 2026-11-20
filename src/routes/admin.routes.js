import { Router } from 'express';
import * as products from '../controllers/product.controller.js';
import { authenticate, requireAdmin } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { validateObjectId } from '../middlewares/validateObjectId.js';
import { listQuerySchema, createProductSchema, updateProductSchema } from '../validators/product.validator.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/products', validate(listQuerySchema, 'query'), products.adminListProducts);
router.post('/products', validate(createProductSchema), products.createProduct);
router.patch('/products/:id', validateObjectId('id'), validate(updateProductSchema), products.updateProduct);
router.delete('/products/:id', validateObjectId('id'), products.deleteProduct);

export default router;
