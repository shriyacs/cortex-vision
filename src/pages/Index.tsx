import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Info, Copy, Download, Check, ExternalLink, GitBranch, GitCompare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import mermaid from "mermaid";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { toPng, toSvg } from 'html-to-image';

const QUIRKY_QUOTES = [
  "Imagining your vision...",
  "Consulting with the code gods...",
  "Untangling the spaghetti...",
  "Mapping the neural pathways...",
  "Brewing some architecture magic...",
  "Translating chaos into clarity...",
];

const SAMPLE_MERMAID = `graph TD
    A[Start] --> B{Is it a complex codebase?}
    B -->|Yes| C[Analyzing structure]
    B -->|No| D[Quick scan]
    C --> E[Generate diagram]
    D --> E
    E --> F[Display results]`;

const Index = () => {
  const [inputType, setInputType] = useState<"url" | "upload">("url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [gitRef, setGitRef] = useState("main");
  const [analyzedBranch, setAnalyzedBranch] = useState<string>("");

  // Comparison mode
  const [compareMode, setCompareMode] = useState(false);
  const [gitRefB, setGitRefB] = useState("dev");
  const [mermaidCodeB, setMermaidCodeB] = useState("");
  const [analyzedBranchB, setAnalyzedBranchB] = useState<string>("");
  const [currentJobIdB, setCurrentJobIdB] = useState<string | null>(null);
  const [diffStats, setDiffStats] = useState<any>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [currentQuote, setCurrentQuote] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [mermaidCode, setMermaidCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>("");
  const [availableMethods, setAvailableMethods] = useState<string[]>([]);
  const [callFlowData, setCallFlowData] = useState<any>(null);

  // Granularity levels
  const [granularityLevel, setGranularityLevel] = useState<1 | 2 | 3>(1);
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [analysisResultsB, setAnalysisResultsB] = useState<any>(null);

  // Git history navigation
  const [currentRepoPath, setCurrentRepoPath] = useState<string>("");
  const [availableVersions, setAvailableVersions] = useState<{
    branches: string[];
    tags: string[];
    recentCommits: Array<{ hash: string; message: string; date: string }>;
  }>({ branches: [], tags: [], recentCommits: [] });
  const [versionCache, setVersionCache] = useState<Map<string, any>>(new Map());
  const [isLoadingVersion, setIsLoadingVersion] = useState(false);

  const { toast } = useToast();
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

  const highlightCallFlow = () => {
    if (!callFlowData || !callFlowData.calls || callFlowData.calls.length === 0) {
      return;
    }

    // Get all files involved in the call flow
    const involvedFiles = new Set<string>();
    callFlowData.calls.forEach((call: any) => {
      if (call.file) {
        involvedFiles.add(call.file);
      }
    });

    // Find all nodes in the SVG and highlight those involved in call flow
    const svg = document.querySelector('#mermaid-preview svg');
    if (!svg) return;

    // Add a style element for highlighting if it doesn't exist
    let styleElement = document.getElementById('call-flow-styles');
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'call-flow-styles';
      document.head.appendChild(styleElement);
    }

    styleElement.textContent = `
      .call-flow-highlight {
        filter: drop-shadow(0 0 8px rgba(0, 229, 255, 0.8)) brightness(1.3);
        animation: pulse-glow 2s ease-in-out infinite;
      }
      @keyframes pulse-glow {
        0%, 100% { filter: drop-shadow(0 0 8px rgba(0, 229, 255, 0.8)) brightness(1.3); }
        50% { filter: drop-shadow(0 0 12px rgba(0, 229, 255, 1)) brightness(1.5); }
      }
    `;

    // Reset all nodes
    const allNodes = svg.querySelectorAll('.node');
    allNodes.forEach((node) => {
      node.classList.remove('call-flow-highlight');
    });

    // Highlight nodes involved in call flow
    involvedFiles.forEach((file) => {
      // Try to find node by file path (this depends on how nodes are ID'd in the mermaid diagram)
      const fileName = file.split('/').pop()?.replace(/\.[^/.]+$/, '') || '';
      const possibleIds = [
        fileName,
        file.replace(/[^a-zA-Z0-9]/g, '_'),
        file,
      ];

      possibleIds.forEach((id) => {
        const node = svg.querySelector(`[id*="${id}"]`);
        if (node && node.classList.contains('node')) {
          node.classList.add('call-flow-highlight');
        }
      });
    });
  };

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

  const fetchGitHistory = async (repoPath: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/git-history?repo=${encodeURIComponent(repoPath)}`);

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

      console.log('Available branches set to:', data.branches || []);
    } catch (error) {
      console.error('Failed to fetch git history:', error);
      // Don't show fallback branches - only show actual branches from the repo
      setAvailableVersions({
        branches: [],
        tags: [],
        recentCommits: []
      });
      console.log('Git history fetch failed - no branches available');
    }
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

  const handleOpenInNewTab = () => {
    // Create HTML page with Mermaid diagram that can be panned and zoomed
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Cortex Architecture Diagram</title>
          <script type="module">
            import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
            mermaid.initialize({
              startOnLoad: true,
              theme: 'dark',
              themeVariables: {
                darkMode: true,
                background: '#1a1a1a',
                primaryColor: '#00E5FF',
                primaryTextColor: '#fff',
                primaryBorderColor: '#00E5FF',
                lineColor: '#00E5FF',
                secondaryColor: '#B366FF',
                tertiaryColor: '#1A2332',
                fontSize: '18px',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              },
              flowchart: {
                htmlLabels: true,
                curve: 'basis',
                padding: 20,
                nodeSpacing: 80,
                rankSpacing: 80,
                diagramPadding: 20,
                useMaxWidth: false
              }
            });
          </script>
          <style>
            * {
              box-sizing: border-box;
            }
            body {
              margin: 0;
              padding: 0;
              background: #0a0a0a;
              color: #fff;
              font-family: system-ui, -apple-system, sans-serif;
              overflow: hidden;
              height: 100vh;
              width: 100vw;
            }
            .viewport {
              width: 100%;
              height: 100%;
              overflow: hidden;
              position: relative;
              cursor: grab;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .viewport.dragging {
              cursor: grabbing;
            }
            .container {
              position: absolute;
              transform-origin: center center;
              transition: transform 0.1s ease-out;
              will-change: transform;
            }
            .controls {
              position: fixed;
              top: 20px;
              right: 20px;
              background: rgba(0,0,0,0.8);
              padding: 10px;
              border-radius: 8px;
              display: flex;
              gap: 10px;
              z-index: 1000;
              border: 1px solid rgba(0, 229, 255, 0.3);
            }
            button {
              padding: 8px 16px;
              background: #00E5FF;
              color: #000;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-weight: 600;
              transition: background 0.2s;
            }
            button:hover {
              background: #00FFFF;
            }
            .mermaid {
              user-select: none;
              pointer-events: none;
            }
            .mermaid svg {
              /* Improve text rendering at high zoom levels */
              text-rendering: geometricPrecision;
              shape-rendering: geometricPrecision;
            }
            .mermaid text {
              /* Better font rendering for zoom */
              font-size: 16px !important;
              font-weight: 500;
              letter-spacing: 0.02em;
            }
            .mermaid .nodeLabel, .mermaid .edgeLabel {
              /* Enhanced readability for labels */
              font-size: 15px !important;
              font-weight: 600;
            }
            h1 {
              margin: 0;
              padding: 20px 0 20px 40px;
              font-size: 24px;
              font-weight: 300;
              letter-spacing: 0.3em;
              position: fixed;
              top: 0;
              left: 0;
              z-index: 100;
              background: rgba(10, 10, 10, 0.95);
              width: 100%;
              backdrop-filter: blur(10px);
              border-bottom: 1px solid rgba(0, 229, 255, 0.1);
            }
            .info {
              position: fixed;
              bottom: 20px;
              left: 20px;
              background: rgba(0,0,0,0.8);
              padding: 10px 15px;
              border-radius: 8px;
              font-size: 12px;
              color: #9ca3af;
              z-index: 1000;
              border: 1px solid rgba(0, 229, 255, 0.2);
            }
          </style>
        </head>
        <body>
          <h1>CORTEX</h1>
          <div class="controls">
            <button onclick="zoomIn()">Zoom In (+)</button>
            <button onclick="zoomOut()">Zoom Out (-)</button>
            <button onclick="fitToScreen()">Fit to Screen (F)</button>
            <button onclick="resetView()">Reset (R)</button>
          </div>
          <div class="info">
            💡 Click and drag to pan • Scroll to zoom (up to 15x) • Press F to fit • Press R to reset
          </div>
          <div class="zoom-indicator" id="zoom-indicator" style="position: fixed; bottom: 20px; right: 20px; background: rgba(0,0,0,0.8); padding: 10px 15px; border-radius: 8px; font-size: 14px; color: #00E5FF; z-index: 1000; border: 1px solid rgba(0, 229, 255, 0.3); font-weight: 600;">
            Zoom: <span id="zoom-value">100%</span>
          </div>
          <div class="viewport" id="viewport">
            <div class="container" id="container">
              <pre class="mermaid">
${mermaidCode}
              </pre>
            </div>
          </div>
          <script>
            let scale = 1;
            let translateX = 0;
            let translateY = 0;
            let isDragging = false;
            let startX = 0;
            let startY = 0;

            const viewport = document.getElementById('viewport');
            const container = document.getElementById('container');
            const zoomValueEl = document.getElementById('zoom-value');

            function updateTransform() {
              container.style.transform = \`translate(\${translateX}px, \${translateY}px) scale(\${scale})\`;
              // Update zoom indicator
              zoomValueEl.textContent = Math.round(scale * 100) + '%';
            }

            function zoomIn() {
              const rect = viewport.getBoundingClientRect();
              const centerX = rect.width / 2;
              const centerY = rect.height / 2;

              const pointX = (centerX - translateX) / scale;
              const pointY = (centerY - translateY) / scale;

              scale = Math.min(scale * 1.2, 15);

              translateX = centerX - pointX * scale;
              translateY = centerY - pointY * scale;

              updateTransform();
            }

            function zoomOut() {
              const rect = viewport.getBoundingClientRect();
              const centerX = rect.width / 2;
              const centerY = rect.height / 2;

              const pointX = (centerX - translateX) / scale;
              const pointY = (centerY - translateY) / scale;

              scale = Math.max(scale * 0.8, 0.1);

              translateX = centerX - pointX * scale;
              translateY = centerY - pointY * scale;

              updateTransform();
            }

            function fitToScreen() {
              // Wait for mermaid to render
              setTimeout(() => {
                const svg = container.querySelector('svg');
                if (!svg) return;

                const svgRect = svg.getBoundingClientRect();
                const viewportRect = viewport.getBoundingClientRect();

                // Account for header and padding
                const paddingLeft = 50;
                const paddingTop = 100; // Space for header
                const paddingRight = 50;
                const paddingBottom = 50;

                const availableWidth = viewportRect.width - paddingLeft - paddingRight;
                const availableHeight = viewportRect.height - paddingTop - paddingBottom;

                // Calculate scale to fit
                const scaleX = availableWidth / svgRect.width;
                const scaleY = availableHeight / svgRect.height;
                scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down

                // Position at top-left with padding
                translateX = paddingLeft;
                translateY = paddingTop;

                updateTransform();
              }, 500);
            }

            function resetView() {
              fitToScreen();
            }

            // Auto-fit on load
            window.addEventListener('load', () => {
              fitToScreen();
            });

            // Smooth scroll zoom with much higher max zoom for text readability
            viewport.addEventListener('wheel', (e) => {
              e.preventDefault();

              const rect = viewport.getBoundingClientRect();
              const mouseX = e.clientX - rect.left;
              const mouseY = e.clientY - rect.top;

              // Get point before zoom
              const pointX = (mouseX - translateX) / scale;
              const pointY = (mouseY - translateY) / scale;

              // Zoom with increased max zoom (15x) for better text readability
              const delta = e.deltaY > 0 ? 0.9 : 1.1;
              scale = Math.min(Math.max(scale * delta, 0.1), 15);

              // Adjust translation to keep mouse position fixed
              translateX = mouseX - pointX * scale;
              translateY = mouseY - pointY * scale;

              updateTransform();
            }, { passive: false });

            // Smooth pan with grab cursor
            viewport.addEventListener('mousedown', (e) => {
              isDragging = true;
              startX = e.clientX - translateX;
              startY = e.clientY - translateY;
              viewport.classList.add('dragging');
            });

            document.addEventListener('mousemove', (e) => {
              if (!isDragging) return;

              translateX = e.clientX - startX;
              translateY = e.clientY - startY;

              updateTransform();
            });

            document.addEventListener('mouseup', () => {
              isDragging = false;
              viewport.classList.remove('dragging');
            });

            // Prevent context menu
            viewport.addEventListener('contextmenu', (e) => e.preventDefault());

            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => {
              if (e.key === 'r' || e.key === 'R') {
                resetView();
              } else if (e.key === 'f' || e.key === 'F') {
                fitToScreen();
              } else if (e.key === '+' || e.key === '=') {
                zoomIn();
              } else if (e.key === '-' || e.key === '_') {
                zoomOut();
              }
            });

            // Re-fit on window resize
            window.addEventListener('resize', () => {
              fitToScreen();
            });
          </script>
        </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');

    toast({
      title: "Opened in New Tab",
      description: "Diagram opened in new tab for better viewing",
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
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
      <div className="min-h-screen bg-background flex flex-col">
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4">
          <h1 className="text-3xl font-telegraf font-light tracking-[0.3em] text-foreground">
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
              <div className="flex justify-end pt-4">
                <Button variant="outline" className="text-xs tracking-wider uppercase border-primary text-primary hover:bg-primary hover:text-primary-foreground">
                  Know More
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="flex-1 pt-24 px-8 pb-20">
          {/* Repository Name */}
          {currentRepoPath && (
            <div className="mb-8 text-center">
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
                    className="h-7 px-2 text-xs border-primary/50 text-primary hover:bg-primary/10"
                    title="Open in new tab for better viewing (pan & zoom)"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Open in Tab
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleExport('png')}
                    className="h-7 px-2 text-xs"
                    title="Download high-quality PNG (3x resolution)"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    PNG
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleExport('svg')}
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
              onClick={() => {
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
                setGranularityLevel(1);
                setAnalysisResults(null);
                setAnalysisResultsB(null);
                setCurrentRepoPath("");
                setAvailableVersions({ branches: [], tags: [], recentCommits: [] });
                setVersionCache(new Map());
                setIsLoadingVersion(false);
              }}
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
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="fixed top-8 left-1/2 -translate-x-1/2 flex items-center gap-4">
        <h1 className="text-3xl font-telegraf font-light tracking-[0.3em] text-foreground">
          CORTEX
        </h1>
        <Dialog>
          <DialogTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <Info className="h-5 w-5" />
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>About Cortex</DialogTitle>
              <DialogDescription className="text-base leading-relaxed pt-4">
                Cortex accelerates architectural discovery and onboarding by generating accurate, high level architectural diagrams from live codebases. It parses and summarizes code structure (modules, classes, services, dependencies, call graphs), aligns findings with common architectural patterns, and produces both Mermaid source and rendered images. It can time travel through Git version history to show architecture per commit/tag and visualize changes over time.
              </DialogDescription>
            </DialogHeader>
            <button className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm tracking-wider uppercase hover:bg-primary/90 transition-colors">
              Know More
            </button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="container max-w-2xl mx-auto pt-32 pb-24 px-4 flex-1 flex flex-col items-center justify-center">
        <div className="w-full space-y-8">
          <div className="flex items-center justify-end mb-8">
            <p className="text-xs tracking-widest uppercase text-muted-foreground">
              Code Analysis
            </p>
          </div>

          <Tabs value={inputType} onValueChange={(v) => setInputType(v as 'url' | 'upload')} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="url">URL</TabsTrigger>
              <TabsTrigger value="upload">Upload</TabsTrigger>
            </TabsList>
            <TabsContent value="url" className="space-y-4 mt-6">
              <div className="space-y-4">
                <Input
                  type="url"
                  placeholder="Enter repository URL (GitHub, GitLab, Bitbucket)"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full"
                />
              </div>
            </TabsContent>
            <TabsContent value="upload" className="space-y-4 mt-6">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                className="hidden"
                accept=".zip,.tar,.tar.gz"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
              >
                <p className="text-sm text-muted-foreground">
                  {file ? file.name : "Click to upload or drag and drop"}
                </p>
                <p className="text-xs text-muted-foreground mt-2">ZIP, TAR, or folder</p>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end mt-8">
            <button
              onClick={handleSubmit}
              disabled={(inputType === "url" && !url.trim()) || (inputType === "upload" && !file)}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-xs tracking-widest uppercase hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
            >
              Submit →
            </button>
          </div>
        </div>
      </div>
      
      <footer className="fixed bottom-4 left-1/2 -translate-x-1/2">
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

export default Index;
