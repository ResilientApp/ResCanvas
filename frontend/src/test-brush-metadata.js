// Test script to debug brush metadata
import { Drawing } from './lib/drawing.js';

// Test creating a drawing with metadata
const testDrawing = new Drawing(
  'test-123',
  '#ff0000',
  5,
  [{x: 10, y: 10}, {x: 20, y: 20}],
  Date.now(),
  'testuser',
  {
    brushStyle: 'round',
    brushType: 'wacky',
    brushParams: { intensity: 80, variation: 60 },
    drawingType: 'stroke'
  }
);

console.log('Created drawing:');
console.log('brushType:', testDrawing.brushType);
console.log('brushParams:', testDrawing.brushParams);
console.log('metadata:', testDrawing.getMetadata());

// Test serialization/deserialization
const serialized = JSON.stringify(testDrawing);
console.log('Serialized:', serialized);

const parsed = JSON.parse(serialized);
console.log('Parsed:');
console.log('brushType:', parsed.brushType);
console.log('brushParams:', parsed.brushParams);

// Test recreating from parsed data
const recreated = new Drawing(
  parsed.drawingId,
  parsed.color,
  parsed.lineWidth,
  parsed.pathData,
  parsed.timestamp,
  parsed.user,
  {
    brushStyle: parsed.brushStyle,
    brushType: parsed.brushType,
    brushParams: parsed.brushParams,
    drawingType: parsed.drawingType
  }
);

console.log('Recreated drawing:');
console.log('brushType:', recreated.brushType);
console.log('brushParams:', recreated.brushParams);
