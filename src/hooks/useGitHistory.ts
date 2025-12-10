/**
 * Custom hook for fetching and managing Git history (branches, tags, commits)
 */

import { useState } from 'react';
import { GitVersions } from '@/types/analysis';
import { API_ENDPOINTS } from '@/lib/api';

export const useGitHistory = () => {
  const [availableVersions, setAvailableVersions] = useState<GitVersions>({
    branches: [],
    tags: [],
    recentCommits: []
  });
  const [isFetchingBranches, setIsFetchingBranches] = useState(false);

  /**
   * Fetch Git history (branches, tags, recent commits) for a repository
   * @param repoPath - Repository URL or path
   * @returns Default branch name (main/master or first available) or null if failed
   */
  const fetchGitHistory = async (repoPath: string): Promise<string | null> => {
    setIsFetchingBranches(true);

    try {
      const response = await fetch(API_ENDPOINTS.gitHistory(repoPath));

      if (!response.ok) {
        throw new Error('Failed to fetch git history');
      }

      const data = await response.json();
      console.log('Git history API response:', data);

      setAvailableVersions({
        branches: data.branches || [],
        tags: data.tags || [],
        recentCommits: data.recent_commits || []
      });

      // Auto-select the first branch if available
      // Prefer 'main' or 'master' if available, otherwise use first branch
      if (data.branches && data.branches.length > 0) {
        const defaultBranch =
          data.branches.find((b: string) => b === 'main' || b === 'master') ||
          data.branches[0];

        console.log('Auto-selected branch:', defaultBranch);
        return defaultBranch;
      }

      console.log('Available branches set to:', data.branches || []);
      return null;
    } catch (error) {
      console.error('Failed to fetch git history:', error);

      // Don't show fallback branches - only show actual branches from the repo
      setAvailableVersions({
        branches: [],
        tags: [],
        recentCommits: []
      });

      console.log('Git history fetch failed - no branches available');
      return null;
    } finally {
      setIsFetchingBranches(false);
    }
  };

  /**
   * Reset available versions (useful when URL is cleared)
   */
  const resetVersions = () => {
    setAvailableVersions({
      branches: [],
      tags: [],
      recentCommits: []
    });
  };

  return {
    availableVersions,
    setAvailableVersions,
    isFetchingBranches,
    fetchGitHistory,
    resetVersions,
  };
};
