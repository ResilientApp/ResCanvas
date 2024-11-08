import React, { useRef, useState } from 'react';

function Canvas() {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(5);

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    setDrawing(true);
  };

  const draw = (e) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    context.stroke();
  };

  const stopDrawing = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.closePath();
    setDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        style={{ border: "1px solid #000" }}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
      />
      <div style={{ marginTop: "10px" }}>
        <label>
          Color: 
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <label style={{ marginLeft: "10px" }}>
          Line Width: 
          <input
            type="range"
            min="1"
            max="20"
            value={lineWidth}
            onChange={(e) => setLineWidth(e.target.value)}
          />
        </label>
        <button onClick={clearCanvas} style={{ marginLeft: "10px" }}>Clear Canvas</button>
      </div>
    </div>
  );
}

export default Canvas;
