/**
 * Mermaid diagram utilities
 */

import { AnalysisResults, GranularityLevel } from "@/types/analysis";

/**
 * Sanitize Mermaid diagram to prevent rendering errors
 */
export const sanitizeMermaidDiagram = (diagram: string): string => {
  return diagram
    .replace(/[^\x20-\x7E\n\r\t]/g, '') // Remove non-printable characters
    .replace(/\r\n/g, '\n')              // Normalize line endings
    .trim();
};

/**
 * Generate Mermaid diagram from analysis results
 */
export const generateMermaidDiagram = (
  results: AnalysisResults | null,
  granularityLevel: GranularityLevel
): string => {
  if (!results) {
    return 'graph TD\nNO_DATA["No data available"]';
  }

  // If results already have a mermaid_diagram, use it
  return results.mermaid_diagram || 'graph TD\nNO_DATA["No data available"]';
};

/**
 * Export Mermaid diagram as image
 */
export const exportMermaidAsImage = async (
  elementId: string,
  filename: string,
  format: 'png' | 'svg' = 'png'
): Promise<void> => {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error('Diagram element not found');
  }

  const svgElement = element.querySelector('svg');
  if (!svgElement) {
    throw new Error('SVG element not found');
  }

  if (format === 'svg') {
    // Export as SVG
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  } else {
    // Export as PNG using html-to-image
    const { toPng } = await import('html-to-image');
    const dataUrl = await toPng(svgElement, {
      quality: 1,
      pixelRatio: 3, // High resolution
    });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
  }
};
