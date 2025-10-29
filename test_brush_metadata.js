// Simple test to verify brush metadata persistence
// This will help us debug the exact issue

const testStroke = {
  drawingId: "test_stroke_123",
  color: "#ff0000", 
  lineWidth: 10,
  pathData: [[100, 100], [200, 200]],
  timestamp: Date.now(),
  user: "testuser",
  roomId: "test_room",
  brushType: "chalk",
  brushParams: { opacity: 0.7, texture: "rough" },
  metadata: {
    brushStyle: "round",
    brushType: "chalk", 
    brushParams: { opacity: 0.7, texture: "rough" },
    drawingType: "stroke"
  }
};

console.log("Test stroke being submitted:", testStroke);

// We'll manually test this data through the backend to see exactly what gets stored and retrieved
