/**
 * Results view component displaying analysis results with diagrams
 */

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info, Copy, Download, Check, ExternalLink, GitBranch } from "lucide-react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { AnalysisResults, GitVersions, GranularityLevel } from "@/types/analysis";

interface ResultsViewProps {
  analyzedBranch: string;
  analyzedBranchB?: string;
  compareMode: boolean;
  availableVersions: GitVersions;
  versionCache: Map<string, AnalysisResults>;
  isLoadingVersion: boolean;
  switchToVersion: (version: string) => Promise<void>;
  currentRepoPath: string;
  granularityLevel: GranularityLevel;
  setGranularityLevel: (level: GranularityLevel) => void;
  diffStats: any;
  analysisResults: AnalysisResults | null;
  mermaidCode: string;
  copied: boolean;
  handleCopy: () => Promise<void>;
  handleDownload: (format: string) => Promise<void>;
  handleOpenInNewTab: () => void;
  selectedMethod: string;
  availableMethods: string[];
  handleMethodSelect: (method: string) => Promise<void>;
  callFlowData: any;
  isLoadingCallFlow: boolean;
  handleNewAnalysis: () => void;
}

export const ResultsView = (props: ResultsViewProps) => {
  const {
    analyzedBranch,
    analyzedBranchB,
    compareMode,
    availableVersions,
    versionCache,
    isLoadingVersion,
    switchToVersion,
    currentRepoPath,
    granularityLevel,
    setGranularityLevel,
    diffStats,
    analysisResults,
    mermaidCode,
    copied,
    handleCopy,
    handleDownload,
    handleOpenInNewTab,
    selectedMethod,
    availableMethods,
    handleMethodSelect,
    callFlowData,
    isLoadingCallFlow,
    handleNewAnalysis,
  } = props;

      return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4">
          <h1
            className="text-3xl font-telegraf font-light tracking-[0.3em] text-foreground cursor-pointer hover:opacity-70 transition-opacity"
            onClick={handleNewAnalysis}
          >
            CORTEX
          </h1>
          {analyzedBranch && !compareMode && availableVersions.branches.length > 0 && (
            <div className="flex items-center gap-2">
              <Select value={analyzedBranch} onValueChange={switchToVersion} disabled={isLoadingVersion}>
                <SelectTrigger className="h-8 px-3 py-1 bg-primary/10 border border-primary/30 rounded-full hover:bg-primary/20 transition-colors">
                  <div className="flex items-center gap-1.5">
                    <GitBranch className="w-3 h-3 text-primary" />
                    <span className="text-xs text-primary font-medium">{analyzedBranch}</span>
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-[400px]">
                  {availableVersions.branches.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-background/50 sticky top-0">
                        📍 Branches
                      </div>
                      {availableVersions.branches.map((branch) => (
                        <SelectItem key={branch} value={branch}>
                          <div className="flex items-center gap-2">
                            <GitBranch className="w-3 h-3" />
                            <span>{branch}</span>
                            {versionCache.has(branch) && (
                              <span className="text-xs text-green-500">✓</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {availableVersions.tags.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t bg-background/50 sticky top-0">
                        🏷️ Tags
                      </div>
                      {availableVersions.tags.map((tag) => (
                        <SelectItem key={tag} value={tag}>
                          <div className="flex items-center gap-2">
                            <span className="text-xs">🏷️</span>
                            <span>{tag}</span>
                            {versionCache.has(tag) && (
                              <span className="text-xs text-green-500">✓</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {availableVersions.recentCommits.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t bg-background/50 sticky top-0">
                        📝 Recent Commits
                      </div>
                      {availableVersions.recentCommits.map((commit) => (
                        <SelectItem key={commit.hash} value={commit.hash}>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-primary">{commit.hash}</span>
                              {versionCache.has(commit.hash) && (
                                <span className="text-xs text-green-500">✓</span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {commit.message}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              {isLoadingVersion && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="animate-spin w-3 h-3 border-2 border-primary border-t-transparent rounded-full"></div>
                  Loading...
                </div>
              )}
            </div>
          )}
          <Dialog>
            <DialogTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <Info className="w-4 h-4" />
              </button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">About Cortex</DialogTitle>
                <DialogDescription className="text-muted-foreground leading-relaxed pt-4">
                  An AI-powered code architecture visualization and analysis tool that accelerates architectural discovery and code onboarding. Cortex generates accurate, high-level architectural diagrams directly from live codebases by analyzing code structure and aligning findings with common architectural patterns. It parses and summarizes code structure (modules, classes, services, dependencies, call graphs), aligns findings with common architectural patterns, and produces both Mermaid source and rendered images.
                  <br/><br/>
                  <strong className="text-foreground">Features:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>🔄 Navigate between branches, tags, and commits in results view</li>
                    <li>⚡ Smart caching - instant switching between analyzed versions</li>
                    <li>🎯 Three levels of granularity: High Level, Medium Detail, Full Detail</li>
                    <li>🔍 Interactive call flow visualization from any method</li>
                    <li>💾 Export diagrams as PNG or SVG</li>
                  </ul>
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="flex-1 pt-24 px-8 pb-20">
          {/* Repository Name and New Analysis Button */}
          {currentRepoPath && (
            <div className="mb-8 text-center">
              <div className="inline-flex items-center gap-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/30 rounded-lg">
                  <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" clipRule="evenodd"/>
                  </svg>
                  <span className="text-sm font-medium text-primary">
                    {currentRepoPath.includes('github.com')
                      ? currentRepoPath.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '')
                      : currentRepoPath.includes('gitlab.com')
                      ? currentRepoPath.replace(/^https?:\/\/(www\.)?gitlab\.com\//, '').replace(/\.git$/, '')
                      : currentRepoPath.split('/').slice(-2).join('/')}
                  </span>
                </div>
                <button
                  onClick={handleNewAnalysis}
                  className="text-xs tracking-widest text-muted-foreground hover:text-foreground transition-colors uppercase"
                >
                  ← New Analysis
                </button>
              </div>
            </div>
          )}

          {/* Granularity Level Controls */}
          <div className="mb-6 flex items-center justify-center gap-4">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Detail Level:</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={granularityLevel === 1 ? "default" : "outline"}
                onClick={() => setGranularityLevel(1)}
                className="h-8 px-4 text-xs"
              >
                High Level
              </Button>
              <Button
                size="sm"
                variant={granularityLevel === 2 ? "default" : "outline"}
                onClick={() => setGranularityLevel(2)}
                className="h-8 px-4 text-xs"
              >
                Medium Detail
              </Button>
              <Button
                size="sm"
                variant={granularityLevel === 3 ? "default" : "outline"}
                onClick={() => setGranularityLevel(3)}
                className="h-8 px-4 text-xs"
              >
                Full Detail
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              {granularityLevel === 1 && "Folder structure with directory relationships"}
              {granularityLevel === 2 && "Files grouped by folders with detailed relationships"}
              {granularityLevel === 3 && "Full detail with methods and symbols"}
            </div>
          </div>

          {/* Comparison Mode: Show diff stats */}
          {compareMode && diffStats && (
            <div className="mb-6 bg-card border border-primary/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-foreground">{diffStats.filesAdded + diffStats.filesRemoved + diffStats.filesUnchanged}</span>
                    <span className="text-xs text-muted-foreground">total files</span>
                  </div>
                  <div className="h-8 w-px bg-border"></div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-green-500">+{diffStats.filesAdded}</span>
                    <span className="text-xs text-muted-foreground">added</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-red-500">-{diffStats.filesRemoved}</span>
                    <span className="text-xs text-muted-foreground">removed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-blue-500">{diffStats.filesUnchanged}</span>
                    <span className="text-xs text-muted-foreground">unchanged</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div>Symbols: {diffStats.symbolsA} → {diffStats.symbolsB}</div>
                  <div className={diffStats.symbolsB > diffStats.symbolsA ? "text-green-500" : diffStats.symbolsB < diffStats.symbolsA ? "text-red-500" : ""}>
                    ({diffStats.symbolsB > diffStats.symbolsA ? "+" : ""}{diffStats.symbolsB - diffStats.symbolsA})
                  </div>
                </div>
              </div>
            </div>
          )}

          {compareMode ? (
            /* Comparison Mode: Two diagrams side-by-side */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
              {/* Version A */}
              <div className="flex flex-col h-full">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500/20 text-green-500 text-xs font-bold">A</span>
                    <p className="text-xs tracking-widest text-muted-foreground uppercase">{analyzedBranch}</p>
                  </div>
                </div>
                <div className="flex-1 bg-card border border-border/50 rounded overflow-auto">
                  <div className="p-6 flex items-center justify-center min-h-full">
                    <div id="mermaid-preview" className="w-full" />
                  </div>
                </div>
              </div>

              {/* Version B */}
              <div className="flex flex-col h-full">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500/20 text-blue-500 text-xs font-bold">B</span>
                    <p className="text-xs tracking-widest text-muted-foreground uppercase">{analyzedBranchB}</p>
                  </div>
                </div>
                <div className="flex-1 bg-card border border-border/50 rounded overflow-auto">
                  <div className="p-6 flex items-center justify-center min-h-full">
                    <div id="mermaid-preview-b" className="w-full" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Single Mode: Syntax and Visualization */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
              {/* Syntax Panel */}
              <div className="flex flex-col h-full">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs tracking-widest text-muted-foreground uppercase">
                    Syntax
                  </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopy}
                  className="h-7 px-2 text-xs"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 mr-1" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <div className="flex-1 bg-card border border-border/50 rounded overflow-hidden">
                <SyntaxHighlighter
                  language="mermaid"
                  style={vscDarkPlus}
                  customStyle={{
                    margin: 0,
                    height: '100%',
                    background: 'transparent',
                    fontSize: '0.875rem',
                  }}
                  showLineNumbers
                >
                  {mermaidCode}
                </SyntaxHighlighter>
              </div>
            </div>
            
            {/* Visualization Panel */}
            <div className="flex flex-col h-full">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs tracking-widest text-muted-foreground uppercase">
                  Visualization
                </p>
                <div className="flex gap-2">
                  {availableMethods.length > 0 && (
                    <div className="flex items-center gap-2 mr-2">
                      <GitBranch className="w-3 h-3 text-muted-foreground" />
                      <Select value={selectedMethod || "__clear__"} onValueChange={(value) => {
                        if (value === "__clear__") {
                          handleMethodSelect("");
                        } else {
                          handleMethodSelect(value);
                        }
                      }}>
                        <SelectTrigger className="h-7 w-[180px] text-xs border-primary/50">
                          <SelectValue placeholder="Select method..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__clear__">
                            <span className="text-muted-foreground">Clear selection</span>
                          </SelectItem>
                          {availableMethods.slice(0, 100).map((method) => (
                            <SelectItem key={method} value={method}>
                              {method}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleOpenInNewTab}
                    className="h-7 px-2 text-xs border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-200"
                    title="Open in new tab for better viewing (pan & zoom)"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Open in Tab
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDownload('png')}
                    className="h-7 px-2 text-xs"
                    title="Download high-quality PNG (3x resolution)"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    PNG
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDownload('svg')}
                    className="h-7 px-2 text-xs"
                    title="Download vector SVG"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    SVG
                  </Button>
                </div>
              </div>
              <div className="flex-1 bg-card border border-border/50 rounded overflow-auto">
                <div className="p-6 flex items-center justify-center min-h-full">
                  <div id="mermaid-preview" className="w-full" />
                </div>
              </div>

              {/* Call Flow Overlay */}
              {callFlowData && callFlowData.calls && callFlowData.calls.length > 0 && (
                <div className="mt-4 bg-card border border-primary/30 rounded p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-primary" />
                      <h3 className="text-sm font-medium text-foreground">
                        Call Flow from <code className="text-primary">{selectedMethod}</code>
                      </h3>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {callFlowData.total_calls} calls • Max depth {callFlowData.max_depth}
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {callFlowData.calls.map((call: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 text-xs p-2 bg-background/50 rounded hover:bg-background transition-colors"
                        style={{ paddingLeft: `${call.depth * 16 + 8}px` }}
                      >
                        <span className="text-muted-foreground mt-0.5">→</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <code className="text-primary">{call.from}</code>
                            <span className="text-muted-foreground">calls</span>
                            <code className="text-accent">{call.to}</code>
                          </div>
                          <div className="text-muted-foreground mt-1">
                            {call.file && (
                              <span>
                                {call.file}:{call.line}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-muted-foreground">
                          L{call.depth}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

          <div className="mt-6 flex justify-center">
            <button
              onClick={handleNewAnalysis}
              className="text-xs tracking-widest text-muted-foreground hover:text-foreground transition-colors uppercase"
            >
              ← New Analysis
            </button>
          </div>
        </div>

        <footer className="py-4 text-center border-t border-border/30">
          <p className="text-xs text-muted-foreground tracking-wider">
            created by{' '}
            <a 
              href="https://www.linkedin.com/in/shriya-challapuram/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors underline decoration-primary/30 hover:decoration-primary"
            >
              Sri Shriya Challapuram
            </a>
            {' '}2025
          </p>
        </footer>
      </div>
    );

};
