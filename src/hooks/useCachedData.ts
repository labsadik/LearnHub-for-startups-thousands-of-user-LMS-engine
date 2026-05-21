import { useState, useEffect } from 'react';
import { fetchWithCache, invalidateCache } from '../lib/cache'; // Import invalidateCache

// This hook works for ANY data type
export function useCachedData<T>(
  key: string,                 // The cache key (e.g., "course:123")
  fetcherFn: () => Promise<T>, // The function to get data from Supabase
  deps: any[] = []             // Dependency array to refetch if needed
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0); // Used to force a refresh without reloading the page

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setLoading(true);
      setError(null);
      
      try {
        // Call our cache utility
        const result = await fetchWithCache(key, fetcherFn);
        
        if (isMounted) {
          setData(result);
        }
      } catch (err) {
        if (isMounted) {
          setError(err as Error);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    // Cleanup function to prevent setting state on unmounted component
    return () => { isMounted = false; };
  }, [key, nonce, ...deps]); // Add 'nonce' to dependency array

  // Helper function to force a refresh (ignore cache)
  const refetch = async () => {
    // 1. Delete the entry from Redis
    await invalidateCache(key);
    
    // 2. Update nonce to trigger useEffect again
    // This causes the hook to re-run, hitting the DB because the cache is now empty
    setNonce(n => n + 1);
  };

  return { data, loading, error, refetch };
}