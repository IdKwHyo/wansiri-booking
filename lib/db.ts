import {env} from 'cloudflare:workers';
export function db():D1Database{if(!env.DB)throw new Error('Database unavailable');return env.DB}
export function runtime(){return env as unknown as Record<string,string|undefined>}
