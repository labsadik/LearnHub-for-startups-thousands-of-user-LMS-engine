import { supabase } from '@/integrations/supabase/client';

const REDIS_URL = import.meta.env.VITE_UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = import.meta.env.VITE_UPSTASH_REDIS_REST_TOKEN;

function isSupabaseResponse(obj: any): obj is { data: any; error: any } {
  return obj && typeof obj === 'object' && 'data' in obj && 'error' in obj;
}

/**
 * Safely extracts data from cache, handling old Supabase wrappers if present
 */
function extractData(raw: any): any {
  if (raw === null || raw === undefined) return null;
  if (isSupabaseResponse(raw)) return raw.data;
  return raw;
}

/**
 * Get data from Redis cache
 */
export async function getCache<T>(key: string): Promise<T | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;

  try {
    const response = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: 'no-store'
    });

    if (!response.ok) throw new Error('Redis Network Error');

    const resJson = await response.json();
    if (!resJson.result) return null;

    try {
      const parsed = JSON.parse(resJson.result);
      const extracted = extractData(parsed);

      if (extracted === null || extracted === undefined) {
        // Delete null/empty cache entries automatically
        fetch(`${REDIS_URL}/del/${key}`, { 
          method: 'POST', 
          headers: { Authorization: `Bearer ${REDIS_TOKEN}` } 
        }).catch(() => {});
        return null;
      }

      return extracted as T;
    } catch (parseError) {
      console.error(`[CACHE CORRUPT] Key "${key}" invalid JSON. Deleting.`, parseError);
      fetch(`${REDIS_URL}/del/${key}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
      }).catch(() => {});
      return null;
    }
  } catch (err) {
    console.error('[Redis GET Error]:', err);
    return null;
  }
}

/**
 * Save data to Redis cache
 */
export async function setCache<T>(key: string, data: T, ttl: number = 3600): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN || data === null || data === undefined) return;

  try {
    let dataToStore = data;
    if (isSupabaseResponse(data)) {
      dataToStore = (data as any).data;
    }

    if (dataToStore !== null && dataToStore !== undefined) {
      await fetch(`${REDIS_URL}/set/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${REDIS_TOKEN}` },
        body: JSON.stringify({
          value: JSON.stringify(dataToStore),
          ex: ttl, // Expires in 1 hour by default to keep Redis clean
        }),
      });
    }
  } catch (err) {
    console.error('[Redis SET Error]', err);
  }
}

/**
 * Cache Invalidation
 */
export async function invalidateCache(key: string) {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  try {
    await fetch(`${REDIS_URL}/del/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
  } catch (err) {
    console.error('Redis DEL Error:', err);
  }
}

export { supabase };