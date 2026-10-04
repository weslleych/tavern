import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import type { Member, Panel, Room } from '../types/game';

export interface Session extends Member {
  roomId: string;
  tokenHash: string;
}
export interface StoredGame {
  rooms: Room[];
  panels: Panel[];
  sessions: Session[];
}
export interface GameStore {
  mode: 'local' | 'mongodb';
  load(): Promise<StoredGame>;
  save(data: StoredGame): Promise<void>;
  close?(): Promise<void>;
}
const empty = (): StoredGame => ({ rooms: [], panels: [], sessions: [] });

export class FileStore implements GameStore {
  readonly mode = 'local';
  constructor(public readonly filename: string) {}
  async load(): Promise<StoredGame> {
    try {
      const value: StoredGame = JSON.parse(await readFile(this.filename, 'utf8'));
      if (
        !Array.isArray(value.rooms) ||
        !Array.isArray(value.panels) ||
        !Array.isArray(value.sessions)
      )
        throw new Error('Invalid Tavern storage file');
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty();
      throw error;
    }
  }
  async save(data: StoredGame) {
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 });
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
    await rename(temporary, this.filename);
  }
}

export class MongoStore implements GameStore {
  readonly mode = 'mongodb';
  private client: MongoClient;
  private previous = empty();
  constructor(
    uri: string,
    private database = 'tavern',
  ) {
    this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  }
  async load(): Promise<StoredGame> {
    await this.client.connect();
    const db = this.client.db(this.database);
    await db.collection('rooms').createIndex({ code: 1 }, { unique: true });
    await db.collection('panels').createIndex({ roomId: 1, order: 1 });
    await db.collection('sessions').createIndex({ id: 1 }, { unique: true });
    const [rooms, panels, sessions] = await Promise.all([
      db
        .collection<Room>('rooms')
        .find({}, { projection: { _id: 0 } })
        .toArray(),
      db
        .collection<Panel>('panels')
        .find({}, { projection: { _id: 0 } })
        .toArray(),
      db
        .collection<Session>('sessions')
        .find({}, { projection: { _id: 0 } })
        .toArray(),
    ]);
    this.previous = { rooms, panels, sessions };
    return structuredClone(this.previous);
  }
  async save(data: StoredGame) {
    const db = this.client.db(this.database);
    // Save scenes before room pointers. Interrupted writes can leave an orphan,
    // but never expose a room pointing to a scene that has not been saved.
    for (const collection of ['panels', 'sessions', 'rooms'] as const) {
      const previous = new Map(
        this.previous[collection].map((item) => [item.id, JSON.stringify(item)]),
      );
      for (const document of data[collection]) {
        if (previous.get(document.id) !== JSON.stringify(document)) {
          await db
            .collection(collection)
            .replaceOne({ id: document.id }, document, { upsert: true });
        }
      }
    }
    this.previous = structuredClone(data);
  }
  async close() {
    await this.client.close();
  }
}

export function createStore(): GameStore {
  return process.env.MONGODB_URI
    ? new MongoStore(process.env.MONGODB_URI, process.env.MONGODB_DB || 'tavern')
    : new FileStore(resolve(process.env.TAVERN_DATA_FILE || '.tavern/store.json'));
}
