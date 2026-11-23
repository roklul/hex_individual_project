import { Router } from 'express';
import * as products from '../controllers/product.controller.js';
import * as orders from '../controllers/order.controller.js';
import { authenticate, requireAdmin } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { validateObjectId } from '../middlewares/validateObjectId.js';
import { listQuerySchema, createProductSchema, updateProductSchema } from '../validators/product.validator.js';
import { listOrdersQuerySchema, updateStatusSchema } from '../validators/order.validator.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/products', validate(listQuerySchema, 'query'), products.adminListProducts);
router.post('/products', validate(createProductSchema), products.createProduct);
router.patch('/products/:id', validateObjectId('id'), validate(updateProductSchema), products.updateProduct);
router.delete('/products/:id', validateObjectId('id'), products.deleteProduct);

router.get('/orders', validate(listOrdersQuerySchema, 'query'), orders.adminListOrders);
router.patch('/orders/:id', validateObjectId('id'), validate(updateStatusSchema), orders.adminUpdateOrderStatus);

export default router;
