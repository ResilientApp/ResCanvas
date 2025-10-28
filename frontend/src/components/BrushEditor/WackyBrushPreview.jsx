import React, { useEffect, useRef } from "react";

export default function WackyBrushPreview({ brushId, params = {} }) {
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Set a light background
    ctx.fillStyle = "#f8f9fa";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const intensity = (params.intensity || 50) / 50;
    const variation = (params.variation || 50) / 100;
    const flow = (params.flow || 50) / 100;

    // Draw brush preview based on type
    switch (brushId) {
      case "normal":
        drawNormalPreview(ctx, intensity, variation, flow);
        break;
      case "wacky":
        drawWackyPreview(ctx, intensity, variation, flow);
        break;
      case "drip":
        drawDripPreview(ctx, intensity, variation, flow);
        break;
      case "scatter":
        drawScatterPreview(ctx, intensity, variation, flow);
        break;
      case "neon":
        drawNeonPreview(ctx, intensity, variation, flow);
        break;
      case "chalk":
        drawChalkPreview(ctx, intensity, variation, flow);
        break;
      case "spray":
        drawSprayPreview(ctx, intensity, variation, flow);
        break;
      default:
        drawNormalPreview(ctx, intensity, variation, flow);
    }
  }, [brushId, params]);

  const drawNormalPreview = (ctx, intensity, variation, flow) => {
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 3 * intensity;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(20, 50);
    ctx.quadraticCurveTo(75, 20, 130, 50);
    ctx.stroke();
  };

  const drawWackyPreview = (ctx, intensity, variation, flow) => {
    const particles = Math.floor(25 * intensity);
    for (let i = 0; i < particles; i++) {
      const x = 20 + (i / particles) * 110;
      const y = 50 + Math.sin(i * 0.3) * 15 * variation;
      const size = (2 + Math.random() * 6) * intensity;
      
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${(i * 20) % 360}, 80%, 60%)`;
      ctx.globalAlpha = flow;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  const drawDripPreview = (ctx, intensity, variation, flow) => {
    // Main stroke
    ctx.strokeStyle = "#4a90e2";
    ctx.lineWidth = 4 * intensity;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(20, 40);
    ctx.quadraticCurveTo(75, 20, 130, 40);
    ctx.stroke();

    // Drips
    for (let i = 0; i < 5; i++) {
      const x = 30 + i * 25;
      const dripHeight = (10 + Math.random() * 20) * variation;
      ctx.beginPath();
      ctx.arc(x, 40 + dripHeight, 2 * intensity, 0, Math.PI * 2);
      ctx.fillStyle = "#4a90e2";
      ctx.globalAlpha = flow;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  const drawScatterPreview = (ctx, intensity, variation, flow) => {
    const centerY = 50;
    const points = Math.floor(40 * intensity);
    
    for (let i = 0; i < points; i++) {
      const x = 20 + Math.random() * 110;
      const y = centerY + (Math.random() - 0.5) * 30 * variation;
      const size = (1 + Math.random() * 4) * intensity;
      
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = "#e74c3c";
      ctx.globalAlpha = flow * 0.8;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  const drawNeonPreview = (ctx, intensity, variation, flow) => {
    ctx.save();
    ctx.shadowColor = "#00ff88";
    ctx.shadowBlur = 10 * intensity;
    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 3 * intensity;
    ctx.lineCap = "round";
    ctx.globalAlpha = flow;
    
    ctx.beginPath();
    ctx.moveTo(20, 50);
    ctx.quadraticCurveTo(75, 30 + 10 * variation, 130, 50);
    ctx.stroke();
    ctx.restore();
  };

  const drawChalkPreview = (ctx, intensity, variation, flow) => {
    const path = [];
    for (let x = 20; x <= 130; x += 2) {
      const y = 50 + Math.sin(x * 0.05) * 10;
      path.push({ x, y });
    }

    path.forEach(point => {
      for (let i = 0; i < 3; i++) {
        const offsetX = (Math.random() - 0.5) * 4 * variation;
        const offsetY = (Math.random() - 0.5) * 4 * variation;
        
        ctx.beginPath();
        ctx.arc(point.x + offsetX, point.y + offsetY, 1.5 * intensity, 0, Math.PI * 2);
        ctx.fillStyle = "#f39c12";
        ctx.globalAlpha = flow * (0.3 + Math.random() * 0.4);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
  };

  const drawSprayPreview = (ctx, intensity, variation, flow) => {
    const centerY = 50;
    const sprayPoints = Math.floor(60 * intensity);
    
    for (let i = 0; i < sprayPoints; i++) {
      const progress = i / sprayPoints;
      const centerX = 20 + progress * 110;
      
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 15 * variation;
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;
      
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fillStyle = "#9b59b6";
      ctx.globalAlpha = flow * 0.6;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  return (
    <canvas 
      ref={canvasRef} 
      width={150} 
      height={100} 
      style={{ 
        border: '1px solid #e0e0e0', 
        borderRadius: '4px',
        background: '#fff'
      }} 
    />
  );
}
