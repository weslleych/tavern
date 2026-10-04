import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GameService } from './game';
import { readableError } from '../lib/validation';

export function createApi(game: GameService) {
  const requests = new Map<string, { count: number; start: number }>();
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const path = req.url?.split('?')[0];
    if (!path?.startsWith('/api/')) return false;
    const respond = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    if (path === '/api/health' && req.method === 'GET') {
      respond(200, { ok: true, storage: game.store.mode });
      return true;
    }
    if (!['/api/rooms', '/api/rooms/join'].includes(path) || req.method !== 'POST') {
      respond(404, { ok: false, error: 'Endpoint not found.' });
      return true;
    }
    const origin = req.headers.origin;
    if (origin && origin !== (process.env.APP_ORIGIN || `http://${req.headers.host}`)) {
      respond(403, { ok: false, error: 'This request came from a different site.' });
      return true;
    }
    if (!req.headers['content-type']?.includes('application/json')) {
      respond(415, { ok: false, error: 'Send JSON data.' });
      return true;
    }
    const ip = req.socket.remoteAddress || 'local';
    const current = requests.get(ip);
    const window =
      current && Date.now() - current.start < 60000 ? current : { count: 0, start: Date.now() };
    requests.set(ip, window);
    if (++window.count > 40) {
      respond(429, { ok: false, error: 'Too many requests. Try again in a minute.' });
      return true;
    }
    if (requests.size > 1000)
      for (const [key, value] of requests)
        if (Date.now() - value.start > 60000) requests.delete(key);
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 32 * 1024) {
          respond(413, { ok: false, error: 'The request is too large.' });
          return true;
        }
      }
      const input: unknown = JSON.parse(body);
      const data = path === '/api/rooms' ? await game.create(input) : await game.join(input);
      respond(201, { ok: true, data });
    } catch (error) {
      respond(400, {
        ok: false,
        error: error instanceof SyntaxError ? 'Invalid JSON data.' : readableError(error),
      });
    }
    return true;
  };
}
