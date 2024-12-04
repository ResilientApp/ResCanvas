import React, { useRef, useState, useEffect } from 'react';
import { SketchPicker } from "react-color";
import "./Canvas.css";

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
const CANVAS_WIDTH = 500;
const CANVAS_HEIGHT = 500;

function Canvas() {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(5);
  const [pathData, setPathData] = useState([]);
  const initializeUserData = () => {
    const uniqueUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    return new UserData(uniqueUserId, "MainUser");
  };
  
  const [userData, setUserData] = useState(() => initializeUserData());
  // const [userData, setUserData] = useState(new UserData("000001", "MainUser"));
  const tempPathRef = useRef([]); // Ref for immediate path data updates
  const [showColorPicker, setShowColorPicker] = useState(false);

  // State Variable isRefreshing
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Start drawing within a specific sub-canvas
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
  
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(x, y);
  
    console.log('START ' + x + ' ' + y);
    setPathData([{ x, y }]);
    tempPathRef.current = [{ x, y }];
    setDrawing(true);
  };

  // Draw on the canvas and record path data
  const draw = (e) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
  
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
  
    context.lineTo(x, y);
    context.stroke();
    context.beginPath();
    context.moveTo(x, y);
  
    // Append coordinates to path data
    setPathData((prevPathData) => [
      ...prevPathData,
      { x, y }
    ]);
    tempPathRef.current.push({ x, y });
  };

  // Stop drawing and save the drawing data
  const stopDrawing = async () => {
    if (!drawing) return;
    setDrawing(false);
    console.log(pathData)

    // Create a new drawing instance
    const newDrawing = new Drawing(
      `drawing_${Date.now()}`, // Unique ID for each drawing
      color,
      lineWidth,
      tempPathRef.current,
      new Date().toISOString() // Timestamp
    );

    // Lock refreshing process
    setIsRefreshing(true);

    // Save sub-canvas data along with user data
    try {
      // Submit data to NextRes database with user information
      await submitToDatabase(newDrawing); // Wait for submit
      await refreshCanvas(userData.drawings.length);  // TODO: check the edge case
    } catch (error) {
      console.error("Error during submission or refresh:", error);
    } finally {
      setIsRefreshing(false); // Unlock the refreshing process
    }

    setPathData([]); // Clear path data for next drawing
    tempPathRef.current = [];
  };

  // Function to submit data to NextRes database
  const submitToDatabase = async (drawingData) => {
    console.log("Submitting sub-canvas data to NextRes:", drawingData);

    // Prepare the data to send to the backend API
    const apiPayload = {
      ts: drawingData.timestamp, // Use timestamp from the drawing
      value: JSON.stringify(drawingData) // Serialize the entire entry as a string
    };

    // Define the API endpoint
    const apiUrl = "http://67.181.112.179:10010/submitNewLine";

    try {
      // Send the data to the backend
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(apiPayload) // Convert payload to JSON
      });

      if (!response.ok) {
        throw new Error(`Failed to submit data: ${response.statusText}`);
      }

      const result = await response.json();
      console.log("Data successfully submitted to NextRes:", result);
    } catch (error) {
      console.error("Error submitting data to NextRes:", error);
    }
  };

  // Mock function to send data to NextRes (replace with actual API call)
  const sendToNextRes = async (entry) => {
    // Assume an API call is made here to the NextRes database
    return new Promise((resolve) => setTimeout(resolve, 500)); // Simulated delay
  };

  // Refresh a specific sub-canvas on all clients
  const refreshCanvas = async (from) => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    const apiUrl = `http://67.181.112.179:10010/getCanvasData?from=${from}`; // Add parameter to URL

    try {
      // Send GET request
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch canvas data: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.status !== "success") {
        throw new Error(`Error in response: ${result.message}`);
      }

      console.log('result is:')
      console.log(result)
      console.log(result.data)

      // Iterate the data
      const newDrawings = result.data.map((item) => {
        const { id, value } = item;
        if (!value) return null; // Skip empty data

        // Parse value to JSON
        const drawingData = JSON.parse(value);

        // Create a new drawing
        return new Drawing(
          drawingData.drawingId,
          drawingData.color,
          drawingData.lineWidth,
          drawingData.pathData,
          drawingData.timestamp
        );
      })
        .filter(Boolean);

      userData.drawings = [...userData.drawings, ...newDrawings]

      // Redraw the canvas after fetching new drawing data
      drawAllDrawings();

      console.log("Canvas successfully refreshed from:", from);
    } catch (error) {
      console.error("Error refreshing canvas:", error);
    }
  };

  // Function to draw all drawings on the canvas
  const drawAllDrawings = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    // Clear the canvas before redrawing
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Iterate through all drawings and render them
    userData.drawings.forEach((drawing) => {
      context.beginPath();
      context.strokeStyle = drawing.color;
      context.lineWidth = drawing.lineWidth;
      context.lineCap = "round";

      const pathData = drawing.pathData;
      if (pathData.length > 0) {
        context.moveTo(pathData[0].x, pathData[0].y);
        for (let i = 1; i < pathData.length; i++) {
          context.lineTo(pathData[i].x, pathData[i].y);
        }
        context.stroke();
      }
    });
  };

  useEffect(() => {
    console.log('Call useEffect... Init...')
    // Lock refreshing process
    setIsRefreshing(true);
    // Initialize state
    clearCanvas();
    refreshCanvas(0).then(() => {
      setTimeout(() => {
        setIsRefreshing(false); // Stop the animation
      }, 500); // Delay 500 ms to stop the animation
    });
  }, []);

  // Clear the entire canvas
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    setUserData(initializeUserData());
  };

  const handleColorChange = (newColor) => {
    setColor(newColor.hex);
  };

  const toggleColorPicker = (event) => {
    const viewportHeight = window.innerHeight;
    const pickerHeight = 350; // Approximate height of the SketchPicker
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
    if (isRefreshing) return; // Prevent concurrent refreshes
  
    console.log("Starting canvas refresh...");
    setIsRefreshing(true);
  
    try {
      clearCanvas(); // Synchronously clear the canvas
      await refreshCanvas(0); // Refresh canvas starting from 0
    } catch (error) {
      console.error("Error during canvas refresh:", error);
    } finally {
      setIsRefreshing(false); // Ensure the refreshing state is reset
      console.log("Canvas refresh complete.");
    }
  };

  return (
    <div className="Canvas-container" style={{ position: 'relative' }}>
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
        <div className="Canvas-label-group">
          <label className="Canvas-label">Color:</label>
          <div>
            <div
              className="Canvas-color-display"
              style={{ backgroundColor: color }}
              onClick={toggleColorPicker}
            ></div>
            {showColorPicker && (
              <div className="Canvas-color-picker">
                <SketchPicker
                  color={color}
                  onChange={(color) => setColor(color.hex)}
                />
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

        <button onClick={refreshCanvasButtonHandler} className="Canvas-button">
          Refresh Canvas
        </button>

        <button onClick={clearCanvas} className="Canvas-button">
          Clear Canvas
        </button>
      </div>
    </div>
  );
}

export default Canvas;
