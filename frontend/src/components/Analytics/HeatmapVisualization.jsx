import React, { useRef, useEffect } from 'react';

// Very lightweight canvas heatmap renderer that expects points {x,y,intensity}
export default function HeatmapVisualization({ points = [], width = 600, height = 400 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    points.forEach(p => {
      const intensity = Math.min(1, p.intensity || 0.5);
      const radius = 20 * intensity + 6;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      grad.addColorStop(0, `rgba(255,0,0,${0.6 * intensity})`);
      grad.addColorStop(1, `rgba(255,0,0,0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [points, width, height]);

  return <canvas ref={ref} width={width} height={height} style={{ width: '100%', height: 'auto', borderRadius: 8, background: '#fff' }} />;
}
