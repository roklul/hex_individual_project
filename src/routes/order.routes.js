import { Router } from 'express';
import * as orders from '../controllers/order.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { validateObjectId } from '../middlewares/validateObjectId.js';
import { createOrderSchema, listOrdersQuerySchema, transferReportSchema } from '../validators/order.validator.js';

const router = Router();
router.use(authenticate);

router.post('/', validate(createOrderSchema), orders.createOrder);
router.get('/', validate(listOrdersQuerySchema, 'query'), orders.listMyOrders);
router.get('/:id', validateObjectId('id'), orders.getMyOrder);
router.post('/:id/transfer-report', validateObjectId('id'), validate(transferReportSchema), orders.reportTransfer);
router.post('/:id/cancel', validateObjectId('id'), orders.cancelMyOrder);

export default router;
