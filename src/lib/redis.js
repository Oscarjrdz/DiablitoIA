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
      ltrim: async (key, start, stop) => rawRedis.ltrim(key, start, stop),
      lrange: async (key, start, stop) => rawRedis.lrange(key, start, stop),
      keys: async (pattern) => rawRedis.keys(pattern),
      sadd: async (key, ...members) => rawRedis.sadd(key, ...members),
      srem: async (key, ...members) => rawRedis.srem(key, ...members),
      smembers: async (key) => rawRedis.smembers(key),
      mget: async (...keys) => {
        if (!keys || keys.length === 0) return [];
        const vals = await rawRedis.mget(...keys);
        return vals.map(val => {
          if (!val) return null;
          try { return JSON.parse(val); } catch (e) { return val; }
        });
      },
      publish: async (channel, value) => {
        const val = typeof value === 'object' ? JSON.stringify(value) : value;
        return rawRedis.publish(channel, val);
      },
      subscribe: async (channel, onMessage) => {
        const sub = rawRedis.duplicate();
        sub.on('message', (ch, message) => {
          if (ch !== channel) return;
          try { onMessage(JSON.parse(message)); } catch { onMessage(message); }
        });
        await sub.subscribe(channel);
        return async () => {
          try { await sub.unsubscribe(channel); } catch {}
          try { sub.disconnect(); } catch {}
        };
      },
    };
  }

  // If user connected Upstash KV
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const kvPublish = typeof kv.publish === 'function' ? kv.publish.bind(kv) : null;
    return Object.assign(kv, {
      publish: async (channel, value) => {
        if (kvPublish) return kvPublish(channel, value);
        return 0;
      },
      subscribe: async () => async () => {},
    });
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
    ltrim: async () => 'OK',
    lrange: async () => [],
    keys: async () => [],
    sadd: async () => 0,
    srem: async () => 0,
    smembers: async () => [],
    publish: async () => 0,
    subscribe: async () => async () => {},
  };
};

export const redis = getRedisClient();
