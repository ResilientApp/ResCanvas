// Minimal starter template library (can be expanded)
export const TEMPLATE_LIBRARY = [
  {
    id: 'swot-analysis',
    name: 'SWOT Analysis',
    description: 'Analyze Strengths, Weaknesses, Opportunities, and Threats',
    category: 'business',
    thumbnail: '/templates/thumbnails/swot.svg',
    tags: ['strategy', 'planning', 'business'],
    difficulty: 'beginner',
    canvas: {
      width: 1200,
      height: 800,
      background: '#ffffff',
      objects: [
        { type: 'line', x1: 600, y1: 0, x2: 600, y2: 800, color: '#333' },
        { type: 'line', x1: 0, y1: 400, x2: 1200, y2: 400, color: '#333' },
        { type: 'text', x: 50, y: 50, text: 'Strengths', fontSize: 24, bold: true },
        { type: 'text', x: 650, y: 50, text: 'Weaknesses', fontSize: 24, bold: true },
        { type: 'text', x: 50, y: 450, text: 'Opportunities', fontSize: 24, bold: true },
        { type: 'text', x: 650, y: 450, text: 'Threats', fontSize: 24, bold: true }
      ]
    }
  },
  {
    id: 'business-model-canvas',
    name: 'Business Model Canvas',
    description: 'Strategic management template for developing business models',
    category: 'business',
    thumbnail: '/templates/thumbnails/bmc.svg',
    tags: ['startup', 'strategy', 'business'],
    difficulty: 'intermediate',
    canvas: {
      width: 1600,
      height: 1000,
      background: '#f5f5f5',
      objects: [
        { type: 'rectangle', x: 0, y: 0, width: 320, height: 500, stroke: '#333', fill: '#fff' },
        { type: 'text', x: 10, y: 20, text: 'Key Partners', fontSize: 18, bold: true }
      ]
    }
  }
];

export default TEMPLATE_LIBRARY;
