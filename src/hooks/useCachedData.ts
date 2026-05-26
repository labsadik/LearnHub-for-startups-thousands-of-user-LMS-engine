import { useState, useEffect, useRef } from 'react';
import { getCache, setCache, invalidateCache } from '../lib/cache';

export function useCachedData<T>(
  key: string,
  fetcherFn: () => Promise<T>,
  deps: any[] = [],
  initialData: T | null = null // ✨ NEW: Safe default state (e.g., pass [] for arrays)
) {
  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);

  const cachedDataRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setLoading(true);
      setError(null);
      
      let initialCacheLoaded = false;

      // ==========================================
      // 1. Try to get data from Redis Cache (FAST)
      // ==========================================
      try {
        const cachedData = await getCache<T>(key);
        if (isMounted && cachedData !== null && cachedData !== undefined) {
          const cacheString = JSON.stringify(cachedData);
          cachedDataRef.current = cacheString;
          setData(cachedData);
          setLoading(false); 
          initialCacheLoaded = true;
        }
      } catch (e) {
        // Cache read failed, proceed to network
      }

      // ==========================================
      // 2. Always fetch from Database (REVALIDATE)
      // ==========================================
      try {
        const freshData = await fetcherFn();
        
        if (isMounted) {
          const freshString = JSON.stringify(freshData);
          
          if (freshString !== cachedDataRef.current) {
            setData(freshData);
            cachedDataRef.current = freshString;
          }
          
          setCache(key, freshData).catch(err => console.error('Background cache set error', err));
          
          if (!initialCacheLoaded) {
            setLoading(false);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err as Error);
          if (!initialCacheLoaded) {
            setLoading(false);
          }
        }
      }
    }

    loadData();

    return () => { isMounted = false; };
  }, [key, nonce, ...deps]);

  const refetch = async () => {
    await invalidateCache(key);
    setNonce(n => n + 1);
  };

  return { data, loading, error, refetch };
}