import { config } from 'dotenv';
import { createServer } from 'node:http';
import next from 'next';
import { GameService } from './src/server/game';
import { createStore } from './src/server/store';
import { createApi } from './src/server/http';
import { attachGateway } from './src/server/gateway';

config({ path: ['.env.local', '.env'], quiet: true });
const dev = !process.argv.includes('--production');
Object.assign(process.env, { NODE_ENV: dev ? 'development' : 'production' });
const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOSTNAME || '0.0.0.0';
const store = createStore();
const game = new GameService(store);
await game.ready();
const app = next({ dev, hostname, port });
await app.prepare();
const handler = app.getRequestHandler();
const api = createApi(game);
const server = createServer(async (req, res) => {
  try {
    if (!(await api(req, res))) await handler(req, res);
  } catch (error) {
    console.error('Request failed:', error);
    if (!res.headersSent) res.writeHead(500);
    res.end('Request failed.');
  }
});
const io = attachGateway(server, game);
server.listen(port, hostname, () =>
  console.log(`Tavern is ready at http://localhost:${port} (${store.mode} storage)`),
);
async function shutdown() {
  io.close();
  await store.close?.();
  await app.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
