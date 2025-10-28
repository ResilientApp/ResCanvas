import { useState, useCallback, useRef } from "react";

export default function useBrushEngine(initialCtx = null) {
  const [brushType, setBrushType] = useState("normal");
  const [brushParams, setBrushParams] = useState({});
  const ctxRef = useRef(initialCtx);  const particleTrailRef = useRef([]);
  const lastPointRef = useRef(null);

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
    if (!ctxRef.current) return;
    ctxRef.current.lineTo(x, y);
    ctxRef.current.stroke();
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(x, y);
  }, []);

  const drawWackyBrush = useCallback((x, y, lineWidth, color) => {
    if (!ctxRef.current) return;
    const config = brushConfigs.wacky;

    for (let i = 0; i < config.particles; i++) {
      const offsetX = (Math.random() - 0.5) * config.scatter * lineWidth;
      const offsetY = (Math.random() - 0.5) * config.scatter * lineWidth;
      const size = Math.random() * lineWidth * 0.8 + lineWidth * 0.2;

      ctxRef.current.save();
      ctxRef.current.beginPath();
      ctxRef.current.arc(x + offsetX, y + offsetY, size, 0, 2 * Math.PI);

      if (config.colors) {
        ctxRef.current.fillStyle = `hsl(${Math.random() * 360}, 80%, 60%)`;
      } else {
        ctxRef.current.fillStyle = color;
      }

      ctxRef.current.fill();
      ctxRef.current.restore();
    }
  }, []);

  const drawDripBrush = useCallback((x, y, lineWidth, color) => {
    if (!ctxRef.current) return;
    const config = brushConfigs.drip;

    ctxRef.current.lineTo(x, y);
    ctxRef.current.stroke();

    if (Math.random() < 0.1) {
      for (let i = 0; i < config.droplets; i++) {
        const dropX = x + (Math.random() - 0.5) * lineWidth;
        const dropY = y + Math.random() * lineWidth * 3;
        const dropSize = Math.random() * lineWidth * 0.3;

        ctxRef.current.save();
        ctxRef.current.beginPath();
        ctxRef.current.arc(dropX, dropY, dropSize, 0, 2 * Math.PI);
        ctxRef.current.fillStyle = color;
        ctxRef.current.globalAlpha = config.viscosity;
        ctxRef.current.fill();
        ctxRef.current.restore();
      }
    }
  }, []);

  const drawScatterBrush = useCallback((x, y, lineWidth, color) => {
    if (!ctxRef.current) return;
    const config = brushConfigs.scatter;

    for (let i = 0; i < config.density; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * config.spread;
      const scatterX = x + Math.cos(angle) * distance;
      const scatterY = y + Math.sin(angle) * distance;
      const size = Math.random() * lineWidth * config.variation + lineWidth * 0.2;

      ctxRef.current.save();
      ctxRef.current.beginPath();
      ctxRef.current.arc(scatterX, scatterY, size, 0, 2 * Math.PI);
      ctxRef.current.fillStyle = color;
      ctxRef.current.globalAlpha = 0.6;
      ctxRef.current.fill();
      ctxRef.current.restore();
    }
  }, []);

  const drawNeonBrush = useCallback((x, y, lineWidth, color) => {
    if (!ctxRef.current) return;
    const config = brushConfigs.neon;

    ctxRef.current.save();
    ctxRef.current.shadowColor = color;
    ctxRef.current.shadowBlur = config.glow;
    ctxRef.current.globalAlpha = config.intensity;
    ctxRef.current.lineTo(x, y);
    ctxRef.current.stroke();
    ctxRef.current.restore();
  }, []);

  const drawChalkBrush = useCallback((x, y, lineWidth, color) => {
    if (!ctxRef.current) return;
    const config = brushConfigs.chalk;

    for (let i = 0; i < 3; i++) {
      const offsetX = (Math.random() - 0.5) * lineWidth * config.roughness;
      const offsetY = (Math.random() - 0.5) * lineWidth * config.roughness;

      ctxRef.current.save();
      ctxRef.current.globalAlpha = config.opacity * (0.3 + Math.random() * 0.7);
      ctxRef.current.beginPath();
      ctxRef.current.arc(x + offsetX, y + offsetY, lineWidth * 0.8, 0, 2 * Math.PI);
      ctxRef.current.fillStyle = color;
      ctxRef.current.fill();
      ctxRef.current.restore();
    }
  }, []);

  const drawSprayBrush = useCallback((x, y, lineWidth, color) => {
    if (!ctxRef.current) return;
    const config = brushConfigs.spray;

    for (let i = 0; i < config.density; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * config.spread * config.pressure;
      const sprayX = x + Math.cos(angle) * distance;
      const sprayY = y + Math.sin(angle) * distance;
      const size = Math.random() * 2 + 1;

      ctxRef.current.save();
      ctxRef.current.beginPath();
      ctxRef.current.arc(sprayX, sprayY, size, 0, 2 * Math.PI);
      ctxRef.current.fillStyle = color;
      ctxRef.current.globalAlpha = 0.3;
      ctxRef.current.fill();
      ctxRef.current.restore();
    }
  }, []);
  const draw = useCallback((x, y, lineWidth, color) => {
    if (!ctxRef.current) {
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
  }, [brushType, drawNormalBrush, drawWackyBrush, drawDripBrush, drawScatterBrush, drawNeonBrush, drawChalkBrush, drawSprayBrush]);

  const drawWithType = useCallback((x, y, lineWidth, color, specificBrushType) => {
    if (!ctxRef.current) {
      console.log("BrushEngine: No context available");
      return;
    }

    switch (specificBrushType) {
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
  }, [drawNormalBrush, drawWackyBrush, drawDripBrush, drawScatterBrush, drawNeonBrush, drawChalkBrush, drawSprayBrush]);

  const startStroke = useCallback((x, y) => {
    if (!ctxRef.current) return;
    lastPointRef.current = { x, y };
    particleTrailRef.current = [];

    if (brushType === "normal") {
      ctxRef.current.beginPath();
      ctxRef.current.moveTo(x, y);
    }
  }, [brushType]);

  const getBrushConfig = useCallback(() => {
    return brushConfigs[brushType] || brushConfigs.normal;
  }, [brushType, brushConfigs]);

  const updateContext = useCallback((newCtx) => {
    ctxRef.current = newCtx;  }, []);

  return {
    brushType,
    setBrushType,
    brushParams,
    setBrushParams,
    draw,
    drawWithType,
    startStroke,
    getBrushConfig,
    updateContext,
    availableBrushes: Object.keys(brushConfigs)
  };
}
