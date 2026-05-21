import { supabase } from '@/integrations/supabase/client';

// Redis Config
const REDIS_URL = import.meta.env.VITE_UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = import.meta.env.VITE_UPSTASH_REDIS_REST_TOKEN;

interface CacheOptions {
  revalidate?: number; // seconds
}

function isSupabaseResponse(obj: any): obj is { data: any; error: any } {
  return obj && typeof obj === 'object' && 'data' in obj && 'error' in obj;
}

/**
 * Generic Data Fetcher with Redis Caching
 * FIX: Robust extraction that deletes corrupt keys on error.
 */
export async function fetchWithCache<T>(
  key: string,
  fetcherFn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const { revalidate = 300 } = options;

  // =========================
  // A. Try Redis Cache
  // =========================
  if (REDIS_URL && REDIS_TOKEN) {
    try {
      const response = await fetch(`${REDIS_URL}/get/${key}`, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
        cache: 'no-store'
      });

      if (!response.ok) throw new Error('Redis Network Error');

      const resJson = await response.json();

      if (resJson.result) {
        let dataToReturn: any = null;

        try {
          let parsed = JSON.parse(resJson.result);

          // --- FIX 1: Handle NULL ---
          if (parsed === null || parsed === undefined) {
            console.warn(`[CACHE NULL] Key "${key}" is null. Deleting...`);
            fetch(`${REDIS_URL}/del/${key}`, { method: 'POST', headers: { Authorization: `Bearer ${REDIS_TOKEN}` }});
          } 
          // --- FIX 2: Handle Supabase Wrapper ---
          else if (isSupabaseResponse(parsed)) {
            console.warn(`[CACHE FIX] Detected Supabase wrapper. Extracting data.`);
            dataToReturn = parsed.data;
          }
          
          // --- FIX 3: Handle "Redis Wrapper" (value/ex) ---
          // This is the critical fix for your current error.
          else if ('value' in parsed && typeof parsed.value === 'string') {
            console.warn(`[CACHE WRAPPER] Key "${key}" is wrapped. Extracting inner value...`);
            
            // WE MUST CATCH THIS because the JSON inside might be bad
            try {
              const innerParsed = JSON.parse(parsed.value);
              dataToReturn = innerParsed;
            } catch (wrapperError) {
              console.error("[WRAPPER ERROR] Failed to parse inner value:", wrapperError);
              // The data in Redis is broken. Delete it so we can use the DB.
              fetch(`${REDIS_URL}/del/${key}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
              });
              // Treat as Cache Miss (fall through to DB)
              dataToReturn = null; 
            }
          }
          
          // --- FIX 4: Handle Normal Data ---
          else {
            console.log(`[CACHE HIT] ${key} (Type: ${typeof parsed})`);
            dataToReturn = parsed;
          }

          // If we successfully extracted data (and didn't fail above), return it.
          if (dataToReturn !== null && dataToReturn !== undefined) {
            return dataToReturn as T;
          }

        } catch (parseError) {
          console.error(`[CACHE CORRUPT] Key "${key}" invalid JSON. Deleting.`, parseError);
          fetch(`${REDIS_URL}/del/${key}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
          }).catch(e => console.error("Failed to delete corrupt key", e));
        }
      }
    } catch (err) {
      console.error('[Redis GET Error] Fallback to DB:', err);
    }
  } else {
    console.warn("[Redis Config Missing] Skipping cache.");
  }

  console.log(`[CACHE MISS] ${key} - Fetching from DB`);

  // =========================
  // B. Fetch Fresh Data
  // =========================
  let freshData: T | null = null;
  
  try {
    freshData = await fetcherFn();
    if (freshData === null || freshData === undefined) {
        console.warn(`[Fetcher returned null] Key "${key}". Not caching.`);
        return freshData as T;
    }
  } catch (fetchError) {
    console.error('[Fetcher Error] DB failed:', fetchError);
    throw fetchError;
  }

  // =========================
  // C. Store in Redis
  // =========================
  if (REDIS_URL && REDIS_TOKEN && freshData !== null && freshData !== undefined) {
    try {
      let dataToStore = freshData;
      if (isSupabaseResponse(freshData)) {
        dataToStore = (freshData as any).data;
      }
      if (dataToStore !== null && dataToStore !== undefined) {
          await fetch(`${REDIS_URL}/set/${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${REDIS_TOKEN}` },
            body: JSON.stringify({
              value: JSON.stringify(dataToStore),
              ex: revalidate,
            }),
          });
          console.log(`[CACHE SET] ${key}`);
      }
    } catch (err) {
      console.error('[Redis SET Error]', err);
    }
  }

  return freshData as T;
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
    console.log(`[CACHE INVALIDATED] ${key}`);
  } catch (err) {
    console.error('Redis DEL Error:', err);
  }
}

// Export shared supabase instance
export { supabase };