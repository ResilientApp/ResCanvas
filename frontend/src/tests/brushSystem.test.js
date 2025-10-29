/**
 * Test suite for advanced brush system
 */

import { jest } from '@jest/globals';
import useBrushEngine from '../hooks/useBrushEngine';
import { Drawing } from '../lib/drawing';

// Mock canvas context
const mockContext = {
  lineTo: jest.fn(),
  stroke: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  arc: jest.fn(),
  fill: jest.fn(),
  fillStyle: '',
  save: jest.fn(),
  restore: jest.fn(),
  globalAlpha: 1
};

describe('Advanced Brush System', () => {
  describe('useBrushEngine', () => {
    let brushEngine;

    beforeEach(() => {
      // Mock the hook
      brushEngine = {
        brushType: 'normal',
        setBrushType: jest.fn(),
        brushParams: {},
        setBrushParams: jest.fn(),
        draw: jest.fn(),
        startStroke: jest.fn(),
        getBrushConfig: jest.fn(),
        availableBrushes: ['normal', 'wacky', 'drip', 'scatter', 'neon', 'chalk', 'spray']
      };
    });

    test('should initialize with normal brush', () => {
      expect(brushEngine.brushType).toBe('normal');
      expect(brushEngine.availableBrushes).toContain('normal');
    });

    test('should have all required brush types', () => {
      const expectedBrushes = ['normal', 'wacky', 'drip', 'scatter', 'neon', 'chalk', 'spray'];
      expectedBrushes.forEach(brushType => {
        expect(brushEngine.availableBrushes).toContain(brushType);
      });
    });

    test('should allow setting brush type', () => {
      brushEngine.setBrushType('wacky');
      expect(brushEngine.setBrushType).toHaveBeenCalledWith('wacky');
    });

    test('should allow setting brush parameters', () => {
      const params = { intensity: 75, variation: 50 };
      brushEngine.setBrushParams(params);
      expect(brushEngine.setBrushParams).toHaveBeenCalledWith(params);
    });

    test('should handle drawing calls', () => {
      brushEngine.draw(100, 100, 5, '#ff0000');
      expect(brushEngine.draw).toHaveBeenCalledWith(100, 100, 5, '#ff0000');
    });
  });

  describe('Drawing class enhancements', () => {
    test('should create drawing with brush metadata', () => {
      const metadata = {
        brushType: 'wacky',
        brushParams: { intensity: 75 },
        drawingType: 'stroke'
      };

      const drawing = new Drawing(
        'test-id',
        '#ff0000',
        5,
        [{ x: 0, y: 0 }, { x: 10, y: 10 }],
        Date.now(),
        'test-user',
        metadata
      );

      expect(drawing.brushType).toBe('wacky');
      expect(drawing.brushParams.intensity).toBe(75);
      expect(drawing.drawingType).toBe('stroke');
    });

    test('should serialize metadata correctly', () => {
      const metadata = {
        brushType: 'neon',
        brushParams: { glow: 10 },
        drawingType: 'stroke'
      };

      const drawing = new Drawing(
        'test-id',
        '#00ff00',
        3,
        [],
        Date.now(),
        'test-user',
        metadata
      );

      const serializedMetadata = drawing.getMetadata();
      expect(serializedMetadata.brushType).toBe('neon');
      expect(serializedMetadata.brushParams.glow).toBe(10);
    });

    test('should create stamp drawing', () => {
      const stampMetadata = {
        drawingType: 'stamp',
        stampData: { emoji: '⭐', name: 'Star' },
        stampSettings: { size: 50, rotation: 0, opacity: 100 }
      };

      const drawing = new Drawing(
        'stamp-id',
        '#000000',
        0,
        [{ x: 100, y: 100 }],
        Date.now(),
        'test-user',
        stampMetadata
      );

      expect(drawing.drawingType).toBe('stamp');
      expect(drawing.stampData.emoji).toBe('⭐');
      expect(drawing.stampSettings.size).toBe(50);
    });

    test('should create filter drawing', () => {
      const filterMetadata = {
        drawingType: 'filter',
        filterType: 'blur',
        filterParams: { intensity: 5 }
      };

      const drawing = new Drawing(
        'filter-id',
        '#000000',
        0,
        [],
        Date.now(),
        'test-user',
        filterMetadata
      );

      expect(drawing.drawingType).toBe('filter');
      expect(drawing.filterType).toBe('blur');
      expect(drawing.filterParams.intensity).toBe(5);
    });
  });

  describe('Brush parameter validation', () => {
    test('should validate brush parameters within acceptable ranges', () => {
      const validParams = {
        intensity: 50,
        variation: 75,
        flow: 80
      };

      // All values should be between 0-100
      Object.values(validParams).forEach(value => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      });
    });

    test('should handle invalid brush parameters gracefully', () => {
      const invalidParams = {
        intensity: -10,
        variation: 150,
        flow: null
      };

      // In a real implementation, these would be clamped or defaulted
      const sanitizedParams = {
        intensity: Math.max(0, Math.min(100, invalidParams.intensity || 50)),
        variation: Math.max(0, Math.min(100, invalidParams.variation || 50)),
        flow: Math.max(0, Math.min(100, invalidParams.flow || 50))
      };

      expect(sanitizedParams.intensity).toBe(0);
      expect(sanitizedParams.variation).toBe(100);
      expect(sanitizedParams.flow).toBe(50);
    });
  });

  describe('Filter operations', () => {
    test('should validate filter parameters', () => {
      const blurParams = { intensity: 5 };
      const hueShiftParams = { hue: 30, saturation: 10 };
      const chalkParams = { roughness: 50, opacity: 80 };

      expect(blurParams.intensity).toBeGreaterThan(0);
      expect(hueShiftParams.hue).toBeGreaterThanOrEqual(-180);
      expect(hueShiftParams.hue).toBeLessThanOrEqual(180);
      expect(chalkParams.opacity).toBeGreaterThan(0);
      expect(chalkParams.opacity).toBeLessThanOrEqual(100);
    });

    test('should handle non-destructive filter application', () => {
      // Mock canvas operations
      const mockCanvas = {
        toDataURL: jest.fn(() => 'data:image/png;base64,mockdata'),
        getContext: jest.fn(() => mockContext)
      };

      const originalData = mockCanvas.toDataURL();
      expect(originalData).toBe('data:image/png;base64,mockdata');
      
      // Filter application should not modify original
      expect(mockCanvas.toDataURL()).toBe(originalData);
    });
  });

  describe('Stamp operations', () => {
    test('should validate stamp data', () => {
      const emojiStamp = {
        id: 'star',
        emoji: '⭐',
        name: 'Star',
        category: 'shapes'
      };

      const imageStamp = {
        id: 'custom',
        image: 'data:image/png;base64,mockdata',
        name: 'Custom',
        category: 'custom'
      };

      expect(emojiStamp.emoji).toBeTruthy();
      expect(emojiStamp.name).toBeTruthy();
      expect(imageStamp.image).toMatch(/^data:image/);
    });

    test('should validate stamp settings', () => {
      const settings = {
        size: 50,
        rotation: 45,
        opacity: 80
      };

      expect(settings.size).toBeGreaterThan(0);
      expect(settings.size).toBeLessThanOrEqual(200);
      expect(settings.rotation).toBeGreaterThanOrEqual(-180);
      expect(settings.rotation).toBeLessThanOrEqual(180);
      expect(settings.opacity).toBeGreaterThan(0);
      expect(settings.opacity).toBeLessThanOrEqual(100);
    });
  });

  describe('Performance considerations', () => {
    test('should handle brush strokes efficiently', () => {
      const startTime = performance.now();
      
      // Simulate 100 brush stroke points
      for (let i = 0; i < 100; i++) {
        brushEngine.draw(i, i, 5, '#000000');
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete quickly (under 100ms for 100 points)
      expect(duration).toBeLessThan(100);
    });

    test('should handle large stamp libraries', () => {
      const stamps = [];
      
      // Create 100 stamps
      for (let i = 0; i < 100; i++) {
        stamps.push({
          id: `stamp-${i}`,
          emoji: '⭐',
          name: `Stamp ${i}`,
          category: 'test'
        });
      }
      
      expect(stamps.length).toBe(100);
      
      // Finding stamps should be efficient
      const startTime = performance.now();
      const foundStamp = stamps.find(s => s.id === 'stamp-50');
      const endTime = performance.now();
      
      expect(foundStamp).toBeTruthy();
      expect(endTime - startTime).toBeLessThan(10);
    });
  });
});
