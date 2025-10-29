// Complete template library with all categories
export const TEMPLATE_LIBRARY = [
  // ==================== BUSINESS & BRAINSTORMING ====================
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
        { type: 'line', x1: 600, y1: 0, x2: 600, y2: 800, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 0, y1: 400, x2: 1200, y2: 400, color: '#333', lineWidth: 2 },
        { type: 'text', x: 50, y: 50, text: 'Strengths', fontSize: 24, bold: true, color: '#2e7d32' },
        { type: 'text', x: 650, y: 50, text: 'Weaknesses', fontSize: 24, bold: true, color: '#c62828' },
        { type: 'text', x: 50, y: 450, text: 'Opportunities', fontSize: 24, bold: true, color: '#1565c0' },
        { type: 'text', x: 650, y: 450, text: 'Threats', fontSize: 24, bold: true, color: '#f57c00' }
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
        { type: 'rectangle', x: 0, y: 0, width: 320, height: 500, stroke: '#333', fill: 'transparent', lineWidth: 2 },
        { type: 'text', x: 10, y: 20, text: 'Key Partners', fontSize: 18, bold: true, color: '#333' },
        { type: 'rectangle', x: 320, y: 0, width: 320, height: 250, stroke: '#333', fill: 'transparent', lineWidth: 2 },
        { type: 'text', x: 330, y: 20, text: 'Key Activities', fontSize: 18, bold: true, color: '#333' },
        { type: 'rectangle', x: 320, y: 250, width: 320, height: 250, stroke: '#333', fill: 'transparent', lineWidth: 2 },
        { type: 'text', x: 330, y: 270, text: 'Key Resources', fontSize: 18, bold: true, color: '#333' },
        { type: 'rectangle', x: 640, y: 0, width: 320, height: 500, stroke: '#333', fill: 'transparent', lineWidth: 2 },
        { type: 'text', x: 650, y: 20, text: 'Value Propositions', fontSize: 18, bold: true, color: '#333' },
        { type: 'rectangle', x: 960, y: 0, width: 320, height: 250, stroke: '#333', fill: 'transparent', lineWidth: 2 },
        { type: 'text', x: 970, y: 20, text: 'Customer Relationships', fontSize: 18, bold: true, color: '#333' },
        { type: 'rectangle', x: 960, y: 250, width: 320, height: 250, stroke: '#333', fill: 'transparent', lineWidth: 2 },
        { type: 'text', x: 970, y: 270, text: 'Channels', fontSize: 18, bold: true, color: '#333' },
        { type: 'rectangle', x: 1280, y: 0, width: 320, height: 500, stroke: '#333', fill: 'transparent', lineWidth: 2 },
        { type: 'text', x: 1290, y: 20, text: 'Customer Segments', fontSize: 18, bold: true, color: '#333' },
        { type: 'rectangle', x: 0, y: 500, width: 800, height: 500, stroke: '#333', fill: 'transparent', lineWidth: 2 },
        { type: 'text', x: 10, y: 520, text: 'Cost Structure', fontSize: 18, bold: true, color: '#333' },
        { type: 'rectangle', x: 800, y: 500, width: 800, height: 500, stroke: '#333', fill: 'transparent', lineWidth: 2 },
        { type: 'text', x: 810, y: 520, text: 'Revenue Streams', fontSize: 18, bold: true, color: '#333' }
      ]
    }
  },
  {
    id: 'mind-map',
    name: 'Mind Map',
    description: 'Central topic with branches for brainstorming',
    category: 'business',
    thumbnail: '/templates/thumbnails/mindmap.svg',
    tags: ['brainstorming', 'planning', 'creative'],
    difficulty: 'beginner',
    canvas: {
      width: 1400,
      height: 1000,
      background: '#ffffff',
      objects: [
        { type: 'circle', cx: 700, cy: 500, radius: 80, stroke: '#1565c0', fill: '#e3f2fd', lineWidth: 3 },
        { type: 'text', x: 665, y: 495, text: 'Central Topic', fontSize: 16, bold: true, color: '#1565c0' }
      ]
    }
  },
  {
    id: 'flowchart',
    name: 'Flowchart',
    description: 'Standard shapes and connectors for process diagrams',
    category: 'business',
    thumbnail: '/templates/thumbnails/flowchart.svg',
    tags: ['process', 'workflow', 'diagram'],
    difficulty: 'intermediate',
    canvas: {
      width: 1200,
      height: 1400,
      background: '#ffffff',
      objects: [
        { type: 'text', x: 20, y: 30, text: 'Flowchart Template - Add your process steps', fontSize: 18, bold: true, color: '#555' }
      ]
    }
  },
  {
    id: 'kanban-board',
    name: 'Kanban Board',
    description: 'To Do / In Progress / Done columns',
    category: 'business',
    thumbnail: '/templates/thumbnails/kanban.svg',
    tags: ['agile', 'project', 'workflow'],
    difficulty: 'beginner',
    canvas: {
      width: 1500,
      height: 900,
      background: '#f5f5f5',
      objects: [
        { type: 'rectangle', x: 50, y: 50, width: 400, height: 800, stroke: '#333', fill: '#fff3e0', lineWidth: 2 },
        { type: 'text', x: 200, y: 90, text: 'To Do', fontSize: 24, bold: true, color: '#e65100' },
        { type: 'rectangle', x: 550, y: 50, width: 400, height: 800, stroke: '#333', fill: '#e3f2fd', lineWidth: 2 },
        { type: 'text', x: 680, y: 90, text: 'In Progress', fontSize: 24, bold: true, color: '#0277bd' },
        { type: 'rectangle', x: 1050, y: 50, width: 400, height: 800, stroke: '#333', fill: '#e8f5e9', lineWidth: 2 },
        { type: 'text', x: 1210, y: 90, text: 'Done', fontSize: 24, bold: true, color: '#2e7d32' }
      ]
    }
  },
  {
    id: 'timeline',
    name: 'Timeline',
    description: 'Horizontal timeline with milestones',
    category: 'business',
    thumbnail: '/templates/thumbnails/timeline.svg',
    tags: ['planning', 'project', 'schedule'],
    difficulty: 'beginner',
    canvas: {
      width: 1600,
      height: 600,
      background: '#ffffff',
      objects: [
        { type: 'line', x1: 100, y1: 300, x2: 1500, y2: 300, color: '#333', lineWidth: 3 },
        { type: 'text', x: 700, y: 100, text: 'Project Timeline', fontSize: 28, bold: true, color: '#333' }
      ]
    }
  },

  // ==================== DESIGN & WIREFRAMES ====================
  {
    id: 'mobile-wireframe',
    name: 'Mobile App Wireframe',
    description: 'Phone frame with UI elements',
    category: 'design',
    thumbnail: '/templates/thumbnails/mobile.svg',
    tags: ['wireframe', 'mobile', 'ui'],
    difficulty: 'intermediate',
    canvas: {
      width: 1200,
      height: 1600,
      background: '#f5f5f5',
      objects: [
        { type: 'rectangle', x: 400, y: 100, width: 400, height: 800, stroke: '#333', fill: '#ffffff', lineWidth: 4, rx: 30 },
        { type: 'rectangle', x: 420, y: 130, width: 360, height: 60, stroke: '#666', fill: '#f5f5f5', lineWidth: 2 },
        { type: 'text', x: 550, y: 155, text: 'Header', fontSize: 20, color: '#666' }
      ]
    }
  },
  {
    id: 'website-layout',
    name: 'Website Layout',
    description: 'Header, sidebar, content areas',
    category: 'design',
    thumbnail: '/templates/thumbnails/website.svg',
    tags: ['wireframe', 'web', 'layout'],
    difficulty: 'beginner',
    canvas: {
      width: 1600,
      height: 1200,
      background: '#ffffff',
      objects: [
        { type: 'rectangle', x: 50, y: 50, width: 1500, height: 100, stroke: '#333', fill: '#e3f2fd', lineWidth: 2 },
        { type: 'text', x: 720, y: 95, text: 'Header', fontSize: 24, bold: true, color: '#0277bd' },
        { type: 'rectangle', x: 50, y: 170, width: 300, height: 980, stroke: '#333', fill: '#f5f5f5', lineWidth: 2 },
        { type: 'text', x: 150, y: 210, text: 'Sidebar', fontSize: 20, color: '#666' },
        { type: 'rectangle', x: 370, y: 170, width: 1180, height: 980, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        { type: 'text', x: 900, y: 210, text: 'Main Content Area', fontSize: 20, color: '#666' }
      ]
    }
  },
  {
    id: 'user-flow',
    name: 'User Flow Diagram',
    description: 'User journey template',
    category: 'design',
    thumbnail: '/templates/thumbnails/userflow.svg',
    tags: ['ux', 'flow', 'journey'],
    difficulty: 'intermediate',
    canvas: {
      width: 1400,
      height: 1000,
      background: '#ffffff',
      objects: [
        { type: 'text', x: 600, y: 50, text: 'User Flow Diagram', fontSize: 26, bold: true, color: '#333' }
      ]
    }
  },
  {
    id: 'component-library',
    name: 'Component Library',
    description: 'Reusable UI elements',
    category: 'design',
    thumbnail: '/templates/thumbnails/components.svg',
    tags: ['ui', 'components', 'design-system'],
    difficulty: 'intermediate',
    canvas: {
      width: 1400,
      height: 1200,
      background: '#f5f5f5',
      objects: [
        { type: 'text', x: 550, y: 50, text: 'Component Library', fontSize: 28, bold: true, color: '#333' }
      ]
    }
  },
  {
    id: 'storyboard',
    name: 'Storyboard',
    description: 'Sequential frames for storytelling',
    category: 'design',
    thumbnail: '/templates/thumbnails/storyboard.svg',
    tags: ['storytelling', 'animation', 'sequence'],
    difficulty: 'beginner',
    canvas: {
      width: 1600,
      height: 900,
      background: '#ffffff',
      objects: [
        { type: 'rectangle', x: 50, y: 150, width: 450, height: 300, stroke: '#333', fill: 'transparent', lineWidth: 2 },
        { type: 'text', x: 220, y: 120, text: 'Frame 1', fontSize: 20, bold: true, color: '#333' },
        { type: 'rectangle', x: 575, y: 150, width: 450, height: 300, stroke: '#333', fill: 'transparent', lineWidth: 2 },
        { type: 'text', x: 745, y: 120, text: 'Frame 2', fontSize: 20, bold: true, color: '#333' },
        { type: 'rectangle', x: 1100, y: 150, width: 450, height: 300, stroke: '#333', fill: 'transparent', lineWidth: 2 },
        { type: 'text', x: 1270, y: 120, text: 'Frame 3', fontSize: 20, bold: true, color: '#333' }
      ]
    }
  },

  // ==================== EDUCATION ====================
  {
    id: 'math-worksheet',
    name: 'Math Worksheet',
    description: 'Grid with problem spaces',
    category: 'education',
    thumbnail: '/templates/thumbnails/math.svg',
    tags: ['math', 'education', 'practice'],
    difficulty: 'beginner',
    canvas: {
      width: 1200,
      height: 1600,
      background: '#ffffff',
      objects: [
        { type: 'text', x: 450, y: 50, text: 'Math Worksheet', fontSize: 28, bold: true, color: '#333' },
        { type: 'line', x1: 100, y1: 200, x2: 1100, y2: 200, color: '#ccc', lineWidth: 1 },
        { type: 'line', x1: 100, y1: 400, x2: 1100, y2: 400, color: '#ccc', lineWidth: 1 },
        { type: 'line', x1: 100, y1: 600, x2: 1100, y2: 600, color: '#ccc', lineWidth: 1 },
        { type: 'line', x1: 100, y1: 800, x2: 1100, y2: 800, color: '#ccc', lineWidth: 1 }
      ]
    }
  },
  {
    id: 'coordinate-grid',
    name: 'Coordinate Grid',
    description: 'X/Y axis for graphing',
    category: 'education',
    thumbnail: '/templates/thumbnails/grid.svg',
    tags: ['math', 'graphing', 'coordinates'],
    difficulty: 'beginner',
    canvas: {
      width: 1200,
      height: 1200,
      background: '#ffffff',
      objects: [
        { type: 'line', x1: 600, y1: 50, x2: 600, y2: 1150, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 50, y1: 600, x2: 1150, y2: 600, color: '#333', lineWidth: 2 },
        { type: 'text', x: 1100, y: 590, text: 'X', fontSize: 24, bold: true, color: '#333' },
        { type: 'text', x: 580, y: 80, text: 'Y', fontSize: 24, bold: true, color: '#333' }
      ]
    }
  },
  {
    id: 'music-staff',
    name: 'Music Staff',
    description: 'Musical notation lines',
    category: 'education',
    thumbnail: '/templates/thumbnails/music.svg',
    tags: ['music', 'notation', 'education'],
    difficulty: 'intermediate',
    canvas: {
      width: 1400,
      height: 600,
      background: '#ffffff',
      objects: [
        { type: 'line', x1: 100, y1: 200, x2: 1300, y2: 200, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 100, y1: 250, x2: 1300, y2: 250, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 100, y1: 300, x2: 1300, y2: 300, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 100, y1: 350, x2: 1300, y2: 350, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 100, y1: 400, x2: 1300, y2: 400, color: '#333', lineWidth: 2 }
      ]
    }
  },
  {
    id: 'periodic-table',
    name: 'Periodic Table',
    description: 'Chemistry reference grid',
    category: 'education',
    thumbnail: '/templates/thumbnails/periodic.svg',
    tags: ['chemistry', 'science', 'reference'],
    difficulty: 'advanced',
    canvas: {
      width: 1800,
      height: 1000,
      background: '#ffffff',
      objects: [
        { type: 'text', x: 650, y: 50, text: 'Periodic Table of Elements', fontSize: 24, bold: true, color: '#333' }
      ]
    }
  },
  {
    id: 'language-practice',
    name: 'Language Practice',
    description: 'Vocabulary/grammar templates',
    category: 'education',
    thumbnail: '/templates/thumbnails/language.svg',
    tags: ['language', 'vocabulary', 'practice'],
    difficulty: 'beginner',
    canvas: {
      width: 1200,
      height: 1400,
      background: '#ffffff',
      objects: [
        { type: 'text', x: 450, y: 50, text: 'Language Practice', fontSize: 28, bold: true, color: '#333' },
        { type: 'rectangle', x: 100, y: 150, width: 1000, height: 200, stroke: '#333', fill: 'transparent', lineWidth: 2 },
        { type: 'text', x: 120, y: 180, text: 'Vocabulary', fontSize: 22, bold: true, color: '#666' }
      ]
    }
  },

  // ==================== ENGINEERING & DIAGRAMS ====================
  {
    id: 'system-architecture',
    name: 'System Architecture',
    description: 'Cloud services diagram',
    category: 'engineering',
    thumbnail: '/templates/thumbnails/architecture.svg',
    tags: ['cloud', 'architecture', 'system-design'],
    difficulty: 'advanced',
    canvas: {
      width: 1600,
      height: 1200,
      background: '#f5f5f5',
      objects: [
        { type: 'text', x: 600, y: 50, text: 'System Architecture', fontSize: 28, bold: true, color: '#333' }
      ]
    }
  },
  {
    id: 'network-diagram',
    name: 'Network Diagram',
    description: 'Routers, servers, connections',
    category: 'engineering',
    thumbnail: '/templates/thumbnails/network.svg',
    tags: ['network', 'infrastructure', 'diagram'],
    difficulty: 'intermediate',
    canvas: {
      width: 1400,
      height: 1000,
      background: '#ffffff',
      objects: [
        { type: 'text', x: 550, y: 50, text: 'Network Diagram', fontSize: 28, bold: true, color: '#333' }
      ]
    }
  },
  {
    id: 'uml-class-diagram',
    name: 'UML Class Diagram',
    description: 'Object-oriented design',
    category: 'engineering',
    thumbnail: '/templates/thumbnails/uml.svg',
    tags: ['uml', 'oop', 'software-design'],
    difficulty: 'advanced',
    canvas: {
      width: 1400,
      height: 1200,
      background: '#ffffff',
      objects: [
        { type: 'text', x: 550, y: 50, text: 'UML Class Diagram', fontSize: 28, bold: true, color: '#333' }
      ]
    }
  },
  {
    id: 'er-diagram',
    name: 'ER Diagram',
    description: 'Database schema design',
    category: 'engineering',
    thumbnail: '/templates/thumbnails/er.svg',
    tags: ['database', 'schema', 'data-modeling'],
    difficulty: 'intermediate',
    canvas: {
      width: 1400,
      height: 1000,
      background: '#ffffff',
      objects: [
        { type: 'text', x: 550, y: 50, text: 'Entity-Relationship Diagram', fontSize: 28, bold: true, color: '#333' }
      ]
    }
  },
  {
    id: 'circuit-diagram',
    name: 'Circuit Diagram',
    description: 'Electronic components',
    category: 'engineering',
    thumbnail: '/templates/thumbnails/circuit.svg',
    tags: ['electronics', 'circuit', 'engineering'],
    difficulty: 'advanced',
    canvas: {
      width: 1400,
      height: 1000,
      background: '#ffffff',
      objects: [
        { type: 'text', x: 550, y: 50, text: 'Circuit Diagram', fontSize: 28, bold: true, color: '#333' }
      ]
    }
  },

  // ==================== GAMES & ACTIVITIES ====================
  {
    id: 'tic-tac-toe',
    name: 'Tic-Tac-Toe',
    description: '3x3 grid game',
    category: 'games',
    thumbnail: '/templates/thumbnails/tictactoe.svg',
    tags: ['game', 'fun', 'simple'],
    difficulty: 'beginner',
    canvas: {
      width: 800,
      height: 800,
      background: '#ffffff',
      objects: [
        { type: 'line', x1: 300, y1: 100, x2: 300, y2: 700, color: '#333', lineWidth: 4 },
        { type: 'line', x1: 500, y1: 100, x2: 500, y2: 700, color: '#333', lineWidth: 4 },
        { type: 'line', x1: 100, y1: 300, x2: 700, y2: 300, color: '#333', lineWidth: 4 },
        { type: 'line', x1: 100, y1: 500, x2: 700, y2: 500, color: '#333', lineWidth: 4 }
      ]
    }
  },
  {
    id: 'chess-board',
    name: 'Chess Board',
    description: '8x8 checkered board',
    category: 'games',
    thumbnail: '/templates/thumbnails/chess.svg',
    tags: ['chess', 'game', 'strategy'],
    difficulty: 'beginner',
    canvas: {
      width: 1000,
      height: 1000,
      background: '#ffffff',
      objects: [
        { type: 'text', x: 400, y: 50, text: 'Chess Board', fontSize: 28, bold: true, color: '#333' }
      ]
    }
  },
  {
    id: 'sudoku-grid',
    name: 'Sudoku Grid',
    description: '9x9 with sections',
    category: 'games',
    thumbnail: '/templates/thumbnails/sudoku.svg',
    tags: ['sudoku', 'puzzle', 'game'],
    difficulty: 'intermediate',
    canvas: {
      width: 900,
      height: 900,
      background: '#ffffff',
      objects: [
        { type: 'line', x1: 100, y1: 100, x2: 800, y2: 100, color: '#333', lineWidth: 3 },
        { type: 'line', x1: 100, y1: 800, x2: 800, y2: 800, color: '#333', lineWidth: 3 },
        { type: 'line', x1: 100, y1: 100, x2: 100, y2: 800, color: '#333', lineWidth: 3 },
        { type: 'line', x1: 800, y1: 100, x2: 800, y2: 800, color: '#333', lineWidth: 3 },
        { type: 'line', x1: 333, y1: 100, x2: 333, y2: 800, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 566, y1: 100, x2: 566, y2: 800, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 100, y1: 333, x2: 800, y2: 333, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 100, y1: 566, x2: 800, y2: 566, color: '#333', lineWidth: 2 }
      ]
    }
  },
  {
    id: 'bingo-card',
    name: 'Bingo Card',
    description: '5x5 number grid',
    category: 'games',
    thumbnail: '/templates/thumbnails/bingo.svg',
    tags: ['bingo', 'game', 'fun'],
    difficulty: 'beginner',
    canvas: {
      width: 800,
      height: 900,
      background: '#ffffff',
      objects: [
        { type: 'text', x: 350, y: 80, text: 'BINGO', fontSize: 48, bold: true, color: '#d32f2f' },
        { type: 'rectangle', x: 150, y: 150, width: 500, height: 500, stroke: '#333', fill: 'transparent', lineWidth: 3 }
      ]
    }
  },
  {
    id: 'pictionary',
    name: 'Pictionary',
    description: 'Word bank + drawing area',
    category: 'games',
    thumbnail: '/templates/thumbnails/pictionary.svg',
    tags: ['pictionary', 'game', 'drawing'],
    difficulty: 'beginner',
    canvas: {
      width: 1400,
      height: 1000,
      background: '#ffffff',
      objects: [
        { type: 'text', x: 550, y: 50, text: 'Pictionary', fontSize: 32, bold: true, color: '#333' },
        { type: 'rectangle', x: 100, y: 150, width: 1200, height: 700, stroke: '#333', fill: '#f5f5f5', lineWidth: 3 },
        { type: 'text', x: 600, y: 500, text: 'Draw Here!', fontSize: 24, color: '#999' }
      ]
    }
  }
];

export default TEMPLATE_LIBRARY;
