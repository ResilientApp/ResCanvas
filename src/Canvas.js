import React, { useRef, useState, useEffect } from 'react';
import { SketchPicker } from "react-color";
import "./Canvas.css";
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';

class Drawing {
  constructor(drawingId, color, lineWidth, pathData, timestamp, user) {
    this.drawingId = drawingId;
    this.color = color;
    this.lineWidth = lineWidth;
    this.pathData = pathData;
    this.timestamp = timestamp;
    this.user = user;
    this.brushStyle = "round";
  }
}

class UserData {
  constructor(userId, username) {
    this.userId = userId;
    this.username = username;
    this.drawings = [];
  }

  addDrawing(drawing) {
    this.drawings.push(drawing);
  }
}

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 1000;

function Canvas({ currentUser, setUserList, selectedUser, setSelectedUser }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(5);

  const [drawMode, setDrawMode] = useState("freehand");
  const [shapeType, setShapeType] = useState("circle");
  const [brushStyle, setBrushStyle] = useState("round");
  const [shapeStart, setShapeStart] = useState(null);
  const [shapeEnd, setShapeEnd] = useState(null);

  const [pathData, setPathData] = useState([]);
  const initializeUserData = () => {
    const uniqueUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    return new UserData(uniqueUserId, "MainUser");
  };
  const [userData, setUserData] = useState(() => initializeUserData());
  const tempPathRef = useRef([]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previousColor, setPreviousColor] = useState(null);
  const [isEraserActive, setIsEraserActive] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [redoAvailable, setRedoAvailable] = useState(false);

  useEffect(() => {
    setIsRefreshing(true);
    clearCanvasForRefresh();
    refreshCanvas(0).then(() => {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    });
  }, [selectedUser]);

  useEffect(() => {
    setUndoAvailable(undoStack.length > 0);
    setRedoAvailable(redoStack.length > 0);
    checkUndoRedoAvailability();
  }, [undoStack, redoStack]);

  const drawShapePreview = (start, end, shape, color, lineWidth) => {
    if (!start || !end) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
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
        const angle = Math.PI / 3 * i;
        const x = start.x + radius * Math.cos(angle);
        const y = start.y + radius * Math.sin(angle);

        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }

      context.closePath();
      context.stroke();
    } else if (shape === "line") {
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);

      // Apply brush style to preview as well
      context.lineCap = brushStyle;
      context.lineJoin = brushStyle;
      context.stroke();
    }

    context.restore();
  };

  const startDrawing = (e) => {
    if (isRefreshing) {
      alert("Please wait for the canvas to refresh before drawing again.");
      return;
    }
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    if (drawMode === "freehand") {
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
      setShapeStart({ x, y });
      setShapeEnd(null);
      setDrawing(true);
    }
  };

  const draw = (e) => {
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
      
      setPathData((prevPathData) => [...prevPathData, { x, y }]);
      tempPathRef.current.push({ x, y });
    } else if (drawMode === "shape" && drawing) {
      setShapeEnd({ x, y });
      drawAllDrawings();
      drawShapePreview(shapeStart, { x, y }, shapeType, color, lineWidth);
    }
  };

  const stopDrawing = async (e) => {
    if (!drawing) return;
    setDrawing(false);
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const finalX = (e.clientX - rect.left) * scaleX;
    const finalY = (e.clientY - rect.top) * scaleY;
    
    if (drawMode === "freehand") {
      const newDrawing = new Drawing(
        `drawing_${Date.now()}`,
        color,
        lineWidth,
        tempPathRef.current,
        Date.now(),
        currentUser
      );

      // Save the brush style so that it is reapplied on redraw
      newDrawing.brushStyle = brushStyle;
      setUndoStack((prev) => [...prev, newDrawing]);
      setRedoStack([]);
      setIsRefreshing(true);

      try {
        userData.addDrawing(newDrawing);
        await submitToDatabase(newDrawing);
        await refreshCanvas(userData.drawings.length);
      } catch (error) {
        console.error("Error during submission or refresh:", error);
      } finally {
        setIsRefreshing(false);
      }

      setPathData([]);
      tempPathRef.current = [];
    } else if (drawMode === "shape") {
      const finalEnd = { x: finalX, y: finalY };
      setShapeEnd(finalEnd);
      const context = canvas.getContext("2d");
      context.save();
      context.fillStyle = color;
      context.lineWidth = lineWidth;
      context.setLineDash([]);

      if (shapeType === "circle") {
        const radius = Math.sqrt((finalEnd.x - shapeStart.x) ** 2 + (finalEnd.y - shapeStart.y) ** 2);
        context.beginPath();
        context.arc(shapeStart.x, shapeStart.y, radius, 0, Math.PI * 2);
        context.fill();
      } else if (shapeType === "rectangle") {
        context.fillRect(shapeStart.x, shapeStart.y, finalEnd.x - shapeStart.x, finalEnd.y - shapeStart.y);
      } else if (shapeType === "hexagon") {
        const radius = Math.sqrt((finalEnd.x - shapeStart.x) ** 2 + (finalEnd.y - shapeStart.y) ** 2);
        context.beginPath();

        for (let i = 0; i < 6; i++) {
          const angle = Math.PI / 3 * i;
          const xPoint = shapeStart.x + radius * Math.cos(angle);
          const yPoint = shapeStart.y + radius * Math.sin(angle);

          if (i === 0) context.moveTo(xPoint, yPoint);
          else context.lineTo(xPoint, yPoint);
        }
        context.closePath();
        context.fill();
      } else if (shapeType === "line") {
        // Draw a straight line using the current brush style
        context.beginPath();
        context.moveTo(shapeStart.x, shapeStart.y);
        context.lineTo(finalEnd.x, finalEnd.y);

        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.lineCap = brushStyle;
        context.lineJoin = brushStyle;

        context.stroke();
      }
      context.restore();

      // Record the shape drawing action
      const shapeDrawingData = {
        tool: "shape",
        type: shapeType,
        start: shapeStart,
        end: finalEnd,
        brushStyle: shapeType === "line" ? brushStyle : undefined
      };

      const newDrawing = new Drawing(
        `drawing_${Date.now()}`,
        color,
        lineWidth,
        shapeDrawingData,
        Date.now(),
        currentUser
      );

      // For straight line (and freehand), record the brush style
      if (shapeType === "line") {
        newDrawing.brushStyle = brushStyle;
      }

      setUndoStack((prev) => [...prev, newDrawing]);
      setRedoStack([]);
      setIsRefreshing(true);

      try {
        userData.addDrawing(newDrawing);
        await submitToDatabase(newDrawing);
        await refreshCanvas(userData.drawings.length);
      } catch (error) {
        console.error("Error during shape submission:", error);
      } finally {
        setIsRefreshing(false);
      }

      setShapeStart(null);
      setShapeEnd(null);
    }
  };

  const checkUndoRedoAvailability = async () => {
    try {
      if (currentUser) {
        const response = await fetch(`http://67.181.112.179:10010/checkUndoRedo?userId=${currentUser}`);
        const result = await response.json();
      } else {
        setUndoAvailable(false);
        setRedoAvailable(false);
      }
    } catch (error) {
      console.error(`Error during checkUndoRedoAvailability: ${error}`);
    }
  };

  const submitToDatabase = async (drawingData) => {
    const apiPayload = {
      ts: drawingData.timestamp,
      value: JSON.stringify(drawingData),
      user: currentUser,
      deletion_date_flag: '',
    };

    const apiUrl = "http://67.181.112.179:10010/submitNewLine";

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiPayload)
      });
      if (!response.ok) {
        throw new Error(`Failed to submit data: ${response.statusText}`);
      }
      await response.json();
    } catch (error) {
      console.error("Error submitting data to NextRes:", error);
    }
  };

  const refreshCanvas = async (from) => {
    const apiUrl = `http://67.181.112.179:10010/getCanvasData?from=${from}`;
    try {
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch canvas data: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.status !== "success") {
        throw new Error(`Error in response: ${result.message}`);
      }
      
      const newDrawings = result.data.map((item) => {
        const { id, value, user } = item;
        if (!value) return null;
        const drawingData = JSON.parse(value);

        return new Drawing(
          drawingData.drawingId,
          drawingData.color,
          drawingData.lineWidth,
          drawingData.pathData,
          drawingData.timestamp,
          user && user,
        );
      }).filter(Boolean);

      userData.drawings = newDrawings;
      drawAllDrawings();
    } catch (error) {
      console.error("Error refreshing canvas:", error);
    }
  };

  const drawAllDrawings = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const userSet = new Set();

    userData.drawings.forEach((drawing) => {
      context.globalAlpha = 1.0;
      if (selectedUser !== "" && drawing.user !== selectedUser) {
        context.globalAlpha = 0.1;
      }
      if (Array.isArray(drawing.pathData)) {
        // Freehand drawing
        context.beginPath();
        const pts = drawing.pathData;
        if (pts.length > 0) {
          context.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            context.lineTo(pts[i].x, pts[i].y);
          }

          context.strokeStyle = drawing.color;
          context.lineWidth = drawing.lineWidth;
          context.lineCap = drawing.brushStyle || "round";
          context.lineJoin = drawing.brushStyle || "round";
          context.stroke();
        }
      } else if (drawing.pathData && drawing.pathData.tool === "shape") {
        const { type, start, end, brushStyle: storedBrush } = drawing.pathData;
        context.save();
        context.fillStyle = drawing.color;
        context.lineWidth = drawing.lineWidth;

        if (type === "circle") {
          const radius = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
          context.beginPath();
          context.arc(start.x, start.y, radius, 0, Math.PI * 2);
          context.fill();
        } else if (type === "rectangle") {
          context.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
        } else if (type === "hexagon") {
          const radius = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
          context.beginPath();

          for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 3 * i;
            const xPoint = start.x + radius * Math.cos(angle);
            const yPoint = start.y + radius * Math.sin(angle);
            if (i === 0) context.moveTo(xPoint, yPoint);
            else context.lineTo(xPoint, yPoint);
          }

          context.closePath();
          context.fill();

        } else if (type === "line") {
          context.beginPath();
          context.moveTo(start.x, start.y);
          context.lineTo(end.x, end.y);
          context.strokeStyle = drawing.color;
          context.lineWidth = drawing.lineWidth;

          // Use stored brush style if available
          const cap = storedBrush || drawing.brushStyle || "round";
          context.lineCap = cap;
          context.lineJoin = cap;
          context.stroke();
        }
        context.restore();
      }
      if (drawing.user) userSet.add(drawing.user);
    });
    if (selectedUser === "") setUserList(Array.from(userSet));
  };

  const undo = async () => {
    if (undoStack.length === 0) return;
    try {
      const lastAction = undoStack.pop();
      setUndoStack([...undoStack]);

      const response = await fetch("http://67.181.112.179:10010/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser }),
      });

      if (!response.ok) throw new Error(`Undo failed: ${response.statusText}`);

      const result = await response.json();
      if (result.status === "success") {
        setRedoStack((prev) => [...prev, lastAction]);
        userData.drawings = userData.drawings.filter(
          (drawing) => drawing.drawingId !== lastAction.drawingId
        );
        drawAllDrawings();
      } else {
        console.error("Undo failed:", result.message);
      }
    } catch (error) {
      console.error("Error during undo:", error);
    } finally {
      refreshCanvasButtonHandler();
      checkUndoRedoAvailability();
    }
  };

  const redo = async () => {
    if (redoStack.length === 0) return;
    try {
      const lastUndone = redoStack.pop();
      setRedoStack([...redoStack]);

      const response = await fetch("http://67.181.112.179:10010/redo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser }),
      });

      if (!response.ok) throw new Error(`Redo failed: ${response.statusText}`);

      const result = await response.json();
      if (result.status === "success") {
        setUndoStack((prev) => [...prev, lastUndone]);
        userData.drawings.push(lastUndone);
        drawAllDrawings();
      } else {
        console.error("Redo failed:", result.message);
      }
    } catch (error) {
      console.error("Error during redo:", error);
    } finally {
      refreshCanvasButtonHandler();
      checkUndoRedoAvailability();
    }
  };

  const clearBackendCanvas = async () => {
    const apiPayload = { ts: Date.now() };
    const apiUrl = "http://67.181.112.179:10010/submitClearCanvasTimestamp";
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiPayload)
      });
      if (!response.ok) throw new Error(`Failed to submit data: ${response.statusText}`);
      await response.json();
    } catch (error) {
      console.error("Error submitting data to NextRes:", error);
    }
  };

  const clearCanvas = async () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    setUserData(initializeUserData());
    setUndoStack([]);
    setRedoStack([]);
  };

  const clearCanvasForRefresh = async () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    setUserData(initializeUserData());
  };

  const toggleColorPicker = (event) => {
    const viewportHeight = window.innerHeight;
    const pickerHeight = 350;
    const rect = event.target.getBoundingClientRect();
    const pickerElement = document.querySelector(".Canvas-color-picker");

    setShowColorPicker(!showColorPicker);

    if (rect.bottom + pickerHeight > viewportHeight && pickerElement) {
      pickerElement.classList.add("Canvas-color-picker--adjust-bottom");
    } else if (pickerElement) {
      pickerElement.classList.remove("Canvas-color-picker--adjust-bottom");
    }
  };

  const closeColorPicker = () => {
    setShowColorPicker(false);
  };

  const refreshCanvasButtonHandler = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    
    try {
      clearCanvasForRefresh();
      await refreshCanvas(0);
    } catch (error) {
      console.error("Error during canvas refresh:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="Canvas-container" style={{ pointerEvents: selectedUser !== "" ? "none" : "auto" }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="Canvas-element"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
      />
      {isRefreshing && (
        <div className="Canvas-loading-overlay">
          <div className="Canvas-spinner"></div>
        </div>
      )}
      <div className="Canvas-controls">
        {/* New controls for draw mode, shape type, and brush style */}
        <div className="Canvas-label-group">
          <label className="Canvas-label">Draw Mode:</label>
          <select value={drawMode} onChange={(e) => setDrawMode(e.target.value)}>
            <option value="freehand">Freehand</option>
            <option value="shape">Shape</option>
          </select>
        </div>
        {drawMode === "shape" && (
          <div className="Canvas-label-group">
            <label className="Canvas-label">Shape Type:</label>
            <select value={shapeType} onChange={(e) => setShapeType(e.target.value)}>
              <option value="circle">Circle</option>
              <option value="rectangle">Rectangle</option>
              <option value="hexagon">Hexagon</option>
              <option value="line">Line</option>
            </select>
          </div>
        )}
        <div className="Canvas-label-group">
          <label className="Canvas-label">Brush Style:</label>
          <select value={brushStyle} onChange={(e) => setBrushStyle(e.target.value)}>
            <option value="round">Round</option>
            <option value="square">Square</option>
            <option value="butt">Butt</option>
          </select>
        </div>
        <div className="Canvas-label-group">
          <label className="Canvas-label">Color:</label>
          <div style={{ position: 'relative' }}>
            <div
              className="Canvas-color-display"
              style={{ backgroundColor: color }}
              onClick={toggleColorPicker}
            ></div>
            {showColorPicker && (
              <div className="Canvas-color-picker">
                <SketchPicker color={color} onChange={(newColor) => setColor(newColor.hex)} />
                <button className="Canvas-close-button" onClick={closeColorPicker}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="Canvas-label-group">
          <label className="Canvas-label">Line Width:</label>
          <input
            type="range"
            min="1"
            max="20"
            value={lineWidth}
            onChange={(e) => setLineWidth(e.target.value)}
            className="Canvas-input-range"
          />
        </div>
        <button
          onClick={() => {
            if (!isEraserActive) {
              setPreviousColor(color);
              setColor('#FFFFFF');
              setIsEraserActive(true);
            } else {
              setColor(previousColor);
              setPreviousColor(null);
              setIsEraserActive(false);
            }
          }}
          className={`Canvas-button ${isEraserActive ? 'Canvas-button-active' : ''}`}
        >
          Eraser
        </button>
        <button onClick={refreshCanvasButtonHandler} className="Canvas-button">
          Refresh Canvas
        </button>
        <button onClick={() => setClearDialogOpen(true)} className="Canvas-button">
          Clear Canvas
        </button>
        <button onClick={undo} disabled={!undoAvailable} className="Canvas-button">
          Undo
        </button>
        <button onClick={redo} disabled={!redoAvailable} className="Canvas-button">
          Redo
        </button>
      </div>
      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)}>
        <DialogTitle>Clear Canvas</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to clear the canvas for everyone?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)} color="primary">
            No
          </Button>
          <Button onClick={() => {
            clearCanvas();
            clearBackendCanvas();
            setUserList([]);
            setClearDialogOpen(false);
          }} color="primary" autoFocus>
            Yes
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

export default Canvas;
