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
        // Central topic
        { type: 'circle', cx: 700, cy: 500, radius: 80, stroke: '#1565c0', fill: '#e3f2fd', lineWidth: 3 },
        { type: 'text', x: 630, y: 495, text: 'Central Topic', fontSize: 16, bold: true, color: '#1565c0' },

        // Branch 1 - Top (Ideas)
        { type: 'line', x1: 700, y1: 420, x2: 700, y2: 250, color: '#9c27b0', lineWidth: 3 },
        { type: 'circle', cx: 700, cy: 200, radius: 60, stroke: '#9c27b0', fill: '#f3e5f5', lineWidth: 2 },
        { type: 'text', x: 665, y: 195, text: 'Ideas', fontSize: 14, bold: true, color: '#9c27b0' },
        // Sub-branch 1a
        { type: 'line', x1: 760, y1: 200, x2: 900, y2: 150, color: '#9c27b0', lineWidth: 2 },
        { type: 'circle', cx: 930, cy: 140, radius: 40, stroke: '#9c27b0', fill: '#f3e5f5', lineWidth: 1 },
        { type: 'text', x: 905, y: 137, text: 'Idea 1', fontSize: 12, color: '#9c27b0' },
        // Sub-branch 1b
        { type: 'line', x1: 760, y1: 200, x2: 900, y2: 250, color: '#9c27b0', lineWidth: 2 },
        { type: 'circle', cx: 930, cy: 260, radius: 40, stroke: '#9c27b0', fill: '#f3e5f5', lineWidth: 1 },
        { type: 'text', x: 905, y: 257, text: 'Idea 2', fontSize: 12, color: '#9c27b0' },

        // Branch 2 - Top Right (Goals)
        { type: 'line', x1: 760, y1: 450, x2: 1000, y2: 300, color: '#2e7d32', lineWidth: 3 },
        { type: 'circle', cx: 1050, cy: 270, radius: 60, stroke: '#2e7d32', fill: '#c8e6c9', lineWidth: 2 },
        { type: 'text', x: 1015, y: 265, text: 'Goals', fontSize: 14, bold: true, color: '#2e7d32' },
        // Sub-branch 2a
        { type: 'line', x1: 1100, y1: 300, x2: 1200, y2: 250, color: '#2e7d32', lineWidth: 2 },
        { type: 'circle', cx: 1230, cy: 240, radius: 40, stroke: '#2e7d32', fill: '#c8e6c9', lineWidth: 1 },
        { type: 'text', x: 1200, y: 237, text: 'Goal A', fontSize: 12, color: '#2e7d32' },
        // Sub-branch 2b
        { type: 'line', x1: 1100, y1: 300, x2: 1200, y2: 350, color: '#2e7d32', lineWidth: 2 },
        { type: 'circle', cx: 1230, cy: 360, radius: 40, stroke: '#2e7d32', fill: '#c8e6c9', lineWidth: 1 },
        { type: 'text', x: 1200, y: 357, text: 'Goal B', fontSize: 12, color: '#2e7d32' },

        // Branch 3 - Right (Tasks)
        { type: 'line', x1: 780, y1: 500, x2: 1000, y2: 500, color: '#f57c00', lineWidth: 3 },
        { type: 'circle', cx: 1050, cy: 500, radius: 60, stroke: '#f57c00', fill: '#fff3e0', lineWidth: 2 },
        { type: 'text', x: 1015, y: 495, text: 'Tasks', fontSize: 14, bold: true, color: '#f57c00' },
        // Sub-branch 3a
        { type: 'line', x1: 1100, y1: 470, x2: 1200, y2: 450, color: '#f57c00', lineWidth: 2 },
        { type: 'circle', cx: 1230, cy: 440, radius: 40, stroke: '#f57c00', fill: '#fff3e0', lineWidth: 1 },
        { type: 'text', x: 1200, y: 437, text: 'Task 1', fontSize: 12, color: '#f57c00' },

        // Branch 4 - Bottom Right (Resources)
        { type: 'line', x1: 760, y1: 550, x2: 1000, y2: 700, color: '#c62828', lineWidth: 3 },
        { type: 'circle', cx: 1050, cy: 730, radius: 60, stroke: '#c62828', fill: '#ffcdd2', lineWidth: 2 },
        { type: 'text', x: 995, y: 725, text: 'Resources', fontSize: 14, bold: true, color: '#c62828' },
        // Sub-branch 4a
        { type: 'line', x1: 1100, y1: 760, x2: 1200, y2: 800, color: '#c62828', lineWidth: 2 },
        { type: 'circle', cx: 1230, cy: 810, radius: 40, stroke: '#c62828', fill: '#ffcdd2', lineWidth: 1 },
        { type: 'text', x: 1195, y: 807, text: 'Budget', fontSize: 12, color: '#c62828' },

        // Branch 5 - Bottom (Timeline)
        { type: 'line', x1: 700, y1: 580, x2: 700, y2: 750, color: '#1565c0', lineWidth: 3 },
        { type: 'circle', cx: 700, cy: 800, radius: 60, stroke: '#1565c0', fill: '#e3f2fd', lineWidth: 2 },
        { type: 'text', x: 655, y: 795, text: 'Timeline', fontSize: 14, bold: true, color: '#1565c0' },
        // Sub-branch 5a
        { type: 'line', x1: 640, y1: 800, x2: 500, y2: 850, color: '#1565c0', lineWidth: 2 },
        { type: 'circle', cx: 470, cy: 860, radius: 40, stroke: '#1565c0', fill: '#e3f2fd', lineWidth: 1 },
        { type: 'text', x: 445, y: 857, text: 'Phase 1', fontSize: 12, color: '#1565c0' },

        // Branch 6 - Left (Challenges)
        { type: 'line', x1: 620, y1: 500, x2: 400, y2: 500, color: '#6a1b9a', lineWidth: 3 },
        { type: 'circle', cx: 350, cy: 500, radius: 60, stroke: '#6a1b9a', fill: '#f3e5f5', lineWidth: 2 },
        { type: 'text', x: 300, y: 495, text: 'Challenges', fontSize: 14, bold: true, color: '#6a1b9a' },
        // Sub-branch 6a
        { type: 'line', x1: 290, y1: 500, x2: 170, y2: 450, color: '#6a1b9a', lineWidth: 2 },
        { type: 'circle', cx: 140, cy: 440, radius: 40, stroke: '#6a1b9a', fill: '#f3e5f5', lineWidth: 1 },
        { type: 'text', x: 110, y: 437, text: 'Risk 1', fontSize: 12, color: '#6a1b9a' }
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
        // Start - Oval
        { type: 'ellipse', cx: 600, cy: 100, rx: 100, ry: 50, stroke: '#2e7d32', fill: '#c8e6c9', lineWidth: 2 },
        { type: 'text', x: 570, y: 95, text: 'Start', fontSize: 18, bold: true, color: '#1b5e20' },

        // Arrow down
        { type: 'line', x1: 600, y1: 150, x2: 600, y2: 220, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 600, y1: 220, x2: 590, y2: 210, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 600, y1: 220, x2: 610, y2: 210, color: '#333', lineWidth: 2 },

        // Process 1 - Rectangle
        { type: 'rectangle', x: 450, y: 220, width: 300, height: 80, stroke: '#1565c0', fill: '#e3f2fd', lineWidth: 2 },
        { type: 'text', x: 520, y: 255, text: 'Process Step', fontSize: 16, bold: true, color: '#0d47a1' },

        // Arrow down
        { type: 'line', x1: 600, y1: 300, x2: 600, y2: 370, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 600, y1: 370, x2: 590, y2: 360, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 600, y1: 370, x2: 610, y2: 360, color: '#333', lineWidth: 2 },

        // Decision - Diamond
        { type: 'line', x1: 600, y1: 370, x2: 750, y2: 470, color: '#f57c00', lineWidth: 2 },
        { type: 'line', x1: 750, y1: 470, x2: 600, y2: 570, color: '#f57c00', lineWidth: 2 },
        { type: 'line', x1: 600, y1: 570, x2: 450, y2: 470, color: '#f57c00', lineWidth: 2 },
        { type: 'line', x1: 450, y1: 470, x2: 600, y2: 370, color: '#f57c00', lineWidth: 2 },
        { type: 'rectangle', x: 520, y: 450, width: 160, height: 40, stroke: 'transparent', fill: '#fff3e0', lineWidth: 0 },
        { type: 'text', x: 545, y: 465, text: 'Decision?', fontSize: 16, bold: true, color: '#e65100' },

        // Yes arrow (down)
        { type: 'text', x: 610, y: 590, text: 'Yes', fontSize: 14, color: '#666' },
        { type: 'line', x1: 600, y1: 570, x2: 600, y2: 640, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 600, y1: 640, x2: 590, y2: 630, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 600, y1: 640, x2: 610, y2: 630, color: '#333', lineWidth: 2 },

        // Process 2 - Rectangle
        { type: 'rectangle', x: 450, y: 640, width: 300, height: 80, stroke: '#1565c0', fill: '#e3f2fd', lineWidth: 2 },
        { type: 'text', x: 490, y: 675, text: 'Additional Process', fontSize: 16, bold: true, color: '#0d47a1' },

        // Arrow down to end
        { type: 'line', x1: 600, y1: 720, x2: 600, y2: 790, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 600, y1: 790, x2: 590, y2: 780, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 600, y1: 790, x2: 610, y2: 780, color: '#333', lineWidth: 2 },

        // No arrow (right then down)
        { type: 'text', x: 760, y: 465, text: 'No', fontSize: 14, color: '#666' },
        { type: 'line', x1: 750, y1: 470, x2: 850, y2: 470, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 850, y1: 470, x2: 850, y2: 840, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 850, y1: 840, x2: 700, y2: 840, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 700, y1: 840, x2: 710, y2: 830, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 700, y1: 840, x2: 710, y2: 850, color: '#333', lineWidth: 2 },

        // End - Oval
        { type: 'ellipse', cx: 600, cy: 840, rx: 100, ry: 50, stroke: '#c62828', fill: '#ffcdd2', lineWidth: 2 },
        { type: 'text', x: 575, y: 835, text: 'End', fontSize: 18, bold: true, color: '#b71c1c' }
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
        { type: 'text', x: 650, y: 80, text: 'Project Timeline', fontSize: 28, bold: true, color: '#333' },

        // Main timeline horizontal line
        { type: 'line', x1: 100, y1: 300, x2: 1500, y2: 300, color: '#1565c0', lineWidth: 4 },

        // Milestone 1 - Q1 2025
        { type: 'line', x1: 200, y1: 280, x2: 200, y2: 320, color: '#2e7d32', lineWidth: 4 },
        { type: 'circle', cx: 200, cy: 300, radius: 12, stroke: '#2e7d32', fill: '#c8e6c9', lineWidth: 3 },
        { type: 'text', x: 165, y: 250, text: 'Q1 2025', fontSize: 14, bold: true, color: '#1b5e20' },
        { type: 'rectangle', x: 140, y: 340, width: 120, height: 60, stroke: '#2e7d32', fill: '#e8f5e9', lineWidth: 2, rx: 6 },
        { type: 'text', x: 155, y: 360, text: 'Project', fontSize: 13, bold: true, color: '#1b5e20' },
        { type: 'text', x: 160, y: 380, text: 'Kickoff', fontSize: 13, color: '#2e7d32' },

        // Milestone 2 - Q2 2025
        { type: 'line', x1: 450, y1: 280, x2: 450, y2: 320, color: '#1565c0', lineWidth: 4 },
        { type: 'circle', cx: 450, cy: 300, radius: 12, stroke: '#1565c0', fill: '#e3f2fd', lineWidth: 3 },
        { type: 'text', x: 415, y: 250, text: 'Q2 2025', fontSize: 14, bold: true, color: '#0d47a1' },
        { type: 'rectangle', x: 375, y: 340, width: 150, height: 60, stroke: '#1565c0', fill: '#e3f2fd', lineWidth: 2, rx: 6 },
        { type: 'text', x: 390, y: 360, text: 'Phase 1', fontSize: 13, bold: true, color: '#0d47a1' },
        { type: 'text', x: 390, y: 380, text: 'Development', fontSize: 13, color: '#1565c0' },

        // Milestone 3 - Q3 2025
        { type: 'line', x1: 750, y1: 280, x2: 750, y2: 320, color: '#f57c00', lineWidth: 4 },
        { type: 'circle', cx: 750, cy: 300, radius: 12, stroke: '#f57c00', fill: '#fff3e0', lineWidth: 3 },
        { type: 'text', x: 715, y: 250, text: 'Q3 2025', fontSize: 14, bold: true, color: '#e65100' },
        { type: 'rectangle', x: 690, y: 340, width: 120, height: 60, stroke: '#f57c00', fill: '#fff3e0', lineWidth: 2, rx: 6 },
        { type: 'text', x: 710, y: 360, text: 'Testing', fontSize: 13, bold: true, color: '#e65100' },
        { type: 'text', x: 710, y: 380, text: 'Phase', fontSize: 13, color: '#f57c00' },

        // Milestone 4 - Q4 2025
        { type: 'line', x1: 1050, y1: 280, x2: 1050, y2: 320, color: '#9c27b0', lineWidth: 4 },
        { type: 'circle', cx: 1050, cy: 300, radius: 12, stroke: '#9c27b0', fill: '#f3e5f5', lineWidth: 3 },
        { type: 'text', x: 1015, y: 250, text: 'Q4 2025', fontSize: 14, bold: true, color: '#6a1b9a' },
        { type: 'rectangle', x: 975, y: 340, width: 150, height: 60, stroke: '#9c27b0', fill: '#f3e5f5', lineWidth: 2, rx: 6 },
        { type: 'text', x: 1005, y: 360, text: 'Beta', fontSize: 13, bold: true, color: '#6a1b9a' },
        { type: 'text', x: 995, y: 380, text: 'Release', fontSize: 13, color: '#9c27b0' },

        // Milestone 5 - Q1 2026
        { type: 'line', x1: 1350, y1: 280, x2: 1350, y2: 320, color: '#c62828', lineWidth: 4 },
        { type: 'circle', cx: 1350, cy: 300, radius: 12, stroke: '#c62828', fill: '#ffcdd2', lineWidth: 3 },
        { type: 'text', x: 1315, y: 250, text: 'Q1 2026', fontSize: 14, bold: true, color: '#b71c1c' },
        { type: 'rectangle', x: 1270, y: 340, width: 160, height: 60, stroke: '#c62828', fill: '#ffebee', lineWidth: 2, rx: 6 },
        { type: 'text', x: 1290, y: 360, text: 'Full Launch', fontSize: 13, bold: true, color: '#b71c1c' },
        { type: 'text', x: 1295, y: 380, text: '& Delivery', fontSize: 13, color: '#c62828' },

        // Arrow at end
        { type: 'line', x1: 1500, y1: 300, x2: 1490, y2: 290, color: '#1565c0', lineWidth: 4 },
        { type: 'line', x1: 1500, y1: 300, x2: 1490, y2: 310, color: '#1565c0', lineWidth: 4 }
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
        { type: 'text', x: 520, y: 50, text: 'User Flow Diagram', fontSize: 26, bold: true, color: '#333' },

        // Entry Point
        { type: 'ellipse', cx: 700, cy: 150, rx: 80, ry: 40, stroke: '#2e7d32', fill: '#c8e6c9', lineWidth: 2 },
        { type: 'text', x: 630, y: 145, text: 'Entry Point', fontSize: 14, bold: true, color: '#1b5e20' },

        // Arrow
        { type: 'line', x1: 700, y1: 190, x2: 700, y2: 240, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 700, y1: 240, x2: 690, y2: 230, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 700, y1: 240, x2: 710, y2: 230, color: '#333', lineWidth: 2 },

        // Screen 1 - Login
        { type: 'rectangle', x: 550, y: 240, width: 300, height: 100, stroke: '#1565c0', fill: '#e3f2fd', lineWidth: 2, rx: 8 },
        { type: 'text', x: 650, y: 270, text: 'Login Screen', fontSize: 16, bold: true, color: '#0d47a1' },
        { type: 'text', x: 580, y: 300, text: 'User enters credentials', fontSize: 12, color: '#555' },

        // Arrow
        { type: 'line', x1: 700, y1: 340, x2: 700, y2: 390, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 700, y1: 390, x2: 690, y2: 380, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 700, y1: 390, x2: 710, y2: 380, color: '#333', lineWidth: 2 },

        // Decision Diamond - Valid Credentials?
        { type: 'line', x1: 700, y1: 390, x2: 800, y2: 470, color: '#f57c00', lineWidth: 2 },
        { type: 'line', x1: 800, y1: 470, x2: 700, y2: 550, color: '#f57c00', lineWidth: 2 },
        { type: 'line', x1: 700, y1: 550, x2: 600, y2: 470, color: '#f57c00', lineWidth: 2 },
        { type: 'line', x1: 600, y1: 470, x2: 700, y2: 390, color: '#f57c00', lineWidth: 2 },
        { type: 'rectangle', x: 630, y: 455, width: 140, height: 30, stroke: 'transparent', fill: '#fff3e0', lineWidth: 0 },
        { type: 'text', x: 643, y: 467, text: 'Valid Login?', fontSize: 14, bold: true, color: '#e65100' },

        // No Path - Back to Login
        { type: 'text', x: 510, y: 465, text: 'No', fontSize: 12, color: '#c62828', bold: true },
        { type: 'line', x1: 600, y1: 470, x2: 500, y2: 470, color: '#c62828', lineWidth: 2 },
        { type: 'line', x1: 500, y1: 470, x2: 500, y2: 290, color: '#c62828', lineWidth: 2 },
        { type: 'line', x1: 500, y1: 290, x2: 550, y2: 290, color: '#c62828', lineWidth: 2 },
        { type: 'line', x1: 550, y1: 290, x2: 540, y2: 280, color: '#c62828', lineWidth: 2 },
        { type: 'line', x1: 550, y1: 290, x2: 540, y2: 300, color: '#c62828', lineWidth: 2 },
        { type: 'text', x: 430, y: 370, text: 'Show Error', fontSize: 11, color: '#c62828' },

        // Yes Path - To Dashboard
        { type: 'text', x: 710, y: 565, text: 'Yes', fontSize: 12, color: '#2e7d32', bold: true },
        { type: 'line', x1: 700, y1: 550, x2: 700, y2: 620, color: '#2e7d32', lineWidth: 2 },
        { type: 'line', x1: 700, y1: 620, x2: 690, y2: 610, color: '#2e7d32', lineWidth: 2 },
        { type: 'line', x1: 700, y1: 620, x2: 710, y2: 610, color: '#2e7d32', lineWidth: 2 },

        // Screen 2 - Dashboard
        { type: 'rectangle', x: 550, y: 620, width: 300, height: 100, stroke: '#1565c0', fill: '#e3f2fd', lineWidth: 2, rx: 8 },
        { type: 'text', x: 640, y: 650, text: 'Dashboard', fontSize: 16, bold: true, color: '#0d47a1' },
        { type: 'text', x: 590, y: 680, text: 'User views main content', fontSize: 12, color: '#555' },

        // Action buttons from dashboard
        { type: 'line', x1: 550, y1: 720, x2: 350, y2: 820, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 350, y1: 820, x2: 360, y2: 810, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 350, y1: 820, x2: 350, y2: 810, color: '#333', lineWidth: 2 },
        { type: 'rectangle', x: 250, y: 820, width: 200, height: 70, stroke: '#9c27b0', fill: '#f3e5f5', lineWidth: 2, rx: 6 },
        { type: 'text', x: 295, y: 845, text: 'Action A', fontSize: 14, bold: true, color: '#6a1b9a' },

        { type: 'line', x1: 700, y1: 720, x2: 700, y2: 820, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 700, y1: 820, x2: 690, y2: 810, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 700, y1: 820, x2: 710, y2: 810, color: '#333', lineWidth: 2 },
        { type: 'rectangle', x: 600, y: 820, width: 200, height: 70, stroke: '#9c27b0', fill: '#f3e5f5', lineWidth: 2, rx: 6 },
        { type: 'text', x: 645, y: 845, text: 'Action B', fontSize: 14, bold: true, color: '#6a1b9a' },

        { type: 'line', x1: 850, y1: 720, x2: 1050, y2: 820, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 1050, y1: 820, x2: 1040, y2: 810, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 1050, y1: 820, x2: 1050, y2: 810, color: '#333', lineWidth: 2 },
        { type: 'rectangle', x: 950, y: 820, width: 200, height: 70, stroke: '#9c27b0', fill: '#f3e5f5', lineWidth: 2, rx: 6 },
        { type: 'text', x: 995, y: 845, text: 'Action C', fontSize: 14, bold: true, color: '#6a1b9a' }
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
        { type: 'text', x: 480, y: 50, text: 'Component Library', fontSize: 28, bold: true, color: '#333' },

        // Buttons Section
        { type: 'text', x: 100, y: 120, text: 'Buttons', fontSize: 20, bold: true, color: '#1565c0' },

        // Primary Button
        { type: 'rectangle', x: 100, y: 150, width: 150, height: 45, stroke: '#1565c0', fill: '#1565c0', lineWidth: 2, rx: 8 },
        { type: 'text', x: 140, y: 168, text: 'Primary', fontSize: 14, bold: true, color: '#ffffff' },

        // Secondary Button
        { type: 'rectangle', x: 270, y: 150, width: 150, height: 45, stroke: '#1565c0', fill: 'transparent', lineWidth: 2, rx: 8 },
        { type: 'text', x: 300, y: 168, text: 'Secondary', fontSize: 14, bold: true, color: '#1565c0' },

        // Disabled Button
        { type: 'rectangle', x: 440, y: 150, width: 150, height: 45, stroke: '#bdbdbd', fill: '#e0e0e0', lineWidth: 2, rx: 8 },
        { type: 'text', x: 475, y: 168, text: 'Disabled', fontSize: 14, bold: true, color: '#9e9e9e' },

        // Input Fields Section
        { type: 'text', x: 100, y: 240, text: 'Input Fields', fontSize: 20, bold: true, color: '#1565c0' },

        // Text Input
        { type: 'rectangle', x: 100, y: 270, width: 300, height: 45, stroke: '#bdbdbd', fill: '#ffffff', lineWidth: 2, rx: 4 },
        { type: 'text', x: 110, y: 288, text: 'Enter text...', fontSize: 14, color: '#999' },

        // Input with Label
        { type: 'text', x: 100, y: 340, text: 'Email', fontSize: 12, bold: true, color: '#555' },
        { type: 'rectangle', x: 100, y: 360, width: 300, height: 45, stroke: '#1565c0', fill: '#ffffff', lineWidth: 2, rx: 4 },
        { type: 'text', x: 110, y: 378, text: 'user@example.com', fontSize: 14, color: '#333' },

        // Cards Section
        { type: 'text', x: 700, y: 120, text: 'Cards', fontSize: 20, bold: true, color: '#1565c0' },

        // Basic Card
        { type: 'rectangle', x: 700, y: 150, width: 250, height: 180, stroke: '#e0e0e0', fill: '#ffffff', lineWidth: 2, rx: 12 },
        { type: 'text', x: 720, y: 175, text: 'Card Title', fontSize: 18, bold: true, color: '#333' },
        { type: 'line', x1: 720, y1: 190, x2: 930, y2: 190, color: '#e0e0e0', lineWidth: 1 },
        { type: 'text', x: 720, y: 210, text: 'Card content goes here.', fontSize: 13, color: '#666' },
        { type: 'text', x: 720, y: 230, text: 'Additional details and', fontSize: 13, color: '#666' },
        { type: 'text', x: 720, y: 250, text: 'information for users.', fontSize: 13, color: '#666' },
        { type: 'rectangle', x: 720, y: 285, width: 80, height: 30, stroke: '#1565c0', fill: 'transparent', lineWidth: 1, rx: 4 },
        { type: 'text', x: 740, y: 297, text: 'Action', fontSize: 12, bold: true, color: '#1565c0' },

        // Navigation Section
        { type: 'text', x: 100, y: 460, text: 'Navigation', fontSize: 20, bold: true, color: '#1565c0' },

        // Horizontal Nav Bar
        { type: 'rectangle', x: 100, y: 490, width: 850, height: 60, stroke: '#333', fill: '#1565c0', lineWidth: 2 },
        { type: 'text', x: 120, y: 518, text: 'Home', fontSize: 16, bold: true, color: '#ffffff' },
        { type: 'text', x: 240, y: 518, text: 'Products', fontSize: 16, color: '#b3d9ff' },
        { type: 'text', x: 380, y: 518, text: 'Services', fontSize: 16, color: '#b3d9ff' },
        { type: 'text', x: 520, y: 518, text: 'About', fontSize: 16, color: '#b3d9ff' },
        { type: 'text', x: 640, y: 518, text: 'Contact', fontSize: 16, color: '#b3d9ff' },

        // Checkboxes & Radio Buttons Section
        { type: 'text', x: 100, y: 600, text: 'Selection Controls', fontSize: 20, bold: true, color: '#1565c0' },

        // Checkbox unchecked
        { type: 'rectangle', x: 100, y: 630, width: 24, height: 24, stroke: '#757575', fill: '#ffffff', lineWidth: 2, rx: 4 },
        { type: 'text', x: 135, y: 643, text: 'Checkbox unchecked', fontSize: 14, color: '#333' },

        // Checkbox checked
        { type: 'rectangle', x: 100, y: 670, width: 24, height: 24, stroke: '#1565c0', fill: '#1565c0', lineWidth: 2, rx: 4 },
        { type: 'line', x1: 105, y1: 682, x2: 110, y2: 688, color: '#ffffff', lineWidth: 3 },
        { type: 'line', x1: 110, y1: 688, x2: 120, y2: 675, color: '#ffffff', lineWidth: 3 },
        { type: 'text', x: 135, y: 683, text: 'Checkbox checked', fontSize: 14, color: '#333' },

        // Radio button unchecked
        { type: 'circle', cx: 112, cy: 722, radius: 12, stroke: '#757575', fill: '#ffffff', lineWidth: 2 },
        { type: 'text', x: 135, y: 723, text: 'Radio unchecked', fontSize: 14, color: '#333' },

        // Radio button checked
        { type: 'circle', cx: 112, cy: 762, radius: 12, stroke: '#1565c0', fill: '#ffffff', lineWidth: 2 },
        { type: 'circle', cx: 112, cy: 762, radius: 6, stroke: 'transparent', fill: '#1565c0', lineWidth: 0 },
        { type: 'text', x: 135, y: 763, text: 'Radio checked', fontSize: 14, color: '#333' },

        // Alerts & Notifications Section
        { type: 'text', x: 700, y: 600, text: 'Alerts', fontSize: 20, bold: true, color: '#1565c0' },

        // Success Alert
        { type: 'rectangle', x: 700, y: 630, width: 400, height: 50, stroke: '#2e7d32', fill: '#c8e6c9', lineWidth: 2, rx: 6 },
        { type: 'text', x: 720, y: 650, text: 'Success: Operation completed!', fontSize: 14, bold: true, color: '#1b5e20' },

        // Warning Alert
        { type: 'rectangle', x: 700, y: 700, width: 400, height: 50, stroke: '#f57c00', fill: '#fff3e0', lineWidth: 2, rx: 6 },
        { type: 'text', x: 720, y: 720, text: 'Warning: Please review your input', fontSize: 14, bold: true, color: '#e65100' },

        // Error Alert
        { type: 'rectangle', x: 700, y: 770, width: 400, height: 50, stroke: '#c62828', fill: '#ffcdd2', lineWidth: 2, rx: 6 },
        { type: 'text', x: 720, y: 790, text: 'Error: Something went wrong', fontSize: 14, bold: true, color: '#b71c1c' },

        // Progress Bar Section
        { type: 'text', x: 100, y: 860, text: 'Progress Bars', fontSize: 20, bold: true, color: '#1565c0' },

        // Empty progress bar
        { type: 'rectangle', x: 100, y: 890, width: 400, height: 20, stroke: '#e0e0e0', fill: '#f5f5f5', lineWidth: 2, rx: 10 },

        // Partial progress bar (60%)
        { type: 'rectangle', x: 100, y: 930, width: 400, height: 20, stroke: '#e0e0e0', fill: '#f5f5f5', lineWidth: 2, rx: 10 },
        { type: 'rectangle', x: 102, y: 932, width: 240, height: 16, stroke: 'transparent', fill: '#1565c0', lineWidth: 0, rx: 8 },
        { type: 'text', x: 510, y: 942, text: '60%', fontSize: 14, color: '#666' },

        // Toggle Switch Section
        { type: 'text', x: 700, y: 900, text: 'Toggle Switch', fontSize: 20, bold: true, color: '#1565c0' },

        // Toggle Off
        { type: 'rectangle', x: 700, y: 940, width: 60, height: 30, stroke: '#bdbdbd', fill: '#e0e0e0', lineWidth: 2, rx: 15 },
        { type: 'circle', cx: 715, cy: 955, radius: 12, stroke: '#757575', fill: '#ffffff', lineWidth: 2 },
        { type: 'text', x: 770, y: 952, text: 'Off', fontSize: 14, color: '#666' },

        // Toggle On
        { type: 'rectangle', x: 850, y: 940, width: 60, height: 30, stroke: '#1565c0', fill: '#1565c0', lineWidth: 2, rx: 15 },
        { type: 'circle', cx: 895, cy: 955, radius: 12, stroke: '#0d47a1', fill: '#ffffff', lineWidth: 2 },
        { type: 'text', x: 920, y: 952, text: 'On', fontSize: 14, color: '#666' }
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
        { type: 'text', x: 600, y: 50, text: 'Periodic Table of Elements', fontSize: 24, bold: true, color: '#333' },

        // Period 1
        // H - Hydrogen
        { type: 'rectangle', x: 100, y: 120, width: 80, height: 80, stroke: '#f44336', fill: '#ffebee', lineWidth: 2 },
        { type: 'text', x: 110, y: 135, text: '1', fontSize: 10, color: '#666' },
        { type: 'text', x: 125, y: 160, text: 'H', fontSize: 24, bold: true, color: '#c62828' },
        { type: 'text', x: 115, y: 190, text: '1.008', fontSize: 10, color: '#666' },

        // He - Helium
        { type: 'rectangle', x: 1620, y: 120, width: 80, height: 80, stroke: '#9c27b0', fill: '#f3e5f5', lineWidth: 2 },
        { type: 'text', x: 1630, y: 135, text: '2', fontSize: 10, color: '#666' },
        { type: 'text', x: 1642, y: 160, text: 'He', fontSize: 24, bold: true, color: '#6a1b9a' },
        { type: 'text', x: 1635, y: 190, text: '4.003', fontSize: 10, color: '#666' },

        // Period 2
        // Li - Lithium
        { type: 'rectangle', x: 100, y: 220, width: 80, height: 80, stroke: '#2196f3', fill: '#e3f2fd', lineWidth: 2 },
        { type: 'text', x: 110, y: 235, text: '3', fontSize: 10, color: '#666' },
        { type: 'text', x: 125, y: 260, text: 'Li', fontSize: 24, bold: true, color: '#1565c0' },
        { type: 'text', x: 115, y: 290, text: '6.941', fontSize: 10, color: '#666' },

        // Be - Beryllium
        { type: 'rectangle', x: 200, y: 220, width: 80, height: 80, stroke: '#ff9800', fill: '#fff3e0', lineWidth: 2 },
        { type: 'text', x: 210, y: 235, text: '4', fontSize: 10, color: '#666' },
        { type: 'text', x: 222, y: 260, text: 'Be', fontSize: 24, bold: true, color: '#e65100' },
        { type: 'text', x: 215, y: 290, text: '9.012', fontSize: 10, color: '#666' },

        // B - Boron
        { type: 'rectangle', x: 1120, y: 220, width: 80, height: 80, stroke: '#4caf50', fill: '#e8f5e9', lineWidth: 2 },
        { type: 'text', x: 1130, y: 235, text: '5', fontSize: 10, color: '#666' },
        { type: 'text', x: 1147, y: 260, text: 'B', fontSize: 24, bold: true, color: '#2e7d32' },
        { type: 'text', x: 1133, y: 290, text: '10.81', fontSize: 10, color: '#666' },

        // C - Carbon
        { type: 'rectangle', x: 1220, y: 220, width: 80, height: 80, stroke: '#f44336', fill: '#ffebee', lineWidth: 2 },
        { type: 'text', x: 1230, y: 235, text: '6', fontSize: 10, color: '#666' },
        { type: 'text', x: 1247, y: 260, text: 'C', fontSize: 24, bold: true, color: '#c62828' },
        { type: 'text', x: 1233, y: 290, text: '12.01', fontSize: 10, color: '#666' },

        // N - Nitrogen
        { type: 'rectangle', x: 1320, y: 220, width: 80, height: 80, stroke: '#f44336', fill: '#ffebee', lineWidth: 2 },
        { type: 'text', x: 1330, y: 235, text: '7', fontSize: 10, color: '#666' },
        { type: 'text', x: 1347, y: 260, text: 'N', fontSize: 24, bold: true, color: '#c62828' },
        { type: 'text', x: 1333, y: 290, text: '14.01', fontSize: 10, color: '#666' },

        // O - Oxygen
        { type: 'rectangle', x: 1420, y: 220, width: 80, height: 80, stroke: '#f44336', fill: '#ffebee', lineWidth: 2 },
        { type: 'text', x: 1430, y: 235, text: '8', fontSize: 10, color: '#666' },
        { type: 'text', x: 1447, y: 260, text: 'O', fontSize: 24, bold: true, color: '#c62828' },
        { type: 'text', x: 1433, y: 290, text: '16.00', fontSize: 10, color: '#666' },

        // F - Fluorine
        { type: 'rectangle', x: 1520, y: 220, width: 80, height: 80, stroke: '#ffc107', fill: '#fff8e1', lineWidth: 2 },
        { type: 'text', x: 1530, y: 235, text: '9', fontSize: 10, color: '#666' },
        { type: 'text', x: 1547, y: 260, text: 'F', fontSize: 24, bold: true, color: '#f57c00' },
        { type: 'text', x: 1533, y: 290, text: '19.00', fontSize: 10, color: '#666' },

        // Ne - Neon
        { type: 'rectangle', x: 1620, y: 220, width: 80, height: 80, stroke: '#9c27b0', fill: '#f3e5f5', lineWidth: 2 },
        { type: 'text', x: 1630, y: 235, text: '10', fontSize: 10, color: '#666' },
        { type: 'text', x: 1642, y: 260, text: 'Ne', fontSize: 24, bold: true, color: '#6a1b9a' },
        { type: 'text', x: 1635, y: 290, text: '20.18', fontSize: 10, color: '#666' },

        // Period 3
        // Na - Sodium
        { type: 'rectangle', x: 100, y: 320, width: 80, height: 80, stroke: '#2196f3', fill: '#e3f2fd', lineWidth: 2 },
        { type: 'text', x: 110, y: 335, text: '11', fontSize: 10, color: '#666' },
        { type: 'text', x: 122, y: 360, text: 'Na', fontSize: 24, bold: true, color: '#1565c0' },
        { type: 'text', x: 115, y: 390, text: '22.99', fontSize: 10, color: '#666' },

        // Mg - Magnesium
        { type: 'rectangle', x: 200, y: 320, width: 80, height: 80, stroke: '#ff9800', fill: '#fff3e0', lineWidth: 2 },
        { type: 'text', x: 210, y: 335, text: '12', fontSize: 10, color: '#666' },
        { type: 'text', x: 220, y: 360, text: 'Mg', fontSize: 24, bold: true, color: '#e65100' },
        { type: 'text', x: 215, y: 390, text: '24.31', fontSize: 10, color: '#666' },

        // Al - Aluminum
        { type: 'rectangle', x: 1120, y: 320, width: 80, height: 80, stroke: '#607d8b', fill: '#eceff1', lineWidth: 2 },
        { type: 'text', x: 1130, y: 335, text: '13', fontSize: 10, color: '#666' },
        { type: 'text', x: 1145, y: 360, text: 'Al', fontSize: 24, bold: true, color: '#37474f' },
        { type: 'text', x: 1133, y: 390, text: '26.98', fontSize: 10, color: '#666' },

        // Si - Silicon
        { type: 'rectangle', x: 1220, y: 320, width: 80, height: 80, stroke: '#4caf50', fill: '#e8f5e9', lineWidth: 2 },
        { type: 'text', x: 1230, y: 335, text: '14', fontSize: 10, color: '#666' },
        { type: 'text', x: 1247, y: 360, text: 'Si', fontSize: 24, bold: true, color: '#2e7d32' },
        { type: 'text', x: 1233, y: 390, text: '28.09', fontSize: 10, color: '#666' },

        // P - Phosphorus
        { type: 'rectangle', x: 1320, y: 320, width: 80, height: 80, stroke: '#f44336', fill: '#ffebee', lineWidth: 2 },
        { type: 'text', x: 1330, y: 335, text: '15', fontSize: 10, color: '#666' },
        { type: 'text', x: 1347, y: 360, text: 'P', fontSize: 24, bold: true, color: '#c62828' },
        { type: 'text', x: 1333, y: 390, text: '30.97', fontSize: 10, color: '#666' },

        // S - Sulfur
        { type: 'rectangle', x: 1420, y: 320, width: 80, height: 80, stroke: '#f44336', fill: '#ffebee', lineWidth: 2 },
        { type: 'text', x: 1430, y: 335, text: '16', fontSize: 10, color: '#666' },
        { type: 'text', x: 1447, y: 360, text: 'S', fontSize: 24, bold: true, color: '#c62828' },
        { type: 'text', x: 1433, y: 390, text: '32.07', fontSize: 10, color: '#666' },

        // Cl - Chlorine
        { type: 'rectangle', x: 1520, y: 320, width: 80, height: 80, stroke: '#ffc107', fill: '#fff8e1', lineWidth: 2 },
        { type: 'text', x: 1530, y: 335, text: '17', fontSize: 10, color: '#666' },
        { type: 'text', x: 1545, y: 360, text: 'Cl', fontSize: 24, bold: true, color: '#f57c00' },
        { type: 'text', x: 1533, y: 390, text: '35.45', fontSize: 10, color: '#666' },

        // Ar - Argon
        { type: 'rectangle', x: 1620, y: 320, width: 80, height: 80, stroke: '#9c27b0', fill: '#f3e5f5', lineWidth: 2 },
        { type: 'text', x: 1630, y: 335, text: '18', fontSize: 10, color: '#666' },
        { type: 'text', x: 1645, y: 360, text: 'Ar', fontSize: 24, bold: true, color: '#6a1b9a' },
        { type: 'text', x: 1635, y: 390, text: '39.95', fontSize: 10, color: '#666' },

        // Period 4 - First two elements
        // K - Potassium
        { type: 'rectangle', x: 100, y: 420, width: 80, height: 80, stroke: '#2196f3', fill: '#e3f2fd', lineWidth: 2 },
        { type: 'text', x: 110, y: 435, text: '19', fontSize: 10, color: '#666' },
        { type: 'text', x: 127, y: 460, text: 'K', fontSize: 24, bold: true, color: '#1565c0' },
        { type: 'text', x: 115, y: 490, text: '39.10', fontSize: 10, color: '#666' },

        // Ca - Calcium
        { type: 'rectangle', x: 200, y: 420, width: 80, height: 80, stroke: '#ff9800', fill: '#fff3e0', lineWidth: 2 },
        { type: 'text', x: 210, y: 435, text: '20', fontSize: 10, color: '#666' },
        { type: 'text', x: 222, y: 460, text: 'Ca', fontSize: 24, bold: true, color: '#e65100' },
        { type: 'text', x: 215, y: 490, text: '40.08', fontSize: 10, color: '#666' },

        // Legend
        { type: 'rectangle', x: 100, y: 650, width: 600, height: 280, stroke: '#bdbdbd', fill: '#fafafa', lineWidth: 2, rx: 8 },
        { type: 'text', x: 320, y: 680, text: 'Element Categories', fontSize: 18, bold: true, color: '#333' },
        { type: 'line', x1: 120, y1: 700, x2: 680, y2: 700, color: '#e0e0e0', lineWidth: 1 },

        { type: 'rectangle', x: 120, y: 720, width: 40, height: 30, stroke: '#f44336', fill: '#ffebee', lineWidth: 2 },
        { type: 'text', x: 170, y: 738, text: 'Nonmetals', fontSize: 14, color: '#666' },

        { type: 'rectangle', x: 120, y: 760, width: 40, height: 30, stroke: '#9c27b0', fill: '#f3e5f5', lineWidth: 2 },
        { type: 'text', x: 170, y: 778, text: 'Noble Gases', fontSize: 14, color: '#666' },

        { type: 'rectangle', x: 120, y: 800, width: 40, height: 30, stroke: '#2196f3', fill: '#e3f2fd', lineWidth: 2 },
        { type: 'text', x: 170, y: 818, text: 'Alkali Metals', fontSize: 14, color: '#666' },

        { type: 'rectangle', x: 120, y: 840, width: 40, height: 30, stroke: '#ff9800', fill: '#fff3e0', lineWidth: 2 },
        { type: 'text', x: 170, y: 858, text: 'Alkaline Earth Metals', fontSize: 14, color: '#666' },

        { type: 'rectangle', x: 120, y: 880, width: 40, height: 30, stroke: '#4caf50', fill: '#e8f5e9', lineWidth: 2 },
        { type: 'text', x: 170, y: 898, text: 'Metalloids', fontSize: 14, color: '#666' },

        { type: 'rectangle', x: 380, y: 720, width: 40, height: 30, stroke: '#607d8b', fill: '#eceff1', lineWidth: 2 },
        { type: 'text', x: 430, y: 738, text: 'Post-transition Metals', fontSize: 14, color: '#666' },

        { type: 'rectangle', x: 380, y: 760, width: 40, height: 30, stroke: '#ffc107', fill: '#fff8e1', lineWidth: 2 },
        { type: 'text', x: 430, y: 778, text: 'Halogens', fontSize: 14, color: '#666' },

        { type: 'text', x: 800, y: 700, text: 'Template shows first 20 elements', fontSize: 14, color: '#666', bold: true },
        { type: 'text', x: 800, y: 730, text: 'Add more elements as needed', fontSize: 12, color: '#999' }
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
        { type: 'text', x: 580, y: 50, text: 'System Architecture', fontSize: 28, bold: true, color: '#333' },

        // Client Layer
        { type: 'text', x: 100, y: 120, text: 'Client Layer', fontSize: 18, bold: true, color: '#1565c0' },

        // Web Browser
        { type: 'rectangle', x: 100, y: 150, width: 180, height: 100, stroke: '#1565c0', fill: '#e3f2fd', lineWidth: 2, rx: 8 },
        { type: 'text', x: 140, y: 185, text: 'Web Browser', fontSize: 16, bold: true, color: '#0d47a1' },
        { type: 'text', x: 130, y: 210, text: 'React/Vue/Angular', fontSize: 12, color: '#1565c0' },

        // Mobile App
        { type: 'rectangle', x: 320, y: 150, width: 180, height: 100, stroke: '#1565c0', fill: '#e3f2fd', lineWidth: 2, rx: 8 },
        { type: 'text', x: 360, y: 185, text: 'Mobile App', fontSize: 16, bold: true, color: '#0d47a1' },
        { type: 'text', x: 350, y: 210, text: 'iOS / Android', fontSize: 12, color: '#1565c0' },

        // Arrows from clients to load balancer
        { type: 'line', x1: 190, y1: 250, x2: 700, y2: 370, color: '#666', lineWidth: 2 },
        { type: 'line', x1: 410, y1: 250, x2: 700, y2: 370, color: '#666', lineWidth: 2 },

        // Load Balancer
        { type: 'text', x: 650, y: 320, text: 'Load Balancer', fontSize: 18, bold: true, color: '#2e7d32' },
        { type: 'rectangle', x: 620, y: 350, width: 200, height: 80, stroke: '#2e7d32', fill: '#c8e6c9', lineWidth: 2, rx: 8 },
        { type: 'text', x: 655, y: 380, text: 'Nginx / HAProxy', fontSize: 14, bold: true, color: '#1b5e20' },
        { type: 'text', x: 670, y: 405, text: 'Load Distribution', fontSize: 11, color: '#2e7d32' },

        // Arrows from load balancer to servers
        { type: 'line', x1: 680, y1: 430, x2: 500, y2: 540, color: '#666', lineWidth: 2 },
        { type: 'line', x1: 500, y1: 540, x2: 510, y2: 530, color: '#666', lineWidth: 2 },
        { type: 'line', x1: 720, y1: 430, x2: 720, y2: 540, color: '#666', lineWidth: 2 },
        { type: 'line', x1: 720, y1: 540, x2: 710, y2: 530, color: '#666', lineWidth: 2 },
        { type: 'line', x1: 720, y1: 540, x2: 730, y2: 530, color: '#666', lineWidth: 2 },
        { type: 'line', x1: 760, y1: 430, x2: 940, y2: 540, color: '#666', lineWidth: 2 },
        { type: 'line', x1: 940, y1: 540, x2: 930, y2: 530, color: '#666', lineWidth: 2 },

        // Application Servers
        { type: 'text', x: 650, y: 510, text: 'Application Layer', fontSize: 18, bold: true, color: '#9c27b0' },

        // Server 1
        { type: 'rectangle', x: 400, y: 540, width: 150, height: 100, stroke: '#9c27b0', fill: '#f3e5f5', lineWidth: 2, rx: 8 },
        { type: 'text', x: 440, y: 570, text: 'App Server 1', fontSize: 14, bold: true, color: '#6a1b9a' },
        { type: 'text', x: 430, y: 595, text: 'Node.js / Java', fontSize: 11, color: '#9c27b0' },
        { type: 'text', x: 445, y: 615, text: 'Port: 8080', fontSize: 10, color: '#9c27b0' },

        // Server 2
        { type: 'rectangle', x: 645, y: 540, width: 150, height: 100, stroke: '#9c27b0', fill: '#f3e5f5', lineWidth: 2, rx: 8 },
        { type: 'text', x: 685, y: 570, text: 'App Server 2', fontSize: 14, bold: true, color: '#6a1b9a' },
        { type: 'text', x: 675, y: 595, text: 'Node.js / Java', fontSize: 11, color: '#9c27b0' },
        { type: 'text', x: 690, y: 615, text: 'Port: 8080', fontSize: 10, color: '#9c27b0' },

        // Server 3
        { type: 'rectangle', x: 890, y: 540, width: 150, height: 100, stroke: '#9c27b0', fill: '#f3e5f5', lineWidth: 2, rx: 8 },
        { type: 'text', x: 930, y: 570, text: 'App Server 3', fontSize: 14, bold: true, color: '#6a1b9a' },
        { type: 'text', x: 920, y: 595, text: 'Node.js / Java', fontSize: 11, color: '#9c27b0' },
        { type: 'text', x: 935, y: 615, text: 'Port: 8080', fontSize: 10, color: '#9c27b0' },

        // Arrows from servers to database and cache
        { type: 'line', x1: 720, y1: 640, x2: 400, y2: 760, color: '#666', lineWidth: 2 },
        { type: 'line', x1: 400, y1: 760, x2: 410, y2: 750, color: '#666', lineWidth: 2 },
        { type: 'line', x1: 720, y1: 640, x2: 720, y2: 760, color: '#666', lineWidth: 2 },
        { type: 'line', x1: 720, y1: 760, x2: 710, y2: 750, color: '#666', lineWidth: 2 },
        { type: 'line', x1: 720, y1: 760, x2: 730, y2: 750, color: '#666', lineWidth: 2 },
        { type: 'line', x1: 720, y1: 640, x2: 1020, y2: 760, color: '#666', lineWidth: 2 },
        { type: 'line', x1: 1020, y1: 760, x2: 1010, y2: 750, color: '#666', lineWidth: 2 },

        // Data Layer
        { type: 'text', x: 670, y: 730, text: 'Data Layer', fontSize: 18, bold: true, color: '#f57c00' },

        // Database
        { type: 'rectangle', x: 620, y: 760, width: 200, height: 100, stroke: '#1565c0', fill: '#e3f2fd', lineWidth: 2, rx: 8 },
        { type: 'text', x: 670, y: 790, text: 'Database', fontSize: 16, bold: true, color: '#0d47a1' },
        { type: 'text', x: 650, y: 815, text: 'PostgreSQL / MySQL', fontSize: 12, color: '#1565c0' },
        { type: 'text', x: 685, y: 835, text: 'Primary Store', fontSize: 10, color: '#1565c0' },

        // Cache
        { type: 'rectangle', x: 920, y: 760, width: 200, height: 100, stroke: '#f57c00', fill: '#fff3e0', lineWidth: 2, rx: 8 },
        { type: 'text', x: 990, y: 790, text: 'Cache', fontSize: 16, bold: true, color: '#e65100' },
        { type: 'text', x: 975, y: 815, text: 'Redis / Memcached', fontSize: 12, color: '#f57c00' },
        { type: 'text', x: 980, y: 835, text: 'Session Store', fontSize: 10, color: '#f57c00' },

        // Message Queue
        { type: 'rectangle', x: 300, y: 760, width: 200, height: 100, stroke: '#c62828', fill: '#ffcdd2', lineWidth: 2, rx: 8 },
        { type: 'text', x: 340, y: 790, text: 'Message Queue', fontSize: 16, bold: true, color: '#b71c1c' },
        { type: 'text', x: 335, y: 815, text: 'RabbitMQ / Kafka', fontSize: 12, color: '#c62828' },
        { type: 'text', x: 360, y: 835, text: 'Async Tasks', fontSize: 10, color: '#c62828' },

        // CDN
        { type: 'rectangle', x: 1150, y: 150, width: 180, height: 100, stroke: '#2e7d32', fill: '#c8e6c9', lineWidth: 2, rx: 8 },
        { type: 'text', x: 1215, y: 185, text: 'CDN', fontSize: 16, bold: true, color: '#1b5e20' },
        { type: 'text', x: 1175, y: 210, text: 'Static Assets', fontSize: 12, color: '#2e7d32' },
        { type: 'text', x: 1175, y: 230, text: 'CloudFront / Akamai', fontSize: 11, color: '#2e7d32' },

        // Arrow from browser to CDN
        { type: 'line', x1: 280, y1: 180, x2: 1150, y2: 180, color: '#2e7d32', lineWidth: 1, lineDash: [5, 5] },
        { type: 'line', x1: 1150, y1: 180, x2: 1140, y2: 175, color: '#2e7d32', lineWidth: 1 },
        { type: 'line', x1: 1150, y1: 180, x2: 1140, y2: 185, color: '#2e7d32', lineWidth: 1 },

        // Monitoring Service
        { type: 'rectangle', x: 1220, y: 760, width: 200, height: 100, stroke: '#6a1b9a', fill: '#f3e5f5', lineWidth: 2, rx: 8 },
        { type: 'text', x: 1270, y: 790, text: 'Monitoring', fontSize: 16, bold: true, color: '#4a148c' },
        { type: 'text', x: 1245, y: 815, text: 'Prometheus / Grafana', fontSize: 11, color: '#6a1b9a' },
        { type: 'text', x: 1275, y: 835, text: 'Metrics & Logs', fontSize: 10, color: '#6a1b9a' }
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
        { type: 'text', x: 530, y: 50, text: 'Network Diagram', fontSize: 28, bold: true, color: '#333' },

        // Internet Cloud
        { type: 'ellipse', cx: 700, cy: 150, rx: 120, ry: 70, stroke: '#1565c0', fill: '#e3f2fd', lineWidth: 3 },
        { type: 'text', x: 650, y: 145, text: 'INTERNET', fontSize: 18, bold: true, color: '#0d47a1' },

        // Connection from Internet to Firewall
        { type: 'line', x1: 700, y1: 220, x2: 700, y2: 290, color: '#333', lineWidth: 2 },

        // Firewall
        { type: 'rectangle', x: 600, y: 290, width: 200, height: 80, stroke: '#c62828', fill: '#ffcdd2', lineWidth: 3, rx: 8 },
        { type: 'text', x: 660, y: 320, text: 'Firewall', fontSize: 16, bold: true, color: '#b71c1c' },
        { type: 'text', x: 635, y: 345, text: '192.168.1.1', fontSize: 12, color: '#c62828' },

        // Connection from Firewall to Router
        { type: 'line', x1: 700, y1: 370, x2: 700, y2: 440, color: '#333', lineWidth: 2 },

        // Router
        { type: 'rectangle', x: 600, y: 440, width: 200, height: 80, stroke: '#2e7d32', fill: '#c8e6c9', lineWidth: 3, rx: 8 },
        { type: 'text', x: 665, y: 470, text: 'Router', fontSize: 16, bold: true, color: '#1b5e20' },
        { type: 'text', x: 635, y: 495, text: '192.168.1.254', fontSize: 12, color: '#2e7d32' },

        // Connections from Router to Switches
        { type: 'line', x1: 620, y1: 520, x2: 350, y2: 620, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 780, y1: 520, x2: 1050, y2: 620, color: '#333', lineWidth: 2 },

        // Left Switch
        { type: 'rectangle', x: 250, y: 620, width: 200, height: 80, stroke: '#f57c00', fill: '#fff3e0', lineWidth: 2, rx: 8 },
        { type: 'text', x: 305, y: 650, text: 'Switch A', fontSize: 16, bold: true, color: '#e65100' },
        { type: 'text', x: 285, y: 675, text: '192.168.10.1', fontSize: 12, color: '#f57c00' },

        // Right Switch
        { type: 'rectangle', x: 950, y: 620, width: 200, height: 80, stroke: '#f57c00', fill: '#fff3e0', lineWidth: 2, rx: 8 },
        { type: 'text', x: 1005, y: 650, text: 'Switch B', fontSize: 16, bold: true, color: '#e65100' },
        { type: 'text', x: 985, y: 675, text: '192.168.20.1', fontSize: 12, color: '#f57c00' },

        // Connections from Left Switch to devices
        { type: 'line', x1: 290, y1: 700, x2: 200, y2: 780, color: '#666', lineWidth: 2 },
        { type: 'line', x1: 350, y1: 700, x2: 350, y2: 780, color: '#666', lineWidth: 2 },
        { type: 'line', x1: 410, y1: 700, x2: 500, y2: 780, color: '#666', lineWidth: 2 },

        // Server 1
        { type: 'rectangle', x: 120, y: 780, width: 160, height: 100, stroke: '#9c27b0', fill: '#f3e5f5', lineWidth: 2, rx: 6 },
        { type: 'text', x: 160, y: 815, text: 'Server 1', fontSize: 14, bold: true, color: '#6a1b9a' },
        { type: 'text', x: 140, y: 840, text: '192.168.10.10', fontSize: 11, color: '#9c27b0' },
        { type: 'text', x: 155, y: 860, text: 'Web Server', fontSize: 10, color: '#9c27b0' },

        // Workstation 1
        { type: 'rectangle', x: 300, y: 780, width: 100, height: 80, stroke: '#1565c0', fill: '#e3f2fd', lineWidth: 2, rx: 6 },
        { type: 'text', x: 315, y: 810, text: 'PC-001', fontSize: 12, bold: true, color: '#0d47a1' },
        { type: 'text', x: 308, y: 835, text: '10.10.10.50', fontSize: 10, color: '#1565c0' },

        // Printer
        { type: 'rectangle', x: 430, y: 780, width: 140, height: 80, stroke: '#757575', fill: '#eeeeee', lineWidth: 2, rx: 6 },
        { type: 'text', x: 465, y: 810, text: 'Printer', fontSize: 12, bold: true, color: '#424242' },
        { type: 'text', x: 448, y: 835, text: '192.168.10.99', fontSize: 10, color: '#757575' },

        // Connections from Right Switch to devices
        { type: 'line', x1: 990, y1: 700, x2: 900, y2: 780, color: '#666', lineWidth: 2 },
        { type: 'line', x1: 1050, y1: 700, x2: 1050, y2: 780, color: '#666', lineWidth: 2 },
        { type: 'line', x1: 1110, y1: 700, x2: 1200, y2: 780, color: '#666', lineWidth: 2 },

        // Server 2 - Database
        { type: 'rectangle', x: 820, y: 780, width: 160, height: 100, stroke: '#9c27b0', fill: '#f3e5f5', lineWidth: 2, rx: 6 },
        { type: 'text', x: 860, y: 815, text: 'Server 2', fontSize: 14, bold: true, color: '#6a1b9a' },
        { type: 'text', x: 840, y: 840, text: '192.168.20.10', fontSize: 11, color: '#9c27b0' },
        { type: 'text', x: 850, y: 860, text: 'DB Server', fontSize: 10, color: '#9c27b0' },

        // Workstation 2
        { type: 'rectangle', x: 1000, y: 780, width: 100, height: 80, stroke: '#1565c0', fill: '#e3f2fd', lineWidth: 2, rx: 6 },
        { type: 'text', x: 1015, y: 810, text: 'PC-002', fontSize: 12, bold: true, color: '#0d47a1' },
        { type: 'text', x: 1008, y: 835, text: '10.20.20.50', fontSize: 10, color: '#1565c0' },

        // Laptop
        { type: 'rectangle', x: 1140, y: 780, width: 120, height: 80, stroke: '#1565c0', fill: '#e3f2fd', lineWidth: 2, rx: 6 },
        { type: 'text', x: 1165, y: 810, text: 'Laptop', fontSize: 12, bold: true, color: '#0d47a1' },
        { type: 'text', x: 1153, y: 835, text: '192.168.20.25', fontSize: 9, color: '#1565c0' },

        // Legend
        { type: 'rectangle', x: 50, y: 100, width: 200, height: 150, stroke: '#bdbdbd', fill: '#fafafa', lineWidth: 1, rx: 6 },
        { type: 'text', x: 110, y: 120, text: 'Legend', fontSize: 14, bold: true, color: '#333' },
        { type: 'line', x1: 70, y1: 140, x2: 230, y2: 140, color: '#e0e0e0', lineWidth: 1 },
        { type: 'rectangle', x: 70, y: 150, width: 30, height: 20, stroke: '#c62828', fill: '#ffcdd2', lineWidth: 1 },
        { type: 'text', x: 110, y: 160, text: 'Firewall', fontSize: 11, color: '#666' },
        { type: 'rectangle', x: 70, y: 180, width: 30, height: 20, stroke: '#2e7d32', fill: '#c8e6c9', lineWidth: 1 },
        { type: 'text', x: 110, y: 190, text: 'Router', fontSize: 11, color: '#666' },
        { type: 'rectangle', x: 70, y: 210, width: 30, height: 20, stroke: '#f57c00', fill: '#fff3e0', lineWidth: 1 },
        { type: 'text', x: 110, y: 220, text: 'Switch', fontSize: 11, color: '#666' }
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
        { type: 'text', x: 520, y: 50, text: 'UML Class Diagram', fontSize: 28, bold: true, color: '#333' },

        // Base Class - Animal (Parent)
        { type: 'rectangle', x: 550, y: 150, width: 300, height: 200, stroke: '#1565c0', fill: '#e3f2fd', lineWidth: 2 },
        // Class name section
        { type: 'text', x: 665, y: 175, text: 'Animal', fontSize: 18, bold: true, color: '#0d47a1' },
        { type: 'line', x1: 550, y1: 195, x2: 850, y2: 195, color: '#1565c0', lineWidth: 2 },
        // Attributes section
        { type: 'text', x: 560, y: 215, text: '- name: String', fontSize: 13, color: '#333' },
        { type: 'text', x: 560, y: 235, text: '- age: int', fontSize: 13, color: '#333' },
        { type: 'text', x: 560, y: 255, text: '- species: String', fontSize: 13, color: '#333' },
        { type: 'line', x1: 550, y1: 270, x2: 850, y2: 270, color: '#1565c0', lineWidth: 2 },
        // Methods section
        { type: 'text', x: 560, y: 290, text: '+ getName(): String', fontSize: 13, color: '#333' },
        { type: 'text', x: 560, y: 310, text: '+ setName(name: String): void', fontSize: 13, color: '#333' },
        { type: 'text', x: 560, y: 330, text: '+ makeSound(): void', fontSize: 13, color: '#333' },

        // Inheritance arrows from Dog and Cat to Animal
        { type: 'line', x1: 400, y1: 450, x2: 650, y2: 350, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 650, y1: 350, x2: 640, y2: 360, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 650, y1: 350, x2: 660, y2: 355, color: '#333', lineWidth: 2 },

        { type: 'line', x1: 1000, y1: 450, x2: 750, y2: 350, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 750, y1: 350, x2: 740, y2: 355, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 750, y1: 350, x2: 760, y2: 360, color: '#333', lineWidth: 2 },

        // Child Class 1 - Dog
        { type: 'rectangle', x: 250, y: 450, width: 300, height: 180, stroke: '#2e7d32', fill: '#c8e6c9', lineWidth: 2 },
        // Class name
        { type: 'text', x: 385, y: 475, text: 'Dog', fontSize: 18, bold: true, color: '#1b5e20' },
        { type: 'line', x1: 250, y1: 495, x2: 550, y2: 495, color: '#2e7d32', lineWidth: 2 },
        // Attributes
        { type: 'text', x: 260, y: 515, text: '- breed: String', fontSize: 13, color: '#333' },
        { type: 'text', x: 260, y: 535, text: '- isGoodBoy: boolean', fontSize: 13, color: '#333' },
        { type: 'line', x1: 250, y1: 550, x2: 550, y2: 550, color: '#2e7d32', lineWidth: 2 },
        // Methods
        { type: 'text', x: 260, y: 570, text: '+ bark(): void', fontSize: 13, color: '#333' },
        { type: 'text', x: 260, y: 590, text: '+ fetch(): void', fontSize: 13, color: '#333' },
        { type: 'text', x: 260, y: 610, text: '+ makeSound(): void', fontSize: 13, color: '#333' },

        // Child Class 2 - Cat
        { type: 'rectangle', x: 850, y: 450, width: 300, height: 180, stroke: '#f57c00', fill: '#fff3e0', lineWidth: 2 },
        // Class name
        { type: 'text', x: 985, y: 475, text: 'Cat', fontSize: 18, bold: true, color: '#e65100' },
        { type: 'line', x1: 850, y1: 495, x2: 1150, y2: 495, color: '#f57c00', lineWidth: 2 },
        // Attributes
        { type: 'text', x: 860, y: 515, text: '- furColor: String', fontSize: 13, color: '#333' },
        { type: 'text', x: 860, y: 535, text: '- lives: int', fontSize: 13, color: '#333' },
        { type: 'line', x1: 850, y1: 550, x2: 1150, y2: 550, color: '#f57c00', lineWidth: 2 },
        // Methods
        { type: 'text', x: 860, y: 570, text: '+ meow(): void', fontSize: 13, color: '#333' },
        { type: 'text', x: 860, y: 590, text: '+ scratch(): void', fontSize: 13, color: '#333' },
        { type: 'text', x: 860, y: 610, text: '+ makeSound(): void', fontSize: 13, color: '#333' },

        // Associated Class - Owner
        { type: 'rectangle', x: 250, y: 750, width: 300, height: 160, stroke: '#9c27b0', fill: '#f3e5f5', lineWidth: 2 },
        { type: 'text', x: 375, y: 775, text: 'Owner', fontSize: 18, bold: true, color: '#6a1b9a' },
        { type: 'line', x1: 250, y1: 795, x2: 550, y2: 795, color: '#9c27b0', lineWidth: 2 },
        { type: 'text', x: 260, y: 815, text: '- name: String', fontSize: 13, color: '#333' },
        { type: 'text', x: 260, y: 835, text: '- pets: Animal[]', fontSize: 13, color: '#333' },
        { type: 'line', x1: 250, y1: 850, x2: 550, y2: 850, color: '#9c27b0', lineWidth: 2 },
        { type: 'text', x: 260, y: 870, text: '+ adoptPet(pet: Animal): void', fontSize: 13, color: '#333' },
        { type: 'text', x: 260, y: 890, text: '+ getPets(): Animal[]', fontSize: 13, color: '#333' },

        // Association arrow from Owner to Dog
        { type: 'line', x1: 400, y1: 750, x2: 400, y2: 630, color: '#666', lineWidth: 2 },
        { type: 'line', x1: 400, y1: 630, x2: 395, y2: 640, color: '#666', lineWidth: 2 },
        { type: 'line', x1: 400, y1: 630, x2: 405, y2: 640, color: '#666', lineWidth: 2 },
        { type: 'text', x: 410, y: 685, text: 'owns 1..*', fontSize: 11, color: '#666' },

        // Composition - Veterinarian
        { type: 'rectangle', x: 850, y: 750, width: 300, height: 160, stroke: '#c62828', fill: '#ffcdd2', lineWidth: 2 },
        { type: 'text', x: 945, y: 775, text: 'Veterinarian', fontSize: 18, bold: true, color: '#b71c1c' },
        { type: 'line', x1: 850, y1: 795, x2: 1150, y2: 795, color: '#c62828', lineWidth: 2 },
        { type: 'text', x: 860, y: 815, text: '- name: String', fontSize: 13, color: '#333' },
        { type: 'text', x: 860, y: 835, text: '- specialty: String', fontSize: 13, color: '#333' },
        { type: 'line', x1: 850, y1: 850, x2: 1150, y2: 850, color: '#c62828', lineWidth: 2 },
        { type: 'text', x: 860, y: 870, text: '+ examine(animal: Animal): void', fontSize: 13, color: '#333' },
        { type: 'text', x: 860, y: 890, text: '+ treat(animal: Animal): void', fontSize: 13, color: '#333' },

        // Dependency arrow from Veterinarian to Animal
        { type: 'line', x1: 950, y1: 750, x2: 750, y2: 350, color: '#666', lineWidth: 1, lineDash: [5, 5] },
        { type: 'line', x1: 750, y1: 350, x2: 755, y2: 360, color: '#666', lineWidth: 1 },
        { type: 'line', x1: 750, y1: 350, x2: 760, y2: 352, color: '#666', lineWidth: 1 },
        { type: 'text', x: 820, y: 540, text: '<<uses>>', fontSize: 11, color: '#666' },

        // Legend
        { type: 'text', x: 50, y: 120, text: 'Relationships:', fontSize: 14, bold: true, color: '#333' },
        { type: 'line', x1: 50, y1: 145, x2: 100, y2: 145, color: '#333', lineWidth: 2 },
        { type: 'text', x: 110, y: 147, text: 'Inheritance', fontSize: 11, color: '#666' },
        { type: 'line', x1: 50, y1: 165, x2: 100, y2: 165, color: '#666', lineWidth: 2 },
        { type: 'text', x: 110, y: 167, text: 'Association', fontSize: 11, color: '#666' },
        { type: 'line', x1: 50, y1: 185, x2: 100, y2: 185, color: '#666', lineWidth: 1, lineDash: [5, 5] },
        { type: 'text', x: 110, y: 187, text: 'Dependency', fontSize: 11, color: '#666' }
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
        { type: 'text', x: 450, y: 50, text: 'Entity-Relationship Diagram', fontSize: 28, bold: true, color: '#333' },

        // Entity 1 - Users
        { type: 'rectangle', x: 100, y: 150, width: 250, height: 220, stroke: '#1565c0', fill: '#e3f2fd', lineWidth: 2 },
        { type: 'text', x: 195, y: 175, text: 'Users', fontSize: 18, bold: true, color: '#0d47a1' },
        { type: 'line', x1: 100, y1: 190, x2: 350, y2: 190, color: '#1565c0', lineWidth: 2 },
        { type: 'text', x: 110, y: 210, text: 'PK  user_id: INT', fontSize: 13, bold: true, color: '#333' },
        { type: 'text', x: 110, y: 230, text: '     username: VARCHAR(50)', fontSize: 13, color: '#333' },
        { type: 'text', x: 110, y: 250, text: '     email: VARCHAR(100)', fontSize: 13, color: '#333' },
        { type: 'text', x: 110, y: 270, text: '     password: VARCHAR(255)', fontSize: 13, color: '#333' },
        { type: 'text', x: 110, y: 290, text: '     created_at: DATETIME', fontSize: 13, color: '#333' },
        { type: 'text', x: 110, y: 310, text: '     last_login: DATETIME', fontSize: 13, color: '#333' },
        { type: 'text', x: 110, y: 330, text: '     is_active: BOOLEAN', fontSize: 13, color: '#333' },
        { type: 'text', x: 110, y: 350, text: '     role: ENUM', fontSize: 13, color: '#333' },

        // Relationship diamond - Creates (Users to Posts)
        { type: 'line', x1: 475, y1: 260, x2: 550, y2: 310, color: '#f57c00', lineWidth: 2 },
        { type: 'line', x1: 550, y1: 310, x2: 475, y2: 360, color: '#f57c00', lineWidth: 2 },
        { type: 'line', x1: 475, y1: 360, x2: 400, y2: 310, color: '#f57c00', lineWidth: 2 },
        { type: 'line', x1: 400, y1: 310, x2: 475, y2: 260, color: '#f57c00', lineWidth: 2 },
        { type: 'text', x: 450, y: 305, text: 'creates', fontSize: 12, bold: true, color: '#e65100' },

        // Connection line from Users to Creates
        { type: 'line', x1: 350, y1: 260, x2: 400, y2: 310, color: '#333', lineWidth: 2 },
        { type: 'text', x: 360, y: 280, text: '1', fontSize: 12, bold: true, color: '#666' },

        // Connection line from Creates to Posts
        { type: 'line', x1: 550, y1: 310, x2: 750, y2: 310, color: '#333', lineWidth: 2 },
        { type: 'text', x: 730, y: 300, text: 'N', fontSize: 12, bold: true, color: '#666' },

        // Entity 2 - Posts
        { type: 'rectangle', x: 750, y: 200, width: 250, height: 220, stroke: '#2e7d32', fill: '#c8e6c9', lineWidth: 2 },
        { type: 'text', x: 845, y: 225, text: 'Posts', fontSize: 18, bold: true, color: '#1b5e20' },
        { type: 'line', x1: 750, y1: 240, x2: 1000, y2: 240, color: '#2e7d32', lineWidth: 2 },
        { type: 'text', x: 760, y: 260, text: 'PK  post_id: INT', fontSize: 13, bold: true, color: '#333' },
        { type: 'text', x: 760, y: 280, text: 'FK  user_id: INT', fontSize: 13, color: '#c62828' },
        { type: 'text', x: 760, y: 300, text: '     title: VARCHAR(200)', fontSize: 13, color: '#333' },
        { type: 'text', x: 760, y: 320, text: '     content: TEXT', fontSize: 13, color: '#333' },
        { type: 'text', x: 760, y: 340, text: '     created_at: DATETIME', fontSize: 13, color: '#333' },
        { type: 'text', x: 760, y: 360, text: '     updated_at: DATETIME', fontSize: 13, color: '#333' },
        { type: 'text', x: 760, y: 380, text: '     status: ENUM', fontSize: 13, color: '#333' },
        { type: 'text', x: 760, y: 400, text: '     views: INT', fontSize: 13, color: '#333' },

        // Entity 3 - Comments
        { type: 'rectangle', x: 750, y: 550, width: 250, height: 200, stroke: '#9c27b0', fill: '#f3e5f5', lineWidth: 2 },
        { type: 'text', x: 830, y: 575, text: 'Comments', fontSize: 18, bold: true, color: '#6a1b9a' },
        { type: 'line', x1: 750, y1: 590, x2: 1000, y2: 590, color: '#9c27b0', lineWidth: 2 },
        { type: 'text', x: 760, y: 610, text: 'PK  comment_id: INT', fontSize: 13, bold: true, color: '#333' },
        { type: 'text', x: 760, y: 630, text: 'FK  post_id: INT', fontSize: 13, color: '#c62828' },
        { type: 'text', x: 760, y: 650, text: 'FK  user_id: INT', fontSize: 13, color: '#c62828' },
        { type: 'text', x: 760, y: 670, text: '     content: TEXT', fontSize: 13, color: '#333' },
        { type: 'text', x: 760, y: 690, text: '     created_at: DATETIME', fontSize: 13, color: '#333' },
        { type: 'text', x: 760, y: 710, text: '     likes: INT', fontSize: 13, color: '#333' },
        { type: 'text', x: 760, y: 730, text: '     is_edited: BOOLEAN', fontSize: 13, color: '#333' },

        // Relationship - Posts to Comments
        { type: 'line', x1: 875, y1: 420, x2: 875, y2: 470, color: '#f57c00', lineWidth: 2 },
        { type: 'line', x1: 850, y1: 470, x2: 875, y2: 510, color: '#f57c00', lineWidth: 2 },
        { type: 'line', x1: 875, y1: 510, x2: 900, y2: 470, color: '#f57c00', lineWidth: 2 },
        { type: 'line', x1: 900, y1: 470, x2: 875, y2: 420, color: '#f57c00', lineWidth: 2 },
        { type: 'text', x: 860, y: 465, text: 'has', fontSize: 12, bold: true, color: '#e65100' },
        { type: 'text', x: 885, y: 430, text: '1', fontSize: 12, bold: true, color: '#666' },
        { type: 'text', x: 885, y: 535, text: 'N', fontSize: 12, bold: true, color: '#666' },
        { type: 'line', x1: 875, y1: 510, x2: 875, y2: 550, color: '#333', lineWidth: 2 },

        // Entity 4 - Tags
        { type: 'rectangle', x: 1100, y: 250, width: 250, height: 140, stroke: '#f57c00', fill: '#fff3e0', lineWidth: 2 },
        { type: 'text', x: 1195, y: 275, text: 'Tags', fontSize: 18, bold: true, color: '#e65100' },
        { type: 'line', x1: 1100, y1: 290, x2: 1350, y2: 290, color: '#f57c00', lineWidth: 2 },
        { type: 'text', x: 1110, y: 310, text: 'PK  tag_id: INT', fontSize: 13, bold: true, color: '#333' },
        { type: 'text', x: 1110, y: 330, text: '     name: VARCHAR(50)', fontSize: 13, color: '#333' },
        { type: 'text', x: 1110, y: 350, text: '     description: TEXT', fontSize: 13, color: '#333' },
        { type: 'text', x: 1110, y: 370, text: '     created_at: DATETIME', fontSize: 13, color: '#333' },

        // Junction Table - Post_Tags (Many-to-Many)
        { type: 'rectangle', x: 1050, y: 500, width: 230, height: 120, stroke: '#757575', fill: '#eeeeee', lineWidth: 2 },
        { type: 'text', x: 1120, y: 525, text: 'Post_Tags', fontSize: 16, bold: true, color: '#424242' },
        { type: 'line', x1: 1050, y1: 540, x2: 1280, y2: 540, color: '#757575', lineWidth: 2 },
        { type: 'text', x: 1060, y: 560, text: 'PK,FK  post_id: INT', fontSize: 12, bold: true, color: '#333' },
        { type: 'text', x: 1060, y: 580, text: 'PK,FK  tag_id: INT', fontSize: 12, bold: true, color: '#333' },
        { type: 'text', x: 1060, y: 600, text: '          created_at: DATETIME', fontSize: 12, color: '#333' },

        // Connection Posts to Post_Tags
        { type: 'line', x1: 1000, y1: 350, x2: 1100, y2: 550, color: '#333', lineWidth: 2 },
        { type: 'text', x: 1010, y: 430, text: 'N', fontSize: 12, bold: true, color: '#666' },

        // Connection Tags to Post_Tags
        { type: 'line', x1: 1225, y1: 390, x2: 1165, y2: 500, color: '#333', lineWidth: 2 },
        { type: 'text', x: 1190, y: 430, text: 'N', fontSize: 12, bold: true, color: '#666' },

        // Users to Comments relationship
        { type: 'line', x1: 225, y1: 370, x2: 225, y2: 650, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 225, y1: 650, x2: 750, y2: 650, color: '#333', lineWidth: 2 },
        { type: 'text', x: 240, y: 500, text: '1', fontSize: 12, bold: true, color: '#666' },
        { type: 'text', x: 720, y: 640, text: 'N', fontSize: 12, bold: true, color: '#666' },

        // Legend
        { type: 'text', x: 100, y: 570, text: 'Legend:', fontSize: 14, bold: true, color: '#333' },
        { type: 'text', x: 100, y: 595, text: 'PK = Primary Key', fontSize: 12, color: '#666' },
        { type: 'text', x: 100, y: 615, text: 'FK = Foreign Key', fontSize: 12, color: '#c62828' },
        { type: 'text', x: 100, y: 635, text: '1 = One', fontSize: 12, color: '#666' },
        { type: 'text', x: 100, y: 655, text: 'N = Many', fontSize: 12, color: '#666' }
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
        { type: 'text', x: 540, y: 50, text: 'Circuit Diagram', fontSize: 28, bold: true, color: '#333' },
        { type: 'text', x: 480, y: 90, text: 'Simple LED Circuit with Resistor', fontSize: 18, color: '#666' },

        // Main circuit wire - top horizontal line
        { type: 'line', x1: 200, y1: 300, x2: 1200, y2: 300, color: '#333', lineWidth: 3 },

        // Battery/Power Source (left side)
        { type: 'text', x: 180, y: 250, text: 'Power Source', fontSize: 14, bold: true, color: '#c62828' },
        { type: 'rectangle', x: 180, y: 280, width: 40, height: 40, stroke: '#c62828', fill: 'transparent', lineWidth: 3 },
        { type: 'text', x: 192, y: 305, text: '+', fontSize: 20, bold: true, color: '#c62828' },
        { type: 'line', x1: 220, y1: 300, x2: 270, y2: 300, color: '#333', lineWidth: 3 },

        // Vertical line down from battery (negative terminal)
        { type: 'line', x1: 180, y1: 300, x2: 180, y2: 650, color: '#333', lineWidth: 3 },
        { type: 'text', x: 192, y: 660, text: '-', fontSize: 20, bold: true, color: '#333' },

        // Battery specifications
        { type: 'text', x: 160, y: 360, text: '9V', fontSize: 12, bold: true, color: '#c62828' },

        // Resistor (colored bands representation)
        { type: 'text', x: 350, y: 250, text: 'Resistor', fontSize: 14, bold: true, color: '#f57c00' },
        { type: 'rectangle', x: 400, y: 285, width: 100, height: 30, stroke: '#f57c00', fill: '#fff3e0', lineWidth: 3, rx: 4 },
        { type: 'line', x1: 420, y1: 285, x2: 420, y2: 315, color: '#8d6e63', lineWidth: 4 },
        { type: 'line', x1: 440, y1: 285, x2: 440, y2: 315, color: '#f44336', lineWidth: 4 },
        { type: 'line', x1: 460, y1: 285, x2: 460, y2: 315, color: '#9c27b0', lineWidth: 4 },
        { type: 'text', x: 415, y: 345, text: '330Ω', fontSize: 12, bold: true, color: '#f57c00' },

        // LED Symbol
        { type: 'text', x: 650, y: 250, text: 'LED', fontSize: 14, bold: true, color: '#4caf50' },
        { type: 'line', x1: 680, y1: 280, x2: 680, y2: 320, color: '#4caf50', lineWidth: 3 },
        { type: 'line', x1: 720, y1: 280, x2: 720, y2: 320, color: '#4caf50', lineWidth: 3 },
        { type: 'line', x1: 680, y1: 280, x2: 720, y2: 300, color: '#4caf50', lineWidth: 3 },
        { type: 'line', x1: 680, y1: 320, x2: 720, y2: 300, color: '#4caf50', lineWidth: 3 },
        { type: 'circle', cx: 700, cy: 300, radius: 35, stroke: '#4caf50', fill: 'transparent', lineWidth: 2 },
        // Light rays
        { type: 'line', x1: 735, y1: 280, x2: 750, y2: 265, color: '#ffd54f', lineWidth: 2 },
        { type: 'line', x1: 735, y1: 290, x2: 755, y2: 280, color: '#ffd54f', lineWidth: 2 },
        { type: 'text', x: 675, y: 360, text: 'Red LED', fontSize: 12, bold: true, color: '#4caf50' },
        { type: 'text', x: 685, y: 380, text: '2V, 20mA', fontSize: 10, color: '#666' },

        // Switch (open position)
        { type: 'text', x: 920, y: 250, text: 'Switch', fontSize: 14, bold: true, color: '#1565c0' },
        { type: 'circle', cx: 950, cy: 300, radius: 8, stroke: '#1565c0', fill: '#1565c0', lineWidth: 2 },
        { type: 'circle', cx: 1050, cy: 300, radius: 8, stroke: '#1565c0', fill: '#1565c0', lineWidth: 2 },
        { type: 'line', x1: 958, y1: 300, x2: 1020, y2: 280, color: '#1565c0', lineWidth: 3 },
        { type: 'text', x: 980, y: 260, text: 'SPST', fontSize: 10, color: '#1565c0' },

        // Bottom return wire
        { type: 'line', x1: 180, y1: 650, x2: 1200, y2: 650, color: '#333', lineWidth: 3 },

        // Connect resistor to circuit
        { type: 'line', x1: 500, y1: 300, x2: 645, y2: 300, color: '#333', lineWidth: 3 },

        // Connect LED to switch
        { type: 'line', x1: 735, y1: 300, x2: 950, y2: 300, color: '#333', lineWidth: 3 },

        // Connect switch to top wire
        { type: 'line', x1: 1050, y1: 300, x2: 1200, y2: 300, color: '#333', lineWidth: 3 },

        // Vertical connection to bottom wire (right side)
        { type: 'line', x1: 1200, y1: 300, x2: 1200, y2: 650, color: '#333', lineWidth: 3 },

        // Ground symbol (at bottom)
        { type: 'line', x1: 1200, y1: 650, x2: 1200, y2: 680, color: '#333', lineWidth: 3 },
        { type: 'line', x1: 1180, y1: 680, x2: 1220, y2: 680, color: '#333', lineWidth: 3 },
        { type: 'line', x1: 1185, y1: 690, x2: 1215, y2: 690, color: '#333', lineWidth: 2 },
        { type: 'line', x1: 1190, y1: 700, x2: 1210, y2: 700, color: '#333', lineWidth: 2 },
        { type: 'text', x: 1175, y: 730, text: 'Ground', fontSize: 12, color: '#666' },

        // Current direction arrows
        { type: 'line', x1: 350, y1: 270, x2: 370, y2: 270, color: '#d32f2f', lineWidth: 2 },
        { type: 'line', x1: 370, y1: 270, x2: 365, y2: 265, color: '#d32f2f', lineWidth: 2 },
        { type: 'line', x1: 370, y1: 270, x2: 365, y2: 275, color: '#d32f2f', lineWidth: 2 },
        { type: 'text', x: 340, y: 265, text: 'I', fontSize: 14, bold: true, color: '#d32f2f' },

        // Component labels box
        { type: 'rectangle', x: 50, y: 800, width: 500, height: 150, stroke: '#bdbdbd', fill: '#fafafa', lineWidth: 2, rx: 8 },
        { type: 'text', x: 220, y: 830, text: 'Component Specifications', fontSize: 16, bold: true, color: '#333' },
        { type: 'line', x1: 70, y1: 845, x2: 530, y2: 845, color: '#e0e0e0', lineWidth: 1 },
        { type: 'text', x: 70, y: 865, text: '• Power Source: 9V Battery', fontSize: 12, color: '#666' },
        { type: 'text', x: 70, y: 885, text: '• Resistor: 330Ω (limits current to ~20mA)', fontSize: 12, color: '#666' },
        { type: 'text', x: 70, y: 905, text: '• LED: Red, Forward Voltage 2V, Current 20mA', fontSize: 12, color: '#666' },
        { type: 'text', x: 70, y: 925, text: '• Switch: SPST (Single Pole Single Throw)', fontSize: 12, color: '#666' },

        // Circuit notes box
        { type: 'rectangle', x: 600, y: 800, width: 550, height: 150, stroke: '#bdbdbd', fill: '#e3f2fd', lineWidth: 2, rx: 8 },
        { type: 'text', x: 810, y: 830, text: 'Circuit Notes', fontSize: 16, bold: true, color: '#1565c0' },
        { type: 'line', x1: 620, y1: 845, x2: 1130, y2: 845, color: '#90caf9', lineWidth: 1 },
        { type: 'text', x: 620, y: 865, text: 'This is a basic LED circuit demonstrating:', fontSize: 12, color: '#0d47a1' },
        { type: 'text', x: 620, y: 885, text: '1. Series circuit configuration', fontSize: 12, color: '#666' },
        { type: 'text', x: 620, y: 905, text: '2. Current limiting with resistor (prevents LED burnout)', fontSize: 12, color: '#666' },
        { type: 'text', x: 620, y: 925, text: '3. Manual control via switch', fontSize: 12, color: '#666' }
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
        { type: 'text', x: 380, y: 50, text: 'Chess Board', fontSize: 28, bold: true, color: '#333' },

        // Board border
        { type: 'rectangle', x: 100, y: 100, width: 800, height: 800, stroke: '#333', fill: 'transparent', lineWidth: 4 },

        // Create 8x8 checkerboard pattern
        // Row 1
        { type: 'rectangle', x: 100, y: 100, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 200, y: 100, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 300, y: 100, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 400, y: 100, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 500, y: 100, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 600, y: 100, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 700, y: 100, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 800, y: 100, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },

        // Row 2
        { type: 'rectangle', x: 100, y: 200, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 200, y: 200, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 300, y: 200, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 400, y: 200, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 500, y: 200, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 600, y: 200, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 700, y: 200, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 800, y: 200, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },

        // Row 3
        { type: 'rectangle', x: 100, y: 300, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 200, y: 300, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 300, y: 300, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 400, y: 300, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 500, y: 300, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 600, y: 300, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 700, y: 300, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 800, y: 300, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },

        // Row 4
        { type: 'rectangle', x: 100, y: 400, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 200, y: 400, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 300, y: 400, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 400, y: 400, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 500, y: 400, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 600, y: 400, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 700, y: 400, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 800, y: 400, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },

        // Row 5
        { type: 'rectangle', x: 100, y: 500, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 200, y: 500, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 300, y: 500, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 400, y: 500, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 500, y: 500, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 600, y: 500, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 700, y: 500, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 800, y: 500, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },

        // Row 6
        { type: 'rectangle', x: 100, y: 600, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 200, y: 600, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 300, y: 600, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 400, y: 600, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 500, y: 600, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 600, y: 600, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 700, y: 600, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 800, y: 600, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },

        // Row 7
        { type: 'rectangle', x: 100, y: 700, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 200, y: 700, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 300, y: 700, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 400, y: 700, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 500, y: 700, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 600, y: 700, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 700, y: 700, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 800, y: 700, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },

        // Row 8
        { type: 'rectangle', x: 100, y: 800, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 200, y: 800, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 300, y: 800, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 400, y: 800, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 500, y: 800, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 600, y: 800, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },
        { type: 'rectangle', x: 700, y: 800, width: 100, height: 100, stroke: 'transparent', fill: '#8d6e63', lineWidth: 0 },
        { type: 'rectangle', x: 800, y: 800, width: 100, height: 100, stroke: 'transparent', fill: '#f5f5f5', lineWidth: 0 },

        // Column labels (a-h) at bottom
        { type: 'text', x: 140, y: 930, text: 'a', fontSize: 20, bold: true, color: '#333' },
        { type: 'text', x: 240, y: 930, text: 'b', fontSize: 20, bold: true, color: '#333' },
        { type: 'text', x: 340, y: 930, text: 'c', fontSize: 20, bold: true, color: '#333' },
        { type: 'text', x: 440, y: 930, text: 'd', fontSize: 20, bold: true, color: '#333' },
        { type: 'text', x: 540, y: 930, text: 'e', fontSize: 20, bold: true, color: '#333' },
        { type: 'text', x: 640, y: 930, text: 'f', fontSize: 20, bold: true, color: '#333' },
        { type: 'text', x: 740, y: 930, text: 'g', fontSize: 20, bold: true, color: '#333' },
        { type: 'text', x: 840, y: 930, text: 'h', fontSize: 20, bold: true, color: '#333' },

        // Row labels (1-8) on left side
        { type: 'text', x: 70, y: 155, text: '8', fontSize: 20, bold: true, color: '#333' },
        { type: 'text', x: 70, y: 255, text: '7', fontSize: 20, bold: true, color: '#333' },
        { type: 'text', x: 70, y: 355, text: '6', fontSize: 20, bold: true, color: '#333' },
        { type: 'text', x: 70, y: 455, text: '5', fontSize: 20, bold: true, color: '#333' },
        { type: 'text', x: 70, y: 555, text: '4', fontSize: 20, bold: true, color: '#333' },
        { type: 'text', x: 70, y: 655, text: '3', fontSize: 20, bold: true, color: '#333' },
        { type: 'text', x: 70, y: 755, text: '2', fontSize: 20, bold: true, color: '#333' },
        { type: 'text', x: 70, y: 855, text: '1', fontSize: 20, bold: true, color: '#333' }
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
        { type: 'text', x: 320, y: 80, text: 'BINGO', fontSize: 48, bold: true, color: '#d32f2f' },

        // Outer border
        { type: 'rectangle', x: 150, y: 150, width: 500, height: 600, stroke: '#333', fill: '#fff9c4', lineWidth: 4 },

        // Header row with B-I-N-G-O
        { type: 'rectangle', x: 150, y: 150, width: 100, height: 100, stroke: '#333', fill: '#1565c0', lineWidth: 3 },
        { type: 'text', x: 185, y: 195, text: 'B', fontSize: 36, bold: true, color: '#ffffff' },

        { type: 'rectangle', x: 250, y: 150, width: 100, height: 100, stroke: '#333', fill: '#1565c0', lineWidth: 3 },
        { type: 'text', x: 290, y: 195, text: 'I', fontSize: 36, bold: true, color: '#ffffff' },

        { type: 'rectangle', x: 350, y: 150, width: 100, height: 100, stroke: '#333', fill: '#1565c0', lineWidth: 3 },
        { type: 'text', x: 382, y: 195, text: 'N', fontSize: 36, bold: true, color: '#ffffff' },

        { type: 'rectangle', x: 450, y: 150, width: 100, height: 100, stroke: '#333', fill: '#1565c0', lineWidth: 3 },
        { type: 'text', x: 480, y: 195, text: 'G', fontSize: 36, bold: true, color: '#ffffff' },

        { type: 'rectangle', x: 550, y: 150, width: 100, height: 100, stroke: '#333', fill: '#1565c0', lineWidth: 3 },
        { type: 'text', x: 582, y: 195, text: 'O', fontSize: 36, bold: true, color: '#ffffff' },

        // Row 1 (B: 1-15, I: 16-30, N: 31-45, G: 46-60, O: 61-75)
        { type: 'rectangle', x: 150, y: 250, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        { type: 'rectangle', x: 250, y: 250, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        { type: 'rectangle', x: 350, y: 250, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        { type: 'rectangle', x: 450, y: 250, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        { type: 'rectangle', x: 550, y: 250, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },

        // Row 2
        { type: 'rectangle', x: 150, y: 350, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        { type: 'rectangle', x: 250, y: 350, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        { type: 'rectangle', x: 350, y: 350, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        { type: 'rectangle', x: 450, y: 350, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        { type: 'rectangle', x: 550, y: 350, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },

        // Row 3 - with FREE space in center
        { type: 'rectangle', x: 150, y: 450, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        { type: 'rectangle', x: 250, y: 450, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        // FREE space
        { type: 'rectangle', x: 350, y: 450, width: 100, height: 100, stroke: '#333', fill: '#ffd54f', lineWidth: 2 },
        { type: 'text', x: 368, y: 495, text: 'FREE', fontSize: 20, bold: true, color: '#f57c00' },
        { type: 'rectangle', x: 450, y: 450, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        { type: 'rectangle', x: 550, y: 450, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },

        // Row 4
        { type: 'rectangle', x: 150, y: 550, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        { type: 'rectangle', x: 250, y: 550, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        { type: 'rectangle', x: 350, y: 550, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        { type: 'rectangle', x: 450, y: 550, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        { type: 'rectangle', x: 550, y: 550, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },

        // Row 5
        { type: 'rectangle', x: 150, y: 650, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        { type: 'rectangle', x: 250, y: 650, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        { type: 'rectangle', x: 350, y: 650, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        { type: 'rectangle', x: 450, y: 650, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },
        { type: 'rectangle', x: 550, y: 650, width: 100, height: 100, stroke: '#333', fill: '#ffffff', lineWidth: 2 },

        // Instructions
        { type: 'text', x: 200, y: 790, text: 'Fill in numbers 1-75 according to column:', fontSize: 14, bold: true, color: '#333' },
        { type: 'text', x: 180, y: 815, text: 'B: 1-15  |  I: 16-30  |  N: 31-45  |  G: 46-60  |  O: 61-75', fontSize: 12, color: '#666' },
        { type: 'text', x: 250, y: 850, text: 'Mark numbers as they are called!', fontSize: 14, color: '#d32f2f', bold: true }
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
