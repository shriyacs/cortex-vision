/**
 * Type definitions for code analysis
 */

export interface AnalysisResults {
  mermaid_diagram?: string;
  git_ref?: string;
  file_count?: number;
  symbol_count?: number;
  code_facts?: {
    function_calls?: Array<{
      from_function: string;
      to_function: string;
    }>;
  };
}

export interface GitVersions {
  branches: string[];
  tags: string[];
  recentCommits: Array<{
    hash: string;
    message: string;
    date: string;
  }>;
}

export interface CallFlowData {
  path?: Array<string>;
  depth?: number;
  calls?: Array<{
    from: string;
    to: string;
    depth: number;
  }>;
  total_calls?: number;
  max_depth?: number;
}

export type GranularityLevel = 1 | 2 | 3;

export type InputType = "url" | "upload";
