import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';

await connectDB(env.mongodbUri);
const app = createApp();
app.listen(env.port, () => console.log(`[server] listening on :${env.port} (${env.nodeEnv})`));
