import Redis from 'ioredis';
import { kv } from '@vercel/kv';

const getRedisClient = () => {
  // If user connected standard Redis
  if (process.env.REDIS_URL) {
    const rawRedis = new Redis(process.env.REDIS_URL);
    return {
      get: async (key) => {
        const val = await rawRedis.get(key);
        if (!val) return null;
        try { return JSON.parse(val); } catch (e) { return val; }
      },
      set: async (key, value) => {
        const val = typeof value === 'object' ? JSON.stringify(value) : value;
        return await rawRedis.set(key, val);
      },
      setex: async (key, seconds, value) => {
        const val = typeof value === 'object' ? JSON.stringify(value) : value;
        return await rawRedis.setex(key, seconds, val);
      },
      del: async (key) => rawRedis.del(key),
      // ── Métodos faltantes que causaban crashes ──
      incr: async (key) => rawRedis.incr(key),
      setnx: async (key, value) => {
        const val = typeof value === 'object' ? JSON.stringify(value) : value;
        return await rawRedis.setnx(key, val);
      },
      expire: async (key, seconds) => rawRedis.expire(key, seconds),
      lpush: async (key, ...values) => {
        const serialized = values.map(v => typeof v === 'object' ? JSON.stringify(v) : v);
        return await rawRedis.lpush(key, ...serialized);
      },
      keys: async (pattern) => rawRedis.keys(pattern),
    };
  }

  // If user connected Upstash KV
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return kv;
  }

  // Dummy fallback
  console.warn('⚠️ No REDIS_URL or KV variables found. Running in Redis-bypass mode.');
  return {
    get: async () => null,
    set: async () => 'OK',
    setex: async () => 'OK',
    del: async () => 0,
    incr: async () => 1,
    setnx: async () => 1,
    expire: async () => 1,
    lpush: async () => 1,
    keys: async () => [],
  };
};

export const redis = getRedisClient();
