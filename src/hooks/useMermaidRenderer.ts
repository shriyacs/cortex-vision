/**
 * Custom hook for Mermaid diagram rendering
 */

import { useState, useEffect } from 'react';
import mermaid from 'mermaid';
import { AnalysisResults, GranularityLevel } from '@/types/analysis';
import { sanitizeMermaidDiagram, generateMermaidDiagram } from '@/lib/mermaid-utils';

export const useMermaidRenderer = () => {
  const [mermaidCode, setMermaidCode] = useState("");
  const [mermaidCodeB, setMermaidCodeB] = useState("");

  /**
   * Initialize Mermaid with configuration
   */
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: true,
      theme: 'dark',
      securityLevel: 'loose',
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis'
      }
    });
  }, []);

  /**
   * Render Mermaid diagram from analysis results
   */
  const renderDiagram = (
    results: AnalysisResults | null,
    granularityLevel: GranularityLevel,
    isSecondary: boolean = false
  ) => {
    if (!results) {
      const code = 'graph TD\nNO_DATA["No data available"]';
      if (isSecondary) {
        setMermaidCodeB(code);
      } else {
        setMermaidCode(code);
      }
      return;
    }

    const diagram = generateMermaidDiagram(results, granularityLevel);
    const sanitized = sanitizeMermaidDiagram(diagram);

    if (isSecondary) {
      setMermaidCodeB(sanitized);
    } else {
      setMermaidCode(sanitized);
    }

    // Trigger re-render
    setTimeout(() => {
      mermaid.contentLoaded();
    }, 100);
  };

  /**
   * Re-render diagram when DOM is ready
   */
  const reRenderDiagram = () => {
    setTimeout(() => {
      mermaid.contentLoaded();
    }, 100);
  };

  return {
    mermaidCode,
    mermaidCodeB,
    setMermaidCode,
    setMermaidCodeB,
    renderDiagram,
    reRenderDiagram,
  };
};
