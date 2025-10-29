import React, { useRef, useEffect } from 'react';

// Improved canvas heatmap renderer. Points should be in canvas coordinate space
// or normalized to [0,1] and will be scaled. Each point: {x,y,intensity}
export default function HeatmapVisualization({ points = [], width = 600, height = 400 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // resize canvas backing store for high-DPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    if (!points || points.length === 0) return;

    // if points are normalized (0..1) detect by presence of x <= 1 and y <=1
    const normalized = points.every(p => p.x <= 1 && p.y <= 1);
    const pts = points.map(p => {
      const px = normalized ? (p.x * width) : p.x;
      const py = normalized ? (p.y * height) : p.y;
      return { x: px, y: py, intensity: Math.min(1, p.intensity || 0.5) };
    });

    // compute a max intensity for scaling
    const maxI = Math.max(...pts.map(p => p.intensity), 0.001);

    pts.forEach(p => {
      const intensity = p.intensity / maxI;
      const radius = 30 * intensity + 8;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      // color ramp from yellow -> red
      grad.addColorStop(0, `rgba(255,255,0,${0.6 * intensity})`);
      grad.addColorStop(0.6, `rgba(255,128,0,${0.45 * intensity})`);
      grad.addColorStop(1, `rgba(255,0,0,0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [points, width, height]);

  return <canvas ref={ref} width={width} height={height} style={{ width: '100%', height: 'auto', borderRadius: 8, background: '#fff' }} />;
}
