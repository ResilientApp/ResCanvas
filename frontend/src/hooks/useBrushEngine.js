import { useState, useCallback, useRef } from "react";

/**
 * Advanced brush engine with support for complex brush types
 */
export default function useBrushEngine(initialCtx = null) {
  const [brushType, setBrushType] = useState("normal");
  const [brushParams, setBrushParams] = useState({});
  const [ctx, setCtx] = useState(initialCtx);
  const particleTrailRef = useRef([]);
  const lastPointRef = useRef(null);

  // Brush configurations
  const brushConfigs = {
    normal: { size: 1, opacity: 1 },
    wacky: { scatter: 5, colors: true, particles: 3 },
    drip: { droplets: 2, gravity: 0.5, viscosity: 0.3 },
    scatter: { spread: 20, density: 5, variation: 0.8 },
    neon: { glow: 10, intensity: 0.9 },
    chalk: { texture: true, opacity: 0.7, roughness: 0.5 },
    spray: { density: 15, spread: 25, pressure: 0.6 }
  };

  const drawNormalBrush = useCallback((x, y, lineWidth, color) => {
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [ctx]);

  const drawWackyBrush = useCallback((x, y, lineWidth, color) => {
    if (!ctx) return;
    const config = brushConfigs.wacky;
    
    for (let i = 0; i < config.particles; i++) {
      const offsetX = (Math.random() - 0.5) * config.scatter * lineWidth;
      const offsetY = (Math.random() - 0.5) * config.scatter * lineWidth;
      const size = Math.random() * lineWidth * 0.8 + lineWidth * 0.2;
      
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + offsetX, y + offsetY, size, 0, 2 * Math.PI);
      
      if (config.colors) {
        ctx.fillStyle = `hsl(${Math.random() * 360}, 80%, 60%)`;
      } else {
        ctx.fillStyle = color;
      }
      
      ctx.fill();
      ctx.restore();
    }
  }, [ctx, brushConfigs]);

  const drawDripBrush = useCallback((x, y, lineWidth, color) => {
    if (!ctx) return;
    const config = brushConfigs.drip;
    
    // Main stroke
    ctx.lineTo(x, y);
    ctx.stroke();
    
    // Add droplets with chance
    if (Math.random() < 0.1) {
      for (let i = 0; i < config.droplets; i++) {
        const dropX = x + (Math.random() - 0.5) * lineWidth;
        const dropY = y + Math.random() * lineWidth * 3;
        const dropSize = Math.random() * lineWidth * 0.3;
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(dropX, dropY, dropSize, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.globalAlpha = config.viscosity;
        ctx.fill();
        ctx.restore();
      }
    }
  }, [ctx, brushConfigs]);

  const drawScatterBrush = useCallback((x, y, lineWidth, color) => {
    if (!ctx) return;
    const config = brushConfigs.scatter;
    
    for (let i = 0; i < config.density; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * config.spread;
      const scatterX = x + Math.cos(angle) * distance;
      const scatterY = y + Math.sin(angle) * distance;
      const size = Math.random() * lineWidth * config.variation + lineWidth * 0.2;
      
      ctx.save();
      ctx.beginPath();
      ctx.arc(scatterX, scatterY, size, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.6;
      ctx.fill();
      ctx.restore();
    }
  }, [ctx, brushConfigs]);

  const drawNeonBrush = useCallback((x, y, lineWidth, color) => {
    if (!ctx) return;
    const config = brushConfigs.neon;
    
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = config.glow;
    ctx.globalAlpha = config.intensity;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
  }, [ctx, brushConfigs]);

  const drawChalkBrush = useCallback((x, y, lineWidth, color) => {
    if (!ctx) return;
    const config = brushConfigs.chalk;
    
    // Create textured effect with multiple small strokes
    for (let i = 0; i < 3; i++) {
      const offsetX = (Math.random() - 0.5) * lineWidth * config.roughness;
      const offsetY = (Math.random() - 0.5) * lineWidth * config.roughness;
      
      ctx.save();
      ctx.globalAlpha = config.opacity * (0.3 + Math.random() * 0.7);
      ctx.beginPath();
      ctx.arc(x + offsetX, y + offsetY, lineWidth * 0.8, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    }
  }, [ctx, brushConfigs]);

  const drawSprayBrush = useCallback((x, y, lineWidth, color) => {
    if (!ctx) return;
    const config = brushConfigs.spray;
    
    for (let i = 0; i < config.density; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * config.spread * config.pressure;
      const sprayX = x + Math.cos(angle) * distance;
      const sprayY = y + Math.sin(angle) * distance;
      const size = Math.random() * 2 + 1;
      
      ctx.save();
      ctx.beginPath();
      ctx.arc(sprayX, sprayY, size, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.3;
      ctx.fill();
      ctx.restore();
    }
  }, [ctx, brushConfigs]);
  const draw = useCallback((x, y, lineWidth, color) => {
    if (!ctx) {
      console.log("BrushEngine: No context available");
      return;
    }
    
    console.log("BrushEngine: Drawing with brush type:", brushType);
    
    switch (brushType) {
      case "normal":
        drawNormalBrush(x, y, lineWidth, color);
        break;
      case "wacky":
        drawWackyBrush(x, y, lineWidth, color);
        break;
      case "drip":
        drawDripBrush(x, y, lineWidth, color);
        break;
      case "scatter":
        drawScatterBrush(x, y, lineWidth, color);
        break;
      case "neon":
        drawNeonBrush(x, y, lineWidth, color);
        break;
      case "chalk":
        drawChalkBrush(x, y, lineWidth, color);
        break;
      case "spray":
        drawSprayBrush(x, y, lineWidth, color);
        break;
      default:
        drawNormalBrush(x, y, lineWidth, color);
    }

    lastPointRef.current = { x, y };
  }, [ctx, brushType, drawNormalBrush, drawWackyBrush, drawDripBrush, drawScatterBrush, drawNeonBrush, drawChalkBrush, drawSprayBrush]);

  const startStroke = useCallback((x, y) => {
    if (!ctx) return;
    lastPointRef.current = { x, y };
    particleTrailRef.current = [];
    
    // For normal brush, ensure we start with a point
    if (brushType === "normal") {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  }, [ctx, brushType]);

  const getBrushConfig = useCallback(() => {
    return brushConfigs[brushType] || brushConfigs.normal;
  }, [brushType, brushConfigs]);

  const updateContext = useCallback((newCtx) => {
    setCtx(newCtx);
  }, []);

  return { 
    brushType, 
    setBrushType, 
    brushParams, 
    setBrushParams,
    draw, 
    startStroke,
    getBrushConfig,
    updateContext,
    availableBrushes: Object.keys(brushConfigs)
  };
}
