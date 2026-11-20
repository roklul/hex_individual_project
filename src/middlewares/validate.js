import { AppError } from '../utils/AppError.js';

/** 驗證 req[source]，通過後把轉換過的結果放在 req.validated[source] */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.') || (i.code === 'unrecognized_keys' ? i.keys.join(',') : undefined),
      message: i.code === 'unrecognized_keys' ? `不允許的欄位：${i.keys.join(', ')}` : i.message,
    }));
    return next(new AppError(400, details[0].message, details));
  }
  req.validated = { ...req.validated, [source]: result.data };
  next();
};
