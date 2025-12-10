/**
 * Custom hook for code analysis operations
 */

import { useState } from 'react';
import { AnalysisResults, GranularityLevel } from '@/types/analysis';
import { API_ENDPOINTS } from '@/lib/api';

export const useAnalysis = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [currentJobIdB, setCurrentJobIdB] = useState<string | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResults | null>(null);
  const [analysisResultsB, setAnalysisResultsB] = useState<AnalysisResults | null>(null);

  /**
   * Analyze a repository branch
   */
  const analyzeBranch = async (
    repoPath: string,
    gitRef: string,
    granularityLevel: GranularityLevel = 1
  ): Promise<AnalysisResults> => {
    const response = await fetch(API_ENDPOINTS.analyze(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo_path: repoPath,
        git_ref: gitRef,
        granularity_level: granularityLevel,
      }),
    });

    if (!response.ok) {
      throw new Error('Analysis request failed');
    }

    const data = await response.json();
    return await pollJobStatus(data.job_id);
  };

  /**
   * Poll job status until completion
   */
  const pollJobStatus = async (jobId: string): Promise<AnalysisResults> => {
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const statusResponse = await fetch(API_ENDPOINTS.job(jobId));
      const status = await statusResponse.json();

      if (status.status === 'completed') {
        const resultsResponse = await fetch(API_ENDPOINTS.results(jobId));
        const results = await resultsResponse.json();
        return results;
      }

      if (status.status === 'failed') {
        throw new Error(status.error || 'Analysis failed');
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }

    throw new Error('Analysis timed out after 2 minutes');
  };

  /**
   * Upload and analyze a file
   */
  const uploadAndAnalyze = async (
    file: File,
    granularityLevel: GranularityLevel = 1
  ): Promise<AnalysisResults> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('granularity_level', granularityLevel.toString());

    const uploadResponse = await fetch(API_ENDPOINTS.upload(), {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error('File upload failed');
    }

    const uploadData = await uploadResponse.json();
    return await pollJobStatus(uploadData.job_id);
  };

  /**
   * Start analysis (main entry point)
   */
  const startAnalysis = async (
    repoPath: string,
    gitRef: string,
    granularityLevel: GranularityLevel,
    file?: File
  ): Promise<void> => {
    setIsLoading(true);

    try {
      let results: AnalysisResults;

      if (file) {
        results = await uploadAndAnalyze(file, granularityLevel);
      } else {
        results = await analyzeBranch(repoPath, gitRef, granularityLevel);
      }

      setAnalysisResults(results);
      setCurrentJobId(results.git_ref || gitRef);
    } catch (error) {
      console.error('Analysis failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Start comparison analysis (for two branches)
   */
  const startComparisonAnalysis = async (
    repoPath: string,
    gitRefA: string,
    gitRefB: string,
    granularityLevel: GranularityLevel
  ): Promise<void> => {
    setIsLoading(true);

    try {
      const [resultsA, resultsB] = await Promise.all([
        analyzeBranch(repoPath, gitRefA, granularityLevel),
        analyzeBranch(repoPath, gitRefB, granularityLevel),
      ]);

      setAnalysisResults(resultsA);
      setAnalysisResultsB(resultsB);
      setCurrentJobId(resultsA.git_ref || gitRefA);
      setCurrentJobIdB(resultsB.git_ref || gitRefB);
    } catch (error) {
      console.error('Comparison analysis failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    setIsLoading,
    currentJobId,
    setCurrentJobId,
    currentJobIdB,
    setCurrentJobIdB,
    analysisResults,
    analysisResultsB,
    startAnalysis,
    startComparisonAnalysis,
    setAnalysisResults,
    setAnalysisResultsB,
  };
};
