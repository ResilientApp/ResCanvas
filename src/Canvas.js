import React, { useRef, useState, useEffect } from 'react';

// Define UserData and Drawing structures
class Drawing {
  constructor(drawingId, color, lineWidth, pathData, timestamp) {
    this.drawingId = drawingId;
    this.color = color;
    this.lineWidth = lineWidth;
    this.pathData = pathData;
    this.timestamp = timestamp;
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

// Constants for main canvas and sub-canvas dimensions
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const SUB_CANVAS_ROWS = 4; // Partition the main canvas into a grid
const SUB_CANVAS_COLS = 4;

function Canvas() {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(5);
  const [pathData, setPathData] = useState([]);
  const [userData, setUserData] = useState(new UserData("000001", "aliceAndBob"));
  const [currentSubCanvas, setCurrentSubCanvas] = useState(null); // Track active sub-canvas
  const [lockedSubCanvases, setLockedSubCanvases] = useState({}); // Lock state for sub-canvases

  // Calculate sub-canvas size
  const subCanvasWidth = CANVAS_WIDTH / SUB_CANVAS_COLS;
  const subCanvasHeight = CANVAS_HEIGHT / SUB_CANVAS_ROWS;

  // Start drawing within a specific sub-canvas
  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    const { offsetX, offsetY } = e.nativeEvent;
    const col = Math.floor(offsetX / subCanvasWidth);
    const row = Math.floor(offsetY / subCanvasHeight);
    const subCanvasId = `${row},${col}`;

    // Check if the sub-canvas is locked
    if (lockedSubCanvases[subCanvasId]) {
      alert("This section is being edited by another user.");
      return;
    }

    // Lock the sub-canvas
    setLockedSubCanvases((prevLocked) => ({
      ...prevLocked,
      [subCanvasId]: true
    }));
    setCurrentSubCanvas(subCanvasId);

    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(offsetX, offsetY);
    setPathData([{ x: offsetX, y: offsetY }]); // Initialize path data
    setDrawing(true);
  };

  // Draw on the canvas and record path data
  const draw = (e) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    context.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    context.stroke();

    // Append coordinates to path data
    setPathData((prevPathData) => [
      ...prevPathData,
      { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }
    ]);
  };

  // Stop drawing and save the drawing data
  const stopDrawing = () => {
    if (!drawing) return;
    setDrawing(false);

    // Create a new drawing instance
    const newDrawing = new Drawing(
      `drawing_${Date.now()}`, // Unique ID for each drawing
      color,
      lineWidth,
      pathData,
      new Date().toISOString() // Timestamp
    );

    // Add the drawing to the user's drawings and update state
    userData.addDrawing(newDrawing);
    setUserData(userData);

    // Save sub-canvas data along with user data
    saveSubCanvas(currentSubCanvas, newDrawing, userData);

    // Unlock the sub-canvas and clear path data
    setLockedSubCanvases((prevLocked) => {
      const updatedLocks = { ...prevLocked };
      delete updatedLocks[currentSubCanvas];
      return updatedLocks;
    });
    setCurrentSubCanvas(null);
    setPathData([]); // Clear path data for next drawing
  };

  // Save a specific sub-canvas's data and distribute it across clients
  const saveSubCanvas = (subCanvasId, drawingData, userData) => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    // Calculate sub-canvas boundaries
    const [row, col] = subCanvasId.split(",").map(Number);
    const x = col * subCanvasWidth;
    const y = row * subCanvasHeight;

    // Take a screenshot of the sub-canvas
    const imageData = context.getImageData(x, y, subCanvasWidth, subCanvasHeight);

    // Submit data to NextRes database with user information
    submitToDatabase(subCanvasId, drawingData, userData, imageData);
    refreshSubCanvas(subCanvasId, imageData);
  };

  // Function to submit data to NextRes database
  const submitToDatabase = (subCanvasId, drawingData, userData, imageData) => {
    const databaseEntry = {
      subCanvasId,
      userId: userData.userId,
      username: userData.username,
      drawingData: {
        drawingId: drawingData.drawingId,
        color: drawingData.color,
        lineWidth: drawingData.lineWidth,
        pathData: drawingData.pathData,
        timestamp: drawingData.timestamp
      },
      imageData: Array.from(imageData.data) // Serialize image data
    };

    console.log("Submitting sub-canvas data to NextRes:", databaseEntry);

    // Replace with an actual call to NextRes (pseudo-code)
    // Example:
    // await sendToNextRes(databaseEntry);
  };

  // Mock function to send data to NextRes (replace with actual API call)
  const sendToNextRes = async (entry) => {
    // Assume an API call is made here to the NextRes database
    return new Promise((resolve) => setTimeout(resolve, 500)); // Simulated delay
  };

  // Refresh a specific sub-canvas on all clients (simulated)
  const refreshSubCanvas = (subCanvasId, imageData) => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    const [row, col] = subCanvasId.split(",").map(Number);
    const x = col * subCanvasWidth;
    const y = row * subCanvasHeight;

    // Update sub-canvas with new image data
    context.putImageData(imageData, x, y);
  };

  // Clear the entire canvas
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
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
