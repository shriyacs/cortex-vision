// React & core hooks
import { useState, useEffect, useRef } from "react";

// UI Components
import { Button } from "@/components/UI/button";
import { Input } from "@/components/UI/input";
import { Label } from "@/components/UI/label";
import { Switch } from "@/components/UI/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/UI/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/UI/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/UI/select";

// Icons
import { Info, Copy, Download, Check, ExternalLink, GitBranch, GitCompare } from "lucide-react";

// Custom Hooks
import { useToast } from "@/hooks/use-toast";
import { useGitHistory } from "@/hooks/useGitHistory";
import { useAnalysis } from "@/hooks/useAnalysis";
import { useMermaidRenderer } from "@/hooks/useMermaidRenderer";
import { useCallFlow } from "@/hooks/useCallFlow";
import { useVersionCache } from "@/hooks/useVersionCache";

// Custom Components
import { AnalysisForm } from "@/components/AnalysisForm";
import { ResultsView } from "@/components/ResultsView";
import { QUIRKY_QUOTES } from "@/components/LoadingScreen";

// Utilities
import { openDiagramInNewTab } from "@/lib/diagram-export";
import { highlightCallFlow as highlightCallFlowUtil } from "@/lib/call-flow-utils";

// External Libraries
import mermaid from "mermaid";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { toPng, toSvg } from 'html-to-image';

