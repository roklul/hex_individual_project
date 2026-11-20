import { Router } from 'express';
import * as products from '../controllers/product.controller.js';
import { validate } from '../middlewares/validate.js';
import { validateObjectId } from '../middlewares/validateObjectId.js';
import { listQuerySchema } from '../validators/product.validator.js';

const router = Router();

router.get('/', validate(listQuerySchema, 'query'), products.listProducts);
router.get('/categories', products.listCategories);
router.get('/:id', validateObjectId('id'), products.getProduct);

export default router;
