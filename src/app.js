import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middlewares/errorHandler.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // 部署在 Render 等反向代理後方，讓 rate limit 取得真實 IP

  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // 無 Origin（Postman、curl、伺服器間呼叫）一律放行；瀏覽器來源需在白名單內
        if (!origin || env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  if (env.nodeEnv !== 'test') app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

  app.get('/', (_req, res) => res.json({ success: true, message: 'Select Shop API', docs: '/api/health' }));
  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