const Index = () => {
  const [inputType, setInputType] = useState<"url" | "upload">("url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [gitRef, setGitRef] = useState("main");
  const [analyzedBranch, setAnalyzedBranch] = useState<string>("");

  // Comparison mode
  const [compareMode, setCompareMode] = useState(false);
  const [gitRefB, setGitRefB] = useState("dev");
  const [analyzedBranchB, setAnalyzedBranchB] = useState<string>("");
  const [diffStats, setDiffStats] = useState<any>(null);

  const [currentQuote, setCurrentQuote] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [copied, setCopied] = useState(false);

  // Granularity levels
  const [granularityLevel, setGranularityLevel] = useState<1 | 2 | 3>(1);

  // Git history navigation
  const [currentRepoPath, setCurrentRepoPath] = useState<string>("");

  // Hooks
  const { toast } = useToast();
  const { availableVersions, setAvailableVersions, fetchGitHistory } = useGitHistory();
  const { isLoading, setIsLoading, currentJobId, setCurrentJobId, currentJobIdB, setCurrentJobIdB, analysisResults, analysisResultsB, setAnalysisResults, setAnalysisResultsB } = useAnalysis();
  const { mermaidCode, mermaidCodeB, setMermaidCode, setMermaidCodeB, renderDiagram } = useMermaidRenderer();
  const { selectedMethod, availableMethods, callFlowData, isLoadingCallFlow, setSelectedMethod, setAvailableMethods, setCallFlowData, updateAvailableMethods, fetchCallFlow } = useCallFlow();
  const { versionCache, isLoadingVersion, setIsLoadingVersion, setVersionCache, cacheVersion, getCachedVersion, isCached } = useVersionCache();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mermaid.initialize({ 
      startOnLoad: true,
      theme: 'dark',
      themeVariables: {
        primaryColor: '#00E5FF',
        primaryTextColor: '#fff',
        primaryBorderColor: '#00E5FF',
        lineColor: '#00E5FF',
        secondaryColor: '#B366FF',
        tertiaryColor: '#1A2332',
      }
    });
  }, []);

  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setCurrentQuote((prev) => (prev + 1) % QUIRKY_QUOTES.length);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  // Sanitize mermaid diagram to fix empty labels
  const sanitizeMermaidDiagram = (diagram: string): string => {
    if (!diagram) return diagram;

    // Replace empty node labels with a placeholder
    // Matches patterns like: NODE[""] or NODE['']
    const sanitized = diagram.replace(/(\w+)\[["']["']\]/g, '$1["file"]');

    return sanitized;
  };

  // Regenerate mermaid code when granularity level changes
  useEffect(() => {
    if (analysisResults && granularityLevel) {
      const newDiagram = generateMermaidDiagram(analysisResults, granularityLevel);
      setMermaidCode(sanitizeMermaidDiagram(newDiagram));
    }
    if (compareMode && analysisResultsB && granularityLevel) {
      const newDiagramB = generateMermaidDiagram(analysisResultsB, granularityLevel);
      setMermaidCodeB(sanitizeMermaidDiagram(newDiagramB));
    }
  }, [granularityLevel, analysisResults, analysisResultsB, compareMode]);

  useEffect(() => {
    if (showResults && mermaidCode) {
      const renderDiagram = async () => {
        const element = document.getElementById('mermaid-preview');
        if (element) {
          try {
            // Clear previous content
            element.innerHTML = '';
            element.removeAttribute('data-processed');

            // Create a new div for the diagram
            const diagramDiv = document.createElement('div');
            diagramDiv.className = 'mermaid';
            diagramDiv.textContent = mermaidCode;
            element.appendChild(diagramDiv);

            // Render with mermaid
            await mermaid.run({ nodes: [diagramDiv] });

            // Apply call flow highlighting after render (single mode only)
            if (!compareMode && callFlowData && callFlowData.calls) {
              setTimeout(() => highlightCallFlow(), 100);
            }
          } catch (error) {
            console.error('Error rendering mermaid:', error);
            // Show error message
            element.innerHTML = `<div class="p-4 text-red-500">Error rendering diagram: ${error}</div>`;
          }
        }

        // Render second diagram in compare mode
        if (compareMode && mermaidCodeB) {
          const elementB = document.getElementById('mermaid-preview-b');
          if (elementB) {
            try {
              // Clear previous content
              elementB.innerHTML = '';
              elementB.removeAttribute('data-processed');

              // Create a new div for the diagram
              const diagramDivB = document.createElement('div');
              diagramDivB.className = 'mermaid';
              diagramDivB.textContent = mermaidCodeB;
              elementB.appendChild(diagramDivB);

              // Render with mermaid
              await mermaid.run({ nodes: [diagramDivB] });
            } catch (error) {
              console.error('Error rendering mermaid B:', error);
              elementB.innerHTML = `<div class="p-4 text-red-500">Error rendering diagram: ${error}</div>`;
            }
          }
        }
      };
      renderDiagram();
    }
  }, [showResults, mermaidCode, mermaidCodeB, callFlowData, compareMode]);

  const highlightCallFlow = () => highlightCallFlowUtil(callFlowData);

  // Generate mermaid diagram based on granularity level
  const generateMermaidDiagram = (results: any, level: 1 | 2 | 3): string => {
    if (!results || !results.dependency_graph) {
      return results?.mermaid_diagram || 'graph TD\nNO_DATA["No data available"]';
    }

    const graph = results.dependency_graph;
    const codeFacts = results.code_facts;

    // Safety limits to prevent Mermaid overflow
    const MAX_NODES = level === 1 ? 30 : level === 2 ? 60 : 80;
    const MAX_EDGES = level === 1 ? 40 : level === 2 ? 80 : 120;
    const MAX_SYMBOLS_PER_FILE = 3;

    if (!graph.nodes || graph.nodes.length === 0) {
      return 'graph TD\nNO_DATA["No files to display"]';
    }

    // Group files by directory
    const filesByDir = new Map<string, any[]>();
    graph.nodes.forEach((node: any) => {
      const filePath = node.id || '';
      const parts = filePath.split('/');
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : 'root';

      if (!filesByDir.has(dir)) {
        filesByDir.set(dir, []);
      }
      filesByDir.get(dir)?.push(node);
    });

    // Get directory relationships from edges
    const dirConnections = new Map<string, Set<string>>();
    if (graph.edges) {
      graph.edges.forEach((edge: any) => {
        const sourceDir = edge.source.split('/').slice(0, -1).join('/') || 'root';
        const targetDir = edge.target.split('/').slice(0, -1).join('/') || 'root';

        if (sourceDir !== targetDir) {
          if (!dirConnections.has(sourceDir)) {
            dirConnections.set(sourceDir, new Set());
          }
          dirConnections.get(sourceDir)?.add(targetDir);
        }
      });
    }

    // LEVEL 1: Folder structure with folder-to-folder relationships
    if (level === 1) {
      let diagram = 'graph TD\n';
      const directories = Array.from(filesByDir.keys()).slice(0, MAX_NODES);

      // Add directory nodes
      directories.forEach((dir) => {
        const dirId = dir.replace(/[^a-zA-Z0-9]/g, '_') || 'root';
        const dirName = dir.split('/').pop() || dir || 'root';
        const fileCount = filesByDir.get(dir)?.length || 0;
        diagram += `    ${dirId}["📁 ${dirName}<br/><small>${fileCount} files</small>"]\n`;
      });

      // Add directory relationships
      let edgeCount = 0;
      directories.forEach((sourceDir) => {
        if (edgeCount >= MAX_EDGES) return;
        const targets = dirConnections.get(sourceDir);
        if (targets) {
          targets.forEach((targetDir) => {
            if (edgeCount >= MAX_EDGES) return;
            if (directories.includes(targetDir)) {
              const sourceId = sourceDir.replace(/[^a-zA-Z0-9]/g, '_') || 'root';
              const targetId = targetDir.replace(/[^a-zA-Z0-9]/g, '_') || 'root';
              diagram += `    ${sourceId} --> ${targetId}\n`;
              edgeCount++;
            }
          });
        }
      });

      return diagram;
    }

    // LEVEL 2: Files within folders with file-to-file relationships
    if (level === 2) {
      let diagram = 'graph TD\n';
      const nodes = graph.nodes.slice(0, MAX_NODES);

      // Group nodes by directory for better visualization
      const dirGroups = new Map<string, any[]>();
      nodes.forEach((node: any) => {
        const filePath = node.id || '';
        const dir = filePath.split('/').slice(0, -1).join('/') || 'root';
        if (!dirGroups.has(dir)) {
          dirGroups.set(dir, []);
        }
        dirGroups.get(dir)?.push(node);
      });

      // Create subgraphs for each directory (limit to top 10 directories)
      const topDirs = Array.from(dirGroups.entries()).slice(0, 10);
      topDirs.forEach(([dir, dirNodes], index) => {
        const dirId = dir.replace(/[^a-zA-Z0-9]/g, '_') || 'root';
        const dirName = dir.split('/').pop() || dir || 'root';

        diagram += `\n    subgraph ${dirId}["📁 ${dirName}"]\n`;

        dirNodes.forEach((node: any) => {
          const nodeId = node.id.replace(/[^a-zA-Z0-9]/g, '_');
          const fileName = node.label || node.id.split('/').pop() || 'file';
          const safeName = fileName.trim() || 'unnamed_file';
          diagram += `        ${nodeId}["${safeName}"]\n`;
        });

        diagram += `    end\n`;
      });

      // Add file-to-file edges with descriptive labels (limited)
      if (graph.edges && graph.edges.length > 0) {
        const nodeIds = new Set(nodes.map((n: any) => n.id));
        const edges = graph.edges
          .filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target))
          .slice(0, MAX_EDGES);

        edges.forEach((edge: any) => {
          const fromId = edge.source.replace(/[^a-zA-Z0-9]/g, '_');
          const toId = edge.target.replace(/[^a-zA-Z0-9]/g, '_');
          const edgeLabel = edge.relationship || 'uses';
          diagram += `    ${fromId} -->|${edgeLabel}| ${toId}\n`;
        });
      }

      return diagram;
    }

    // LEVEL 3: Full detail with method/symbol information
    if (level === 3) {
      let diagram = 'graph TD\n';
      const nodes = graph.nodes.slice(0, MAX_NODES);

      // Build symbol map
      const fileSymbols = new Map<string, string[]>();
      if (codeFacts?.symbols) {
        codeFacts.symbols.forEach((symbol: any) => {
          if (symbol.file) {
            if (!fileSymbols.has(symbol.file)) {
              fileSymbols.set(symbol.file, []);
            }
            const symbolInfo = symbol.name || 'unnamed';
            fileSymbols.get(symbol.file)?.push(symbolInfo);
          }
        });
      }

      // Group nodes by directory
      const dirGroups = new Map<string, any[]>();
      nodes.forEach((node: any) => {
        const filePath = node.id || '';
        const dir = filePath.split('/').slice(0, -1).join('/') || 'root';
        if (!dirGroups.has(dir)) {
          dirGroups.set(dir, []);
        }
        dirGroups.get(dir)?.push(node);
      });

      // Create subgraphs with detailed node information (limit to top 8 directories)
      const topDirs = Array.from(dirGroups.entries()).slice(0, 8);
      topDirs.forEach(([dir, dirNodes]) => {
        const dirId = dir.replace(/[^a-zA-Z0-9]/g, '_') || 'root';
        const dirName = dir.split('/').pop() || dir || 'root';

        diagram += `\n    subgraph ${dirId}["📁 ${dirName}"]\n`;

        dirNodes.forEach((node: any) => {
          const nodeId = node.id.replace(/[^a-zA-Z0-9]/g, '_');
          const fileName = node.label || node.id.split('/').pop() || 'file';
          const safeName = (fileName.trim() || 'unnamed_file').substring(0, 30);

          // Get symbols for this file (limited)
          const symbols = fileSymbols.get(node.id) || [];
          let symbolText = '';
          if (symbols.length > 0) {
            const topSymbols = symbols.slice(0, MAX_SYMBOLS_PER_FILE);
            symbolText = topSymbols.join(', ');
            if (symbols.length > MAX_SYMBOLS_PER_FILE) {
              symbolText += ` +${symbols.length - MAX_SYMBOLS_PER_FILE}`;
            }
            // Truncate if too long
            if (symbolText.length > 60) {
              symbolText = symbolText.substring(0, 57) + '...';
            }
          }

          if (symbolText) {
            diagram += `        ${nodeId}["📄 ${safeName}<br/><small>${symbolText}</small>"]\n`;
          } else {
            diagram += `        ${nodeId}["📄 ${safeName}"]\n`;
          }
        });

        diagram += `    end\n`;
      });

      // Add edges (limited)
      if (graph.edges && graph.edges.length > 0) {
        const nodeIds = new Set(nodes.map((n: any) => n.id));
        const edges = graph.edges
          .filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target))
          .slice(0, MAX_EDGES);

        edges.forEach((edge: any) => {
          const fromId = edge.source.replace(/[^a-zA-Z0-9]/g, '_');
          const toId = edge.target.replace(/[^a-zA-Z0-9]/g, '_');
          const edgeLabel = (edge.relationship || 'uses').substring(0, 15);
          diagram += `    ${fromId} -->|${edgeLabel}| ${toId}\n`;
        });
      }

      return diagram;
    }

    return results.mermaid_diagram || 'graph TD\nNO_DATA["No data available"]';
  };


  const switchToVersion = async (version: string) => {
    if (!currentRepoPath) return;

    // Check if we already have this version cached
    if (versionCache.has(version)) {
      const cached = versionCache.get(version);
      setAnalysisResults(cached);
      setMermaidCode(sanitizeMermaidDiagram(generateMermaidDiagram(cached, granularityLevel)));
      setAnalyzedBranch(cached.git_ref || version);

      // Update available methods for call flow
      if (cached.code_facts?.function_calls) {
        const methods = Array.from(new Set(
          cached.code_facts.function_calls
            .map((call: any) => call.from_function)
            .filter((m: string) => m)
        )).sort();
        setAvailableMethods(methods as string[]);
      }

      toast({
        title: "Version Loaded",
        description: `Switched to ${version} (cached)`,
      });
      return;
    }

    // Analyze new version
    setIsLoadingVersion(true);
    try {
      const result = await analyzeBranch(currentRepoPath, version);
      const { results } = result as any;

      // Cache the result
      const newCache = new Map(versionCache);
      newCache.set(version, results);
      setVersionCache(newCache);

      // Update UI
      setAnalysisResults(results);
      setMermaidCode(sanitizeMermaidDiagram(generateMermaidDiagram(results, granularityLevel)));
      setAnalyzedBranch(results.git_ref || version);

      // Update available methods for call flow
      if (results.code_facts?.function_calls) {
        const methods = Array.from(new Set(
          results.code_facts.function_calls
            .map((call: any) => call.from_function)
            .filter((m: string) => m)
        )).sort();
        setAvailableMethods(methods as string[]);
      }

      setIsLoadingVersion(false);
      toast({
        title: "Version Loaded",
        description: `Analyzed ${results.file_count || 0} files from ${version}`,
      });
    } catch (error) {
      setIsLoadingVersion(false);
      toast({
        title: "Analysis Failed",
        description: `Failed to analyze ${version}`,
        variant: "destructive",
      });
    }
  };

  const analyzeBranch = async (repoPath: string, branch: string) => {
    // Start analysis
    const response = await fetch('http://localhost:8000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo_path: repoPath,
        git_ref: branch || "main",
        scope_filters: [
          // JavaScript/TypeScript
          "**/*.js", "**/*.ts", "**/*.tsx", "**/*.jsx", "**/*.mjs", "**/*.cjs",
          "**/*.vue", "**/*.svelte",
          // Python
          "**/*.py", "**/*.pyx", "**/*.pyw",
          // Java/JVM
          "**/*.java", "**/*.scala", "**/*.kt", "**/*.groovy",
          // C/C++
          "**/*.c", "**/*.cpp", "**/*.cc", "**/*.cxx", "**/*.h", "**/*.hpp", "**/*.hxx",
          // C#/.NET
          "**/*.cs", "**/*.vb", "**/*.fs",
          // Go
          "**/*.go",
          // Rust
          "**/*.rs",
          // Ruby
          "**/*.rb", "**/*.rake",
          // PHP
          "**/*.php",
          // Swift/Objective-C
          "**/*.swift", "**/*.m", "**/*.mm",
          // Database/SQL
          "**/*.sql", "**/*.psql", "**/*.plsql", "**/*.mysql", "**/*.pgsql",
          // Shell/Scripts
          "**/*.sh", "**/*.bash", "**/*.zsh",
          // R/MATLAB
          "**/*.r", "**/*.R", "**/*.m",
          // Dart/Flutter
          "**/*.dart",
          // Elixir/Erlang
          "**/*.ex", "**/*.exs", "**/*.erl",
          // Lua
          "**/*.lua",
          // HTML/CSS (for web frameworks)
          "**/*.html", "**/*.css", "**/*.scss", "**/*.sass", "**/*.less"
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Analysis failed: ${response.status}`);
    }

    const data = await response.json();
    const jobId = data.job_id;

    // Poll for results
    return new Promise((resolve, reject) => {
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(`http://localhost:8000/api/jobs/${jobId}`);
          const statusData = await statusResponse.json();

          if (statusData.status === 'completed') {
            clearInterval(pollInterval);
            const resultsResponse = await fetch(`http://localhost:8000/api/results/${jobId}`);
            const results = await resultsResponse.json();
            resolve({ jobId, results });
          } else if (statusData.status === 'failed') {
            clearInterval(pollInterval);
            reject(new Error(statusData.error || 'Analysis failed'));
          }
        } catch (error) {
          clearInterval(pollInterval);
          reject(error);
        }
      }, 2000);

      setTimeout(() => {
        clearInterval(pollInterval);
        reject(new Error('Analysis timeout'));
      }, 300000);
    });
  };

  const handleSubmit = async () => {
    // Validation: Check if URL or file is provided
    if (inputType === "url" && !url.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a repository URL before submitting.",
        variant: "destructive",
      });
      return;
    }

    // Validate URL format
    if (inputType === "url") {
      const urlPattern = /^(https?:\/\/)?(github\.com|gitlab\.com|bitbucket\.org)/i;
      const isValidPath = url.startsWith('/') || url.startsWith('.');

      if (!urlPattern.test(url) && !isValidPath) {
        toast({
          title: "Invalid Repository URL",
          description: "Please enter a valid Git repository URL (GitHub, GitLab, Bitbucket) or local path.",
          variant: "destructive",
        });
        return;
      }
    }

    if (inputType === "upload" && !file) {
      toast({
        title: "File Required",
        description: "Please upload a codebase file before submitting.",
        variant: "destructive",
      });
      return;
    }

    // Reset git history state before starting new analysis
    setAvailableVersions({ branches: [], tags: [], recentCommits: [] });
    setVersionCache(new Map());
    setCurrentRepoPath("");

    setIsLoading(true);

    try {
      let repoPath = url;

      // If uploading a file, first upload it to the backend
      if (inputType === "upload" && file) {
        const formData = new FormData();
        formData.append('file', file);

        const uploadResponse = await fetch('http://localhost:8000/api/upload', {
          method: 'POST',
          body: formData
        });

        if (!uploadResponse.ok) {
          throw new Error(`File upload failed: ${uploadResponse.status}`);
        }

        const uploadData = await uploadResponse.json();
        repoPath = uploadData.path; // Use the extracted path
      }

      // Comparison mode: analyze both branches
      if (compareMode) {
        toast({
          title: "Comparing Versions...",
          description: `Analyzing ${gitRef} and ${gitRefB}`,
        });

        const [resultA, resultB] = await Promise.all([
          analyzeBranch(repoPath, gitRef),
          analyzeBranch(repoPath, gitRefB)
        ]);

        const { jobId: jobIdA, results: resultsA } = resultA as any;
        const { jobId: jobIdB, results: resultsB } = resultB as any;

        // Validate both have diagrams
        if (!resultsA.mermaid_diagram || !resultsB.mermaid_diagram) {
          setIsLoading(false);
          toast({
            title: "Analysis Incomplete",
            description: "One or both analyses failed to generate diagrams",
            variant: "destructive",
          });
          return;
        }

        // Calculate diff stats
        const filesA = new Set(resultsA.dependency_graph?.nodes?.map((n: any) => n.id) || []);
        const filesB = new Set(resultsB.dependency_graph?.nodes?.map((n: any) => n.id) || []);

        const added = Array.from(filesB).filter(f => !filesA.has(f));
        const removed = Array.from(filesA).filter(f => !filesB.has(f));
        const unchanged = Array.from(filesA).filter(f => filesB.has(f));

        setDiffStats({
          filesAdded: added.length,
          filesRemoved: removed.length,
          filesUnchanged: unchanged.length,
          symbolsA: resultsA.symbol_count || 0,
          symbolsB: resultsB.symbol_count || 0,
          addedFiles: added,
          removedFiles: removed
        });

        // Store both results
        setAnalysisResults(resultsA);
        setAnalysisResultsB(resultsB);
        setMermaidCode(sanitizeMermaidDiagram(generateMermaidDiagram(resultsA, granularityLevel)));
        setMermaidCodeB(sanitizeMermaidDiagram(generateMermaidDiagram(resultsB, granularityLevel)));
        setCurrentJobId(jobIdA);
        setCurrentJobIdB(jobIdB);
        setAnalyzedBranch(resultsA.git_ref || gitRef);
        setAnalyzedBranchB(resultsB.git_ref || gitRefB);

        setIsLoading(false);
        setShowResults(true);

        toast({
          title: "Comparison Complete!",
          description: `${added.length} added, ${removed.length} removed, ${unchanged.length} unchanged`,
        });
      } else {
        // Single mode: analyze one branch
        const result = await analyzeBranch(repoPath, gitRef);
        const { jobId, results } = result as any;

        console.log("Backend results:", results);

        // Extract mermaid diagram from results
        const mermaidDiagram = results.mermaid_diagram;

        if (!mermaidDiagram || mermaidDiagram.trim() === "") {
          setIsLoading(false);

          const errorMsg = results.errors?.join(", ") || "No architecture diagram generated";
          toast({
            title: "Analysis Incomplete",
            description: errorMsg,
            variant: "destructive",
          });

          console.error("Analysis errors:", results.errors);
          console.error("Full results:", results);
          return;
        }

        setAnalysisResults(results);
        setMermaidCode(sanitizeMermaidDiagram(generateMermaidDiagram(results, granularityLevel)));
        setCurrentJobId(jobId);
        setAnalyzedBranch(results.git_ref || gitRef || "main");

        // Store repo path and cache this version
        setCurrentRepoPath(repoPath);
        const newCache = new Map();
        newCache.set(results.git_ref || gitRef || "main", results);
        setVersionCache(newCache);

        // Fetch git history for version navigation
        await fetchGitHistory(repoPath);

        setIsLoading(false);
        setShowResults(true);

        // Fetch available methods for call flow
        if (results.code_facts?.function_calls) {
          const methods = Array.from(new Set(
            results.code_facts.function_calls
              .map((call: any) => call.from_function)
              .filter((m: string) => m)
          )).sort();
          setAvailableMethods(methods as string[]);
        }

        toast({
          title: "Analysis Complete!",
          description: `Analyzed ${results.file_count || 0} files (${results.symbol_count || 0} symbols) from ${results.git_ref || gitRef || 'main'} branch`,
        });
      }

    } catch (error) {
      console.error('Error calling backend:', error);

      // Show detailed error message
      const errorMessage = error instanceof Error ? error.message : "Failed to connect to backend";

      toast({
        title: "Backend Error",
        description: `${errorMessage}. Make sure backend is running on http://localhost:8000`,
        variant: "destructive",
      });
      setIsLoading(false);

      // DON'T show sample diagram on error - let user know there's a problem
      // setMermaidCode(SAMPLE_MERMAID);
      // setShowResults(true);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mermaidCode);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Mermaid syntax copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleExport = async (format: 'png' | 'svg') => {
    const element = document.getElementById('mermaid-preview');
    if (!element) return;

    try {
      let dataUrl: string;
      if (format === 'png') {
        // High quality export with 3x pixel ratio for crisp images
        dataUrl = await toPng(element, {
          quality: 1.0,
          pixelRatio: 3,
          backgroundColor: 'hsl(220, 15%, 11%)',
          width: element.scrollWidth,
          height: element.scrollHeight
        });
      } else {
        dataUrl = await toSvg(element, {
          backgroundColor: 'hsl(220, 15%, 11%)',
          width: element.scrollWidth,
          height: element.scrollHeight
        });
      }

      const link = document.createElement('a');
      link.download = `cortex-diagram.${format}`;
      link.href = dataUrl;
      link.click();

      toast({
        title: "Exported!",
        description: `High-quality diagram exported as ${format.toUpperCase()}`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Error",
        description: "Failed to export diagram",
        variant: "destructive",
      });
    }
  };

  const handleOpenInNewTab = () => openDiagramInNewTab(mermaidCode, toast);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleNewAnalysis = () => {
    // Reset all state to go back to the initial form
    setShowResults(false);
    setMermaidCode("");
    setMermaidCodeB("");
    setUrl("");
    setFile(null);
    setGitRef("main");
    setGitRefB("dev");
    setAnalyzedBranch("");
    setAnalyzedBranchB("");
    setSelectedMethod("");
    setCallFlowData(null);
    setAvailableMethods([]);
    setDiffStats(null);
    setCompareMode(false);
    setAnalysisResults(null);
    setAnalysisResultsB(null);
    setCurrentRepoPath("");
    setAvailableVersions({ branches: [], tags: [], recentCommits: [] });
    setVersionCache(new Map());
    setIsLoadingVersion(false);
    setGranularityLevel(1);
  };

  const handleMethodSelect = async (methodName: string) => {
    if (!currentJobId || !methodName) {
      setCallFlowData(null);
      setSelectedMethod("");
      return;
    }

    setSelectedMethod(methodName);

    try {
      const response = await fetch(
        `http://localhost:8000/api/results/${currentJobId}/callflow/${encodeURIComponent(methodName)}?max_depth=5`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch call flow: ${response.status}`);
      }

      const data = await response.json();
      setCallFlowData(data);

      toast({
        title: "Call Flow Loaded",
        description: `Found ${data.total_calls || 0} function calls from ${methodName}`,
      });
    } catch (error) {
      console.error("Error fetching call flow:", error);
      toast({
        title: "Error",
        description: "Failed to fetch call flow data",
        variant: "destructive",
      });
      setCallFlowData(null);
    }
  };

  // Multi-game state
  const [currentGameIndex, setCurrentGameIndex] = useState(0);
  const [gameScore, setGameScore] = useState(0);
  const [gameComplete, setGameComplete] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Game 1: Memory Match state
  const [memoryCards, setMemoryCards] = useState<Array<{ id: number; symbol: string; flipped: boolean; matched: boolean }>>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [memoryMoves, setMemoryMoves] = useState(0);

  // Game 2: Circuit Connector state
  const [circuitNodes, setCircuitNodes] = useState<Array<{ id: number; x: number; y: number; type: 'source' | 'target' | 'node' }>>([]);
  const [circuitPaths, setCircuitPaths] = useState<Array<{ from: number; to: number }>>([]);
  const [selectedCircuitNode, setSelectedCircuitNode] = useState<number | null>(null);

  // Game 3: Graph Traversal state
  const [graphNodes, setGraphNodes] = useState<Array<{ id: number; x: number; y: number; label: string }>>([]);
  const [graphEdges, setGraphEdges] = useState<Array<{ from: number; to: number }>>([]);
  const [playerPath, setPlayerPath] = useState<number[]>([]);
  const [targetNode, setTargetNode] = useState<number | null>(null);

  // Game 4: Color Rush state
  const [colorWord, setColorWord] = useState({ text: '', color: '' });
  const [colorScore, setColorScore] = useState(0);
  const [colorRound, setColorRound] = useState(0);

  // Game initialization functions
  const initializeMemoryMatch = () => {
    const symbols = ['{}', '[]', '()', '<>', '//', '/**/'];
    const pairs = [...symbols, ...symbols];
    const shuffled = pairs.sort(() => Math.random() - 0.5);
    setMemoryCards(shuffled.map((symbol, i) => ({
      id: i,
      symbol,
      flipped: false,
      matched: false
    })));
    setFlippedCards([]);
    setMemoryMoves(0);
  };

  const initializeCircuitConnector = () => {
    const nodes = [
      { id: 0, x: 50, y: 200, type: 'source' as const },
      { id: 1, x: 200, y: 100, type: 'node' as const },
      { id: 2, x: 200, y: 300, type: 'node' as const },
      { id: 3, x: 350, y: 150, type: 'node' as const },
      { id: 4, x: 350, y: 250, type: 'node' as const },
      { id: 5, x: 450, y: 200, type: 'target' as const },
    ];
    setCircuitNodes(nodes);
    setCircuitPaths([]);
    setSelectedCircuitNode(null);
  };

  const initializeGraphTraversal = () => {
    const nodes = [
      { id: 0, x: 50, y: 200, label: 'A' },
      { id: 1, x: 150, y: 100, label: 'B' },
      { id: 2, x: 150, y: 300, label: 'C' },
      { id: 3, x: 250, y: 150, label: 'D' },
      { id: 4, x: 250, y: 250, label: 'E' },
      { id: 5, x: 350, y: 200, label: 'F' },
      { id: 6, x: 450, y: 200, label: 'G' },
    ];
    const edges = [
      { from: 0, to: 1 }, { from: 0, to: 2 },
      { from: 1, to: 3 }, { from: 2, to: 4 },
      { from: 3, to: 5 }, { from: 4, to: 5 },
      { from: 5, to: 6 }
    ];
    setGraphNodes(nodes);
    setGraphEdges(edges);
    setPlayerPath([0]);
    setTargetNode(6);
  };

  const initializeColorRush = () => {
    const colors = ['red', 'blue', 'green', 'yellow', 'purple'];
    const randomText = colors[Math.floor(Math.random() * colors.length)];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    setColorWord({ text: randomText, color: randomColor });
    setColorScore(0);
    setColorRound(0);
  };

  const initializeCurrentGame = () => {
    setGameComplete(false);
    switch (currentGameIndex) {
      case 0: initializeMemoryMatch(); break;
      case 1: initializeCircuitConnector(); break;
      case 2: initializeGraphTraversal(); break;
      case 3: initializeColorRush(); break;
    }
  };

  const moveToNextGame = () => {
    setGameScore((prev) => prev + 50);
    setGameComplete(true);
    setTimeout(() => {
      setCurrentGameIndex((prev) => (prev + 1) % 4);
      setGameComplete(false);
    }, 2000);
  };

  // Initialize games when loading starts
  useEffect(() => {
    if (isLoading) {
      setGameScore(0);
      setCurrentGameIndex(0);
      initializeCurrentGame();
    }
  }, [isLoading]);

  // Initialize when game changes
  useEffect(() => {
    if (isLoading && !gameComplete) {
      initializeCurrentGame();
    }
  }, [currentGameIndex]);

  // Check Memory Match completion
  useEffect(() => {
    if (currentGameIndex === 0 && memoryCards.length > 0) {
      const allMatched = memoryCards.every(card => card.matched);
      if (allMatched) {
        moveToNextGame();
      }
    }
  }, [memoryCards, currentGameIndex]);

  // Check Circuit Connector completion
  useEffect(() => {
    if (currentGameIndex === 1 && circuitNodes.length > 0) {
      const source = circuitNodes.find(n => n.type === 'source');
      const target = circuitNodes.find(n => n.type === 'target');
      if (source && target) {
        const pathExists = checkPathExists(source.id, target.id, circuitPaths);
        if (pathExists) {
          moveToNextGame();
        }
      }
    }
  }, [circuitPaths, currentGameIndex]);

  // Check Graph Traversal completion
  useEffect(() => {
    if (currentGameIndex === 2 && playerPath.length > 0 && targetNode !== null) {
      if (playerPath[playerPath.length - 1] === targetNode) {
        moveToNextGame();
      }
    }
  }, [playerPath, currentGameIndex]);

  // Check Color Rush completion (10 rounds)
  useEffect(() => {
    if (currentGameIndex === 3 && colorRound >= 10) {
      moveToNextGame();
    }
  }, [colorRound, currentGameIndex]);

  const checkPathExists = (start: number, end: number, paths: Array<{ from: number; to: number }>): boolean => {
    const visited = new Set<number>();
    const queue = [start];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === end) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      paths.forEach(path => {
        if (path.from === current && !visited.has(path.to)) {
          queue.push(path.to);
        }
        if (path.to === current && !visited.has(path.from)) {
          queue.push(path.from);
        }
      });
    }
    return false;
  };

  // Draw canvas based on current game
  useEffect(() => {
    if (!isLoading || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    switch (currentGameIndex) {
      case 1: // Circuit Connector
        drawCircuitConnector(ctx);
        break;
      case 2: // Graph Traversal
        drawGraphTraversal(ctx);
        break;
    }
  }, [currentGameIndex, circuitNodes, circuitPaths, selectedCircuitNode, graphNodes, graphEdges, playerPath, isLoading]);

  const drawCircuitConnector = (ctx: CanvasRenderingContext2D) => {
    // Draw paths
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 3;
    circuitPaths.forEach(path => {
      const from = circuitNodes.find(n => n.id === path.from);
      const to = circuitNodes.find(n => n.id === path.to);
      if (from && to) {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    });

    // Draw nodes
    circuitNodes.forEach(node => {
      ctx.beginPath();
      ctx.arc(node.x, node.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = node.type === 'source' ? '#00FF00' : node.type === 'target' ? '#FF0000' : '#1A2332';
      ctx.fill();
      ctx.strokeStyle = selectedCircuitNode === node.id ? '#FFFF00' : '#00E5FF';
      ctx.lineWidth = selectedCircuitNode === node.id ? 4 : 2;
      ctx.stroke();

      // Draw label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = node.type === 'source' ? 'S' : node.type === 'target' ? 'T' : node.id.toString();
      ctx.fillText(label, node.x, node.y);
    });
  };

  const drawGraphTraversal = (ctx: CanvasRenderingContext2D) => {
    // Draw edges
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    graphEdges.forEach(edge => {
      const from = graphNodes.find(n => n.id === edge.from);
      const to = graphNodes.find(n => n.id === edge.to);
      if (from && to) {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    });

    // Draw player path
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 4;
    for (let i = 0; i < playerPath.length - 1; i++) {
      const from = graphNodes.find(n => n.id === playerPath[i]);
      const to = graphNodes.find(n => n.id === playerPath[i + 1]);
      if (from && to) {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }

    // Draw nodes
    graphNodes.forEach(node => {
      ctx.beginPath();
      ctx.arc(node.x, node.y, 25, 0, Math.PI * 2);

      const isInPath = playerPath.includes(node.id);
      const isTarget = node.id === targetNode;
      const isCurrent = playerPath[playerPath.length - 1] === node.id;

      ctx.fillStyle = isTarget ? '#FF0000' : isInPath ? '#00E5FF' : '#1A2332';
      ctx.fill();
      ctx.strokeStyle = isCurrent ? '#FFFF00' : '#00E5FF';
      ctx.lineWidth = isCurrent ? 4 : 2;
      ctx.stroke();

      // Draw label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.label, node.x, node.y);
    });
  };

  // Game interaction handlers
  const handleMemoryCardClick = (cardId: number) => {
    if (flippedCards.length >= 2) return;
    if (flippedCards.includes(cardId)) return;
    if (memoryCards[cardId].matched) return;

    const newFlipped = [...flippedCards, cardId];
    setFlippedCards(newFlipped);

    const newCards = memoryCards.map(card =>
      card.id === cardId ? { ...card, flipped: true } : card
    );
    setMemoryCards(newCards);

    if (newFlipped.length === 2) {
      setMemoryMoves(memoryMoves + 1);
      const [first, second] = newFlipped;
      if (memoryCards[first].symbol === memoryCards[second].symbol) {
        // Match found
        setTimeout(() => {
          setMemoryCards(cards => cards.map(card =>
            card.id === first || card.id === second ? { ...card, matched: true } : card
          ));
          setFlippedCards([]);
          setGameScore(prev => prev + 10);
        }, 500);
      } else {
        // No match
        setTimeout(() => {
          setMemoryCards(cards => cards.map(card =>
            card.id === first || card.id === second ? { ...card, flipped: false } : card
          ));
          setFlippedCards([]);
        }, 1000);
      }
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (currentGameIndex === 1) {
      // Circuit Connector
      const clickedNode = circuitNodes.find(node => {
        const distance = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2);
        return distance <= 20;
      });

      if (clickedNode) {
        if (selectedCircuitNode === null) {
          setSelectedCircuitNode(clickedNode.id);
        } else if (selectedCircuitNode === clickedNode.id) {
          setSelectedCircuitNode(null);
        } else {
          // Check if path already exists
          const pathExists = circuitPaths.some(
            p => (p.from === selectedCircuitNode && p.to === clickedNode.id) ||
                 (p.from === clickedNode.id && p.to === selectedCircuitNode)
          );
          if (!pathExists) {
            setCircuitPaths([...circuitPaths, { from: selectedCircuitNode, to: clickedNode.id }]);
            setGameScore(prev => prev + 5);
          }
          setSelectedCircuitNode(null);
        }
      }
    } else if (currentGameIndex === 2) {
      // Graph Traversal
      const clickedNode = graphNodes.find(node => {
        const distance = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2);
        return distance <= 25;
      });

      if (clickedNode) {
        const currentNode = playerPath[playerPath.length - 1];
        const isAdjacent = graphEdges.some(
          e => (e.from === currentNode && e.to === clickedNode.id) ||
               (e.from === clickedNode.id && e.to === currentNode)
        );

        if (isAdjacent && !playerPath.includes(clickedNode.id)) {
          setPlayerPath([...playerPath, clickedNode.id]);
          setGameScore(prev => prev + 10);
        }
      }
    }
  };

  const handleColorClick = (color: string) => {
    const isCorrect = color === colorWord.color;
    if (isCorrect) {
      setColorScore(prev => prev + 1);
      setGameScore(prev => prev + 10);
    }
    setColorRound(prev => prev + 1);

    // Next round
    const colors = ['red', 'blue', 'green', 'yellow', 'purple'];
    const randomText = colors[Math.floor(Math.random() * colors.length)];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    setColorWord({ text: randomText, color: randomColor });
  };

  if (isLoading) {
    const gameNames = ['Memory Match', 'Circuit Connector', 'Graph Traversal', 'Color Rush'];
    const gameInstructions = [
      'Match pairs of programming symbols!',
      'Connect source (green) to target (red)!',
      'Find the shortest path from A to G!',
      'Click the COLOR of the text, not the word!'
    ];

    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-8 max-w-2xl">
          {/* Multi-gear loading animation */}
          <div className="relative w-32 h-32 mx-auto">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-24 h-24 border-4 border-primary rounded-full flex items-center justify-center animate-spin" style={{ animationDuration: '3s' }}>
                <div className="w-4 h-4 bg-primary rounded-full" />
                <div className="absolute w-6 h-1 bg-primary rotate-0" />
                <div className="absolute w-6 h-1 bg-primary rotate-45" />
                <div className="absolute w-6 h-1 bg-primary rotate-90" />
                <div className="absolute w-6 h-1 bg-primary rotate-[135deg]" />
              </div>
            </div>
            <div className="absolute top-0 right-0 w-12 h-12 border-2 border-secondary rounded-full flex items-center justify-center animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }}>
              <div className="w-2 h-2 bg-secondary rounded-full" />
              <div className="absolute w-3 h-0.5 bg-secondary rotate-0" />
              <div className="absolute w-3 h-0.5 bg-secondary rotate-60" />
              <div className="absolute w-3 h-0.5 bg-secondary rotate-[120deg]" />
            </div>
            <div className="absolute bottom-0 left-0 w-12 h-12 border-2 border-accent rounded-full flex items-center justify-center animate-spin" style={{ animationDuration: '2.5s', animationDirection: 'reverse' }}>
              <div className="w-2 h-2 bg-accent rounded-full" />
              <div className="absolute w-3 h-0.5 bg-accent rotate-0" />
              <div className="absolute w-3 h-0.5 bg-accent rotate-60" />
              <div className="absolute w-3 h-0.5 bg-accent rotate-[120deg]" />
            </div>
          </div>

          <p className="text-lg text-muted-foreground tracking-wide">
            {QUIRKY_QUOTES[currentQuote]}
          </p>

          {/* Multi-Game Container */}
          <div className="mt-8 p-6 bg-card border border-primary/30 rounded-lg relative">
            {/* Celebration overlay */}
            {gameComplete && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/95 rounded-lg z-10 backdrop-blur-sm">
                <div className="text-center space-y-4 animate-bounce">
                  <div className="text-6xl">🎉</div>
                  <div className="text-3xl font-bold text-primary">Complete!</div>
                  <div className="text-sm text-muted-foreground">Moving to next game...</div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium text-foreground">{gameNames[currentGameIndex]}</h3>
                <span className="text-xs text-muted-foreground">Game {currentGameIndex + 1}/4</span>
              </div>
              <span className="text-xs text-muted-foreground">Total Score: <span className="text-primary font-bold">{gameScore}</span></span>
            </div>

            {/* Game 0: Memory Match */}
            {currentGameIndex === 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-3 max-w-md mx-auto">
                  {memoryCards.map(card => (
                    <button
                      key={card.id}
                      onClick={() => handleMemoryCardClick(card.id)}
                      disabled={card.matched || card.flipped}
                      className={`h-20 rounded-lg border-2 flex items-center justify-center text-2xl font-mono font-bold transition-all ${
                        card.matched
                          ? 'bg-green-500/20 border-green-500 text-green-500'
                          : card.flipped
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'bg-card border-border hover:border-primary/50 text-transparent'
                      }`}
                    >
                      {(card.flipped || card.matched) ? card.symbol : '?'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Moves: {memoryMoves}</p>
              </div>
            )}

            {/* Game 1: Circuit Connector */}
            {currentGameIndex === 1 && (
              <div className="space-y-4">
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={400}
                  onClick={handleCanvasClick}
                  className="border border-border rounded cursor-pointer bg-background/50 mx-auto"
                />
                <p className="text-xs text-muted-foreground">
                  Click nodes to connect them. Create a path from source to target!
                </p>
              </div>
            )}

            {/* Game 2: Graph Traversal */}
            {currentGameIndex === 2 && (
              <div className="space-y-4">
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={400}
                  onClick={handleCanvasClick}
                  className="border border-border rounded cursor-pointer bg-background/50 mx-auto"
                />
                <p className="text-xs text-muted-foreground">
                  Click adjacent nodes to build your path. Reach node G from A!
                </p>
              </div>
            )}

            {/* Game 3: Color Rush */}
            {currentGameIndex === 3 && (
              <div className="space-y-6">
                <div className="bg-background/50 border border-border rounded-lg p-8">
                  <p className="text-6xl font-bold mb-6" style={{ color: colorWord.color }}>
                    {colorWord.text.toUpperCase()}
                  </p>
                  <div className="flex gap-3 justify-center flex-wrap">
                    {['red', 'blue', 'green', 'yellow', 'purple'].map(color => (
                      <button
                        key={color}
                        onClick={() => handleColorClick(color)}
                        className="px-6 py-3 rounded-lg border-2 font-medium transition-all hover:scale-105"
                        style={{
                          backgroundColor: `${color}22`,
                          borderColor: color,
                          color: color
                        }}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-6 justify-center text-xs text-muted-foreground">
                  <span>Round: {colorRound}/10</span>
                  <span>Correct: <span className="text-primary font-bold">{colorScore}</span></span>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-4">
              💡 {gameInstructions[currentGameIndex]}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (showResults) {
    return (
      <ResultsView
        analyzedBranch={analyzedBranch}
        compareMode={compareMode}
        availableVersions={availableVersions}
        versionCache={versionCache}
        isLoadingVersion={isLoadingVersion}
        switchToVersion={switchToVersion}
        currentRepoPath={currentRepoPath}
        granularityLevel={granularityLevel}
        setGranularityLevel={setGranularityLevel}
        diffStats={diffStats}
        analysisResults={analysisResults}
        mermaidCode={mermaidCode}
        copied={copied}
        handleCopy={handleCopy}
        handleDownload={handleExport}
        handleOpenInNewTab={handleOpenInNewTab}
        selectedMethod={selectedMethod}
        availableMethods={availableMethods}
        handleMethodSelect={handleMethodSelect}
        callFlowData={callFlowData}
        isLoadingCallFlow={isLoadingCallFlow}
        handleNewAnalysis={handleNewAnalysis}
      />
    );
  }


  return (
    <AnalysisForm
      inputType={inputType}
      setInputType={setInputType}
      url={url}
      setUrl={setUrl}
      file={file}
      handleFileChange={handleFileChange}
      handleSubmit={handleSubmit}
    />
  );
};

export default Index;
