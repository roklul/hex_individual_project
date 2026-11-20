import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';

export const validateObjectId = (param = 'id') => (req, _res, next) => {
  if (!mongoose.isValidObjectId(req.params[param])) {
    return next(new AppError(400, `無效的 ${param} 格式`));
  }
  next();
};
