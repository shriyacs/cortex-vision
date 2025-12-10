/**
 * API Configuration
 *
 * Automatically uses the correct API URL based on environment:
 * - Development: http://localhost:8000
 * - Production: Your Render backend URL (set in Vercel environment variables)
 */

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Helper function to construct API endpoint URLs
 */
export const getApiUrl = (path: string): string => {
  // Remove leading slash if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${API_URL}/${cleanPath}`;
};

/**
 * Common API endpoints
 */
export const API_ENDPOINTS = {
  analyze: () => getApiUrl('api/analyze'),
  gitHistory: (repo: string) => getApiUrl(`api/git-history?repo=${encodeURIComponent(repo)}`),
  job: (jobId: string) => getApiUrl(`api/jobs/${jobId}`),
  results: (jobId: string) => getApiUrl(`api/results/${jobId}`),
  callflow: (jobId: string, methodName: string, maxDepth: number = 5) =>
    getApiUrl(`api/results/${jobId}/callflow/${encodeURIComponent(methodName)}?max_depth=${maxDepth}`),
  upload: () => getApiUrl('api/upload'),
} as const;
