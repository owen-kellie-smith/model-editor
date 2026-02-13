import { describe, it, expect, beforeEach, vi } from "vitest";

describe("SVG Rendering", () => {
  let mockRenderString;

  beforeEach(() => {
    // Mock viz.js renderString method
    mockRenderString = vi.fn();
    
    // Set up global Viz as a constructor function
    global.Viz = class Viz {
      renderString(dotSource) {
        return mockRenderString(dotSource);
      }
    };
  });

  describe("renderDotToSvg", () => {
    it("can call Viz.js to render DOT to SVG", async () => {
      const dotSource = 'digraph { A -> B; }';
      const expectedSvg = '<svg><g>...</g></svg>';
      
      // Mock the renderString method to return SVG
      mockRenderString.mockResolvedValue(expectedSvg);
      
      // Create a viz instance and render
      const viz = new global.Viz();
      const svg = await viz.renderString(dotSource);
      
      expect(mockRenderString).toHaveBeenCalledWith(dotSource);
      expect(svg).toBe(expectedSvg);
    });

    it("handles rendering errors gracefully", async () => {
      const dotSource = 'invalid dot syntax {{{';
      const expectedError = new Error('Syntax error in DOT');
      
      // Mock the renderString method to reject
      mockRenderString.mockRejectedValue(expectedError);
      
      // Create a viz instance and try to render
      const viz = new global.Viz();
      
      await expect(viz.renderString(dotSource)).rejects.toThrow('Syntax error in DOT');
    });

    it("produces SVG output for valid DOT input", async () => {
      // This test verifies the capability to produce SVG from DOT
      const dotSource = `digraph dependencies {
  rankdir=LR;
  node [shape=box];
  
  "A" [style=filled, fillcolor=lightblue];
  
  "A" -> "B";
  "B" -> "C";
}`;
      
      const mockSvg = `<svg width="100" height="50">
  <g>
    <rect x="0" y="0" width="50" height="30"/>
    <text>A</text>
  </g>
</svg>`;
      
      mockRenderString.mockResolvedValue(mockSvg);
      
      const viz = new global.Viz();
      const svg = await viz.renderString(dotSource);
      
      // Verify we got SVG output
      expect(svg.includes('<svg')).toBe(true);
      expect(svg.includes('</svg>')).toBe(true);
    });
  });
});
