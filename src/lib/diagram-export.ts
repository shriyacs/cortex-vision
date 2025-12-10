/**
 * Diagram export utilities
 */

/**
 * Open Mermaid diagram in new tab with pan/zoom controls
 */
export const openDiagramInNewTab = (mermaidCode: string, toast?: any) => {
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
          #container {
            width: 100%;
            height: 100%;
            position: relative;
            cursor: grab;
          }
          #container:active {
            cursor: grabbing;
          }
          #diagram {
            transform-origin: 0 0;
            transition: transform 0.1s ease-out;
          }
          .controls {
            position: fixed;
            top: 20px;
            right: 20px;
            display: flex;
            gap: 10px;
            z-index: 1000;
          }
          button {
            background: rgba(0, 229, 255, 0.1);
            border: 1px solid #00E5FF;
            color: #00E5FF;
            padding: 12px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 500;
            transition: all 0.2s;
            backdrop-filter: blur(10px);
          }
          button:hover {
            background: rgba(0, 229, 255, 0.2);
            transform: translateY(-2px);
          }
          button:active {
            transform: translateY(0);
          }
          .zoom-display {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0, 229, 255, 0.1);
            border: 1px solid #00E5FF;
            color: #00E5FF;
            padding: 10px 16px;
            border-radius: 8px;
            font-size: 14px;
            backdrop-filter: blur(10px);
          }
          #mermaid-content {
            padding: 40px;
          }
        </style>
      </head>
      <body>
        <div class="controls">
          <button onclick="zoomIn()">Zoom In (+)</button>
          <button onclick="zoomOut()">Zoom Out (-)</button>
          <button onclick="resetZoom()">Reset</button>
          <button onclick="fitToScreen()">Fit to Screen</button>
        </div>
        <div class="zoom-display" id="zoom-display">100%</div>
        <div id="container">
          <div id="diagram">
            <div id="mermaid-content" class="mermaid">
${mermaidCode}
            </div>
          </div>
        </div>
        <script>
          let scale = 1;
          let translateX = 0;
          let translateY = 0;
          let isDragging = false;
          let startX = 0;
          let startY = 0;

          const container = document.getElementById('container');
          const diagram = document.getElementById('diagram');
          const zoomDisplay = document.getElementById('zoom-display');

          function updateTransform() {
            diagram.style.transform = \`translate(\${translateX}px, \${translateY}px) scale(\${scale})\`;
            zoomDisplay.textContent = Math.round(scale * 100) + '%';
          }

          function zoomIn() {
            scale = Math.min(scale * 1.2, 5);
            updateTransform();
          }

          function zoomOut() {
            scale = Math.max(scale / 1.2, 0.1);
            updateTransform();
          }

          function resetZoom() {
            scale = 1;
            translateX = 0;
            translateY = 0;
            updateTransform();
          }

          function fitToScreen() {
            const containerRect = container.getBoundingClientRect();
            const diagramRect = diagram.getBoundingClientRect();
            
            const scaleX = containerRect.width / diagramRect.width;
            const scaleY = containerRect.height / diagramRect.height;
            scale = Math.min(scaleX, scaleY, 1) * 0.9;
            
            translateX = (containerRect.width - diagramRect.width * scale) / 2;
            translateY = (containerRect.height - diagramRect.height * scale) / 2;
            
            updateTransform();
          }

          // Mouse wheel zoom
          container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.max(0.1, Math.min(5, scale * delta));
            
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const dx = mouseX - translateX;
            const dy = mouseY - translateY;
            
            translateX = mouseX - dx * (newScale / scale);
            translateY = mouseY - dy * (newScale / scale);
            scale = newScale;
            
            updateTransform();
          });

          // Drag to pan
          container.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX - translateX;
            startY = e.clientY - translateY;
          });

          document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            translateX = e.clientX - startX;
            translateY = e.clientY - startY;
            updateTransform();
          });

          document.addEventListener('mouseup', () => {
            isDragging = false;
          });

          // Keyboard shortcuts
          document.addEventListener('keydown', (e) => {
            if (e.key === '+' || e.key === '=') zoomIn();
            if (e.key === '-' || e.key === '_') zoomOut();
            if (e.key === '0') resetZoom();
            if (e.key === 'f' || e.key === 'F') fitToScreen();
          });

          // Fit to screen on load
          window.addEventListener('load', () => {
            setTimeout(fitToScreen, 500);
          });
        </script>
      </body>
    </html>
  `;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');

  if (toast) {
    toast({
      title: "Opened in New Tab",
      description: "Diagram opened in new tab for better viewing",
    });
  }
};
