/**
 * Custom hook for caching analyzed versions (branches/tags)
 */

import { useState } from 'react';
import { AnalysisResults } from '@/types/analysis';

export const useVersionCache = () => {
  const [versionCache, setVersionCache] = useState<Map<string, AnalysisResults>>(new Map());
  const [isLoadingVersion, setIsLoadingVersion] = useState(false);

  /**
   * Add a version to cache
   */
  const cacheVersion = (version: string, results: AnalysisResults) => {
    setVersionCache(prev => {
      const newCache = new Map(prev);
      newCache.set(version, results);
      return newCache;
    });
  };

  /**
   * Get a version from cache
   */
  const getCachedVersion = (version: string): AnalysisResults | undefined => {
    return versionCache.get(version);
  };

  /**
   * Check if version is cached
   */
  const isCached = (version: string): boolean => {
    return versionCache.has(version);
  };

  /**
   * Clear all cache
   */
  const clearCache = () => {
    setVersionCache(new Map());
  };

  /**
   * Get cache size
   */
  const getCacheSize = (): number => {
    return versionCache.size;
  };

  return {
    versionCache,
    isLoadingVersion,
    setIsLoadingVersion,
    setVersionCache,
    cacheVersion,
    getCachedVersion,
    isCached,
    clearCache,
    getCacheSize,
  };
};
