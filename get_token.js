import { Redis } from '@upstash/redis'
import 'dotenv/config'

const redis = new Redis({
  url: 'https://cute-lark-18769.upstash.io',
  token: 'invalid_from_env_maybe'
})
