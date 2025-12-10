/**
 * Call flow visualization utilities
 */

/**
 * Highlight nodes involved in call flow on the Mermaid diagram
 */
export const highlightCallFlow = (callFlowData: any) => {
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
