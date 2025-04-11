import { useState, useRef } from 'react';

export const useCanvasDrawing = (canvasRef) => {
  // Local drawing state.
  const [drawing, setDrawing] = useState(false);
  const [pathData, setPathData] = useState([]);       // For freehand strokes
  const [shapeStart, setShapeStart] = useState(null);   // For shape drawing
  const [shapeEnd, setShapeEnd] = useState(null);       // For shape drawing
  const tempPathRef = useRef([]);

  // Helper function: Renders a preview of a shape on the canvas.
  const drawShapePreview = (canvas, start, end, shape, color, lineWidth, brushStyle) => {
    if (!start || !end) return;
    const context = canvas.getContext("2d");
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    // Use a dashed line style for preview.
    context.setLineDash([5, 3]);

    if (shape === "circle") {
      const radius = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
      context.beginPath();
      context.arc(start.x, start.y, radius, 0, Math.PI * 2);
      context.stroke();
    } else if (shape === "rectangle") {
      context.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    } else if (shape === "hexagon") {
      const radius = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
      context.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const xPoint = start.x + radius * Math.cos(angle);
        const yPoint = start.y + radius * Math.sin(angle);
        if (i === 0) {
          context.moveTo(xPoint, yPoint);
        } else {
          context.lineTo(xPoint, yPoint);
        }
      }
      context.closePath();
      context.stroke();
    } else if (shape === "line") {
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      // Optionally, you can apply brush style in line mode.
      context.lineCap = brushStyle;
      context.lineJoin = brushStyle;
      context.stroke();
    }
    context.restore();
  };

  // Handler to start drawing.
  // 'params' should include properties like: drawMode, color, lineWidth, brushStyle, and snapshotRef.
  const startDrawing = (e, params) => {
    const { drawMode, color, lineWidth, brushStyle, snapshotRef } = params;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (drawMode === "freehand") {
      const context = canvas.getContext("2d");
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.lineCap = brushStyle;
      context.lineJoin = brushStyle;
      context.beginPath();
      context.moveTo(x, y);
      setPathData([{ x, y }]);
      tempPathRef.current = [{ x, y }];
      setDrawing(true);
    } else if (drawMode === "shape") {
      // For shapes: record the starting point and capture the canvas snapshot.
      setShapeStart({ x, y });
      setShapeEnd(null);
      setDrawing(true);
      const dataURL = canvas.toDataURL();
      const snapshotImg = new Image();
      snapshotImg.src = dataURL;
      if (snapshotRef) {
        snapshotRef.current = snapshotImg;
      }
    }
    // Additional handling (like select or paste) can be added here.
  };

  // Draw handler.
  // 'params' should include: drawMode, color, lineWidth, brushStyle, shapeType, snapshotRef.
  const draw = (e, params) => {
    const { drawMode, color, lineWidth, brushStyle, shapeType, snapshotRef } = params;
    if (!drawing) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (drawMode === "freehand") {
      context.lineTo(x, y);
      context.stroke();
      context.beginPath();
      context.moveTo(x, y);
      setPathData((prev) => [...prev, { x, y }]);
      tempPathRef.current.push({ x, y });
    } else if (drawMode === "shape" && drawing) {
      setShapeEnd({ x, y });
      // Use the snapshot to restore the canvas before drawing preview.
      if (snapshotRef && snapshotRef.current && snapshotRef.current.complete) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(snapshotRef.current, 0, 0);
      }
      drawShapePreview(canvas, shapeStart, { x, y }, shapeType, color, lineWidth, brushStyle);
    }
    // You can add additional modes here (e.g., select or paste).
  };

  // Stop drawing handler.
  // This can be expanded to return or process the final drawing data.
  const stopDrawing = () => {
    setDrawing(false);
    // Optionally reset temporary state like snapshotRef or tempPathRef if desired.
  };

  return {
    drawing,
    pathData,
    shapeStart,
    shapeEnd,
    startDrawing,
    draw,
    stopDrawing,
    setDrawing,
    setPathData,
    setShapeStart,
    setShapeEnd,
    tempPathRef,
  };
};
