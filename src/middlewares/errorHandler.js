import { AppError } from '../utils/AppError.js';

export function notFound(req, _res, next) {
  next(new AppError(404, `找不到路由：${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let status = err.statusCode || 500;
  let message = err.message || '伺服器錯誤';
  let details = err.details;

  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'JSON 格式錯誤';
  } else if (err.code === 11000) {
    status = 409;
    message = '資料重複';
  } else if (err.name === 'ValidationError') {
    status = 400;
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    message = details[0]?.message || '資料驗證失敗';
  } else if (err.name === 'CastError') {
    status = 400;
    message = `無效的 ${err.path}`;
  } else if (!(err instanceof AppError) && status === 500) {
    console.error(err);
    message = '伺服器錯誤，請稍後再試';
  }

  res.status(status).json({ success: false, message, ...(details && { errors: details }) });
}
