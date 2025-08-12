import React, { useRef, useState, useEffect } from 'react';
import "./Canvas.css";

import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton
} from '@mui/material';

import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Toolbar from './Toolbar';
import { useCanvasSelection } from './useCanvasSelection';
import {
  submitToDatabase,
  refreshCanvas as backendRefreshCanvas,
  clearBackendCanvas,
  undoAction,
  redoAction,
  checkUndoRedoAvailability
} from './canvasBackend';
import { Drawing } from './drawing';

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

const DEFAULT_CANVAS_WIDTH = 3000;
const DEFAULT_CANVAS_HEIGHT = 2000;

function Canvas({ currentUser, setUserList, setTimeList, selectedUser, setSelectedUser, selectedTime, setSelectedTime }) {
  const canvasRef = useRef(null);
  const snapshotRef = useRef(null);
  const tempPathRef = useRef([]);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(5);
  const [drawMode, setDrawMode] = useState("freehand");
  const [shapeType, setShapeType] = useState("circle");
  const [brushStyle, setBrushStyle] = useState("round");
  const [shapeStart, setShapeStart] = useState(null);

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previousColor, setPreviousColor] = useState(null);
  const [isEraserActive, setIsEraserActive] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [redoAvailable, setRedoAvailable] = useState(false);

  const canvasWidth = DEFAULT_CANVAS_WIDTH;
  const canvasHeight = DEFAULT_CANVAS_HEIGHT;

  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOriginRef = useRef({ x: 0, y: 0 });
  const [pendingDrawings, setPendingDrawings] = useState([]);
  const [historyMode, setHistoryMode] = useState(false);

  // when the user selects a username under a timestamp, we set viewingSelection=true
  const [viewingSelection, setViewingSelection] = useState(false);
  // recall range state (for history recall range queries)
  const [recallStart, setRecallStart] = useState("");
  const [recallEnd, setRecallEnd] = useState("");
  useEffect(() => {
    const handleMouseUp = () => {
      setIsPanning(false);
      panOriginRef.current = { ...panOffset };
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [panOffset]);

  const initializeUserData = () => {
    const uniqueUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    return new UserData(uniqueUserId, "MainUser");
  };
  const [userData, setUserData] = useState(() => initializeUserData());

  useEffect(() => {
    drawAllDrawings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panOffset]);  

  const generateId = () => `drawing_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

// Track how many strokes the server has told us about
const serverCountRef = useRef(0);
const refreshTimeoutRef = useRef(null);
const scheduleRefresh = () => {
  if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
  refreshTimeoutRef.current = setTimeout(() => {
    mergedRefreshCanvas();
  }, 200);
};

  const drawAllDrawings = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvasWidth, canvasHeight);

    const sortedDrawings = [...userData.drawings].sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : a.timestamp;
      const orderB = b.order !== undefined ? b.order : b.timestamp;
      return orderA - orderB;
    });
    
    sortedDrawings.forEach((drawing) => {
      // Fade strokes outside selected time or user
      context.globalAlpha = 1.0;
      if (selectedTime) {
        const strokeHour = new Date(drawing.timestamp).toISOString().slice(0,13).replace('T',' ');
        if (strokeHour !== selectedTime) context.globalAlpha = 0.1;
      } else if (selectedUser && drawing.user !== selectedUser) {
        context.globalAlpha = 0.1;
      }
      if (Array.isArray(drawing.pathData)) {
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
        if (drawing.pathData.points) {
          const pts = drawing.pathData.points;
          context.save();
          context.beginPath();
          context.moveTo(pts[0].x, pts[0].y);

          for (let i = 1; i < pts.length; i++) {
            context.lineTo(pts[i].x, pts[i].y);
          }
          context.closePath();

          context.fillStyle = drawing.color;
          context.fill();
          
          context.globalCompositeOperation = 'destination-out';
          context.lineWidth = 1;
          context.stroke();
          context.restore();
        } else {
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
            const cap = storedBrush || drawing.brushStyle || "round";
            context.lineCap = cap;
            context.lineJoin = cap;
            context.stroke();
          }
          context.restore();
        }
      } else if (drawing.pathData && drawing.pathData.tool === "image") {
        const { image, x, y, width, height } = drawing.pathData;

        let img = new Image();
        img.src = image;
        img.onload = () => {
          context.drawImage(img, x, y, width, height);
        };
      } else if (drawing.pathData && drawing.pathData.tool === "cut") {
        const { rect: r } = drawing.pathData;
        context.fillStyle = "#FFFFFF";
        context.fillRect(r.x, r.y, r.width, r.height);
      }
    });
    if (selectedUser === "") {
      const userSet = new Set();

      userData.drawings.forEach(d => {
        if (d.user) userSet.add(d.user);
      });
      setUserList(Array.from(userSet));
    }
  };

  const {
    selectionStart, setSelectionStart,
    selectionRect, setSelectionRect,
    cutImageData, setCutImageData,
    handleCutSelection,
  } = useCanvasSelection(canvasRef, currentUser, userData, generateId, drawAllDrawings);

  // Draw a preview of a shape (for shape mode)
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
        const angle = (Math.PI / 3) * i;
        const xPoint = start.x + radius * Math.cos(angle);
        const yPoint = start.y + radius * Math.sin(angle);

        if (i === 0) context.moveTo(xPoint, yPoint);
        else context.lineTo(xPoint, yPoint);
      }
      context.closePath();
      context.stroke();
    } else if (shape === "line") {
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.lineCap = brushStyle;
      context.lineJoin = brushStyle;
      context.stroke();
    }

    context.restore();
  };

  // Handle paste action for cut selection
  const handlePaste = async (e) => {
    if (!cutImageData || !Array.isArray(cutImageData) || cutImageData.length === 0) {
      alert("No cut selection available to paste.");
      setDrawMode("freehand");
      return;
    }

    const canvas = canvasRef.current;
    const rectCanvas = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rectCanvas.width;
    const scaleY = canvas.height / rectCanvas.height;
    const pasteX = (e.clientX - rectCanvas.left) * scaleX;
    const pasteY = (e.clientY - rectCanvas.top) * scaleY;

    let minX = Infinity, minY = Infinity;

    cutImageData.forEach((drawing) => {
      if (Array.isArray(drawing.pathData)) {
        drawing.pathData.forEach((pt) => {
          minX = Math.min(minX, pt.x);
          minY = Math.min(minY, pt.y);
        });
      } else if (drawing.pathData && drawing.pathData.tool === "shape") {
        if (drawing.pathData.points && Array.isArray(drawing.pathData.points)) {
          drawing.pathData.points.forEach((pt) => {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
          });
        } else if (drawing.pathData.type === "line") {
          if (drawing.pathData.start) {
            minX = Math.min(minX, drawing.pathData.start.x);
            minY = Math.min(minY, drawing.pathData.start.y);
          }
          if (drawing.pathData.end) {
            minX = Math.min(minX, drawing.pathData.end.x);
            minY = Math.min(minY, drawing.pathData.end.y);
          }
        }
      }
    });

    if (minX === Infinity || minY === Infinity) {
      alert("Invalid cut data.");
      return;
    }

    const offsetX = pasteX - minX;
    const offsetY = pasteY - minY;
    let pastedDrawings = [];

    const newDrawings = cutImageData.map((originalDrawing) => {
      let newPathData;
      if (Array.isArray(originalDrawing.pathData)) {
        newPathData = originalDrawing.pathData.map((pt) => ({
          x: pt.x + offsetX,
          y: pt.y + offsetY,
        }));
      } else if (originalDrawing.pathData && originalDrawing.pathData.tool === "shape") {
        if (originalDrawing.pathData.points && Array.isArray(originalDrawing.pathData.points)) {
          const newPoints = originalDrawing.pathData.points.map((pt) => ({
            x: pt.x + offsetX,
            y: pt.y + offsetY,
          }));
          newPathData = { ...originalDrawing.pathData, points: newPoints };
        } else if (originalDrawing.pathData.type === "line") {
          const newStart = {
            x: originalDrawing.pathData.start.x + offsetX,
            y: originalDrawing.pathData.start.y + offsetY,
          };
          const newEnd = {
            x: originalDrawing.pathData.end.x + offsetX,
            y: originalDrawing.pathData.end.y + offsetY,
          };
          newPathData = { ...originalDrawing.pathData, start: newStart, end: newEnd };
        }
      } else {
        return null;
      }

      return new Drawing(
        generateId(),
        originalDrawing.color,
        originalDrawing.lineWidth,
        newPathData,
        Date.now(),
        currentUser
      );
    }).filter(Boolean);

    setIsRefreshing(true);
    for (const newDrawing of newDrawings) {
      // Remove individual pushes to undoStack.
      setRedoStack([]);
      try {
        userData.addDrawing(newDrawing);
        await submitToDatabase(newDrawing, currentUser);
        pastedDrawings.push(newDrawing);
      } catch (error) {
        console.error("Failed to save drawing:", newDrawing, error);
      }
    }
    setUndoStack(prev => [...prev, { type: 'paste', pastedDrawings: pastedDrawings, backendCount: pastedDrawings.length }]);
    setIsRefreshing(false);

    tempPathRef.current = [];
    if (pastedDrawings.length === newDrawings.length) {
      drawAllDrawings();
      setCutImageData([]);
      setDrawMode("freehand");
    } else {
      alert("Some strokes may not have been saved. Please try again.");
    }
  };

  /**
* mergedRefreshCanvas(historyOverride, startOverride, endOverride)
* - historyOverride: boolean or undefined. If undefined uses current historyMode state.
* - startOverride / endOverride: ms epoch ints or null — used when querying a recall range.
*/
const mergedRefreshCanvas = async (historyOverride = undefined, startOverride = null, endOverride = null) => {
  const historyFlag = (typeof historyOverride === 'boolean') ? historyOverride : historyMode;
  const backendCount = await backendRefreshCanvas(serverCountRef.current, userData, drawAllDrawings, currentUser, historyFlag, startOverride, endOverride);

  serverCountRef.current = backendCount;

  // now re-append any pending that aren’t already in userData
  pendingDrawings.forEach(pd => {
    if (!userData.drawings.find(d => d.drawingId === pd.drawingId)) {
      userData.drawings.push(pd);
    }
  });

  // Recompute user/time lists and draw immediately
  try {
    const userSet = new Set();
    const timeMap = {};
    userData.drawings.forEach(d => {
      if (d.user) userSet.add(d.user);
      if (!d.ts && !d.timestamp) return;
      const ts = d.ts || d.timestamp;
      const hourKey = new Date(ts).toISOString().slice(0,13).replace('T',' ');
      if (!timeMap[hourKey]) timeMap[hourKey] = new Set();
      if (d.user) timeMap[hourKey].add(d.user.split("|")[0]);
    });
    if (typeof setUserList === 'function') setUserList(Array.from(userSet));
    if (typeof setTimeList === 'function') {
      const tl = Object.entries(timeMap).sort((a,b) => b[0].localeCompare(a[0])).map(([time, users]) => ({ time, users: Array.from(users) }));
      setTimeList(tl);
    }
  } catch (err) {
    console.error('Error computing lists after refresh', err);
  }

  // Immediate redraw
  drawAllDrawings();
};

  const startDrawingHandler = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;    
  
    if (e.button === 1) {
      // Middle mouse button: start panning
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY };
      panOriginRef.current = { ...panOffset };
      backendRefreshCanvas(userData.drawings.length, userData, drawAllDrawings, currentUser);
      return;
    }
  
    if (drawMode === "eraser" || drawMode === "freehand") {
      const context = canvas.getContext("2d");
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.lineCap = brushStyle;
      context.lineJoin = brushStyle;
      context.beginPath();
      context.moveTo(x, y);
      tempPathRef.current = [{ x, y }];
  
      setDrawing(true);
    } else if (drawMode === "shape") {
      setShapeStart({ x, y });
      setDrawing(true);
  
      const dataURL = canvas.toDataURL();
      let snapshotImg = new Image();
  
      snapshotImg.src = dataURL;
      snapshotRef.current = snapshotImg;
    } else if (drawMode === "select") {
      setSelectionStart({ x, y });
      setSelectionRect(null);
      setDrawing(true);
  
      const dataURL = canvas.toDataURL();
      let snapshotImg = new Image();
  
      snapshotImg.src = dataURL;
      snapshotRef.current = snapshotImg;
    } else if (drawMode === "paste") {
      handlePaste(e);
    }
  };  

  const handlePan = (e) => {
    if (!isPanning) return;

    // If the middle button is no longer pressed, stop panning.
    if (!(e.buttons & 4)) {
      setIsPanning(false);
      panOriginRef.current = { ...panOffset };
      return;
    }

    const deltaX = e.clientX - panStartRef.current.x;
    const deltaY = e.clientY - panStartRef.current.y;
    let newX = panOriginRef.current.x + deltaX;
    let newY = panOriginRef.current.y + deltaY;
    
    // Get container dimensions (Canvas-wrapper fills viewport)
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;
    
    // Calculate minimum allowed offsets so that the canvas edge is not exceeded.
    // Our canvas is fixed at canvasWidth and canvasHeight.
    const minX = containerWidth - canvasWidth; // This will be negative if canvasWidth > containerWidth
    const minY = containerHeight - canvasHeight;
    
    // The maximum offset is 0 (i.e. the canvas's top/left edge aligned with container).
    newX = clamp(newX, minX, 0);
    newY = clamp(newY, minY, 0);
    
    setPanOffset({
      x: newX,
      y: newY,
    });
  };  
  
  const drawHandler = (e) => {
    if (isPanning) {
      handlePan(e);
      return;
    }
    if (!drawing) return;
  
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;    
  
    if (drawMode === "eraser" || drawMode === "freehand") {
      const context = canvas.getContext("2d");
      context.lineTo(x, y);
      context.stroke();
      context.beginPath();
      context.moveTo(x, y);
      tempPathRef.current.push({ x, y });
    } else if (drawMode === "shape" && drawing) {
      // update shape preview with adjusted coordinates
      if (snapshotRef.current && snapshotRef.current.complete) {
        const context = canvas.getContext("2d");
        context.clearRect(0, 0, canvasWidth, canvasHeight);
        context.drawImage(snapshotRef.current, 0, 0);
      }
  
      drawShapePreview(shapeStart, { x, y }, shapeType, color, lineWidth);
    } else if (drawMode === "select" && drawing) {
      setSelectionRect({ start: selectionStart, end: { x, y } });
  
      if (snapshotRef.current && snapshotRef.current.complete) {
        const context = canvas.getContext("2d");
        context.clearRect(0, 0, canvasWidth, canvasHeight);
        context.drawImage(snapshotRef.current, 0, 0);
      }
  
      const context = canvas.getContext("2d");
      context.save();
      context.strokeStyle = "blue";
      context.lineWidth = 1;
      context.setLineDash([6, 3]);
  
      const s = selectionStart;
      const selX = Math.min(s.x, x);
      const selY = Math.min(s.y, y);
      const selWidth = Math.abs(x - s.x);
      const selHeight = Math.abs(y - s.y);
  
      context.strokeRect(selX, selY, selWidth, selHeight);
      context.restore();
    }
  };
  
  const stopDrawingHandler = async (e) => {
    if (isPanning && e.button === 1) {
      setIsPanning(false);
      return;
    }
    if (!drawing) return;
    setDrawing(false);

    snapshotRef.current = null;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const finalX = e.clientX - rect.left;
    const finalY = e.clientY - rect.top;

    if (drawMode === "eraser" || drawMode === "freehand") {
      const newDrawing = new Drawing(
        `drawing_${Date.now()}`,
        color,
        lineWidth,
        tempPathRef.current,
        Date.now(),
        currentUser
      );
      newDrawing.brushStyle = brushStyle;

      setUndoStack(prev => [...prev, newDrawing]);
      setRedoStack([]);
      setIsRefreshing(true);

      try {
        userData.addDrawing(newDrawing);
        const newPendingList = [...pendingDrawings, newDrawing];
        setPendingDrawings(newPendingList);
        drawAllDrawings();

        await submitToDatabase(newDrawing, currentUser);
        setPendingDrawings(prev => prev.filter(d => d.drawingId !== newDrawing.drawingId));
        scheduleRefresh();
      } catch (error) {
        console.error("Error during freehand submission or refresh:", error);
      } finally {
        setIsRefreshing(false);
      }
      tempPathRef.current = [];
    } else if (drawMode === "shape") {

      if (!shapeStart) {
        return;
      }

      const finalEnd = { x: finalX, y: finalY };
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

      if (shapeType === "line") {
        newDrawing.brushStyle = brushStyle;
      }

      userData.addDrawing(newDrawing);
      setPendingDrawings(prev => [...prev, newDrawing]);
      drawAllDrawings();

      setUndoStack(prev => [...prev, newDrawing]);
      setRedoStack([]);
      setIsRefreshing(true);

      try {
        await submitToDatabase(newDrawing, currentUser);
        setPendingDrawings(prev => prev.filter(d => d.drawingId !== newDrawing.drawingId));
        mergedRefreshCanvas();
      } catch (error) {
        console.error("Error during shape submission:", error);
      } finally {
        setIsRefreshing(false);
      }
      setShapeStart(null);
    } else if (drawMode === "select") {
      setDrawing(false);

      try {
        await mergedRefreshCanvas();
      } catch (error) {
        console.error("Error during select submission or refresh:", error);
      } finally {
        setIsRefreshing(false);
      }

      mergedRefreshCanvas();
    }
  };

  const clearCanvas = async () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    context.clearRect(0, 0, canvasWidth, canvasHeight);

    setUserData(initializeUserData());
    setUndoStack([]);
    setRedoStack([]);
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

  const clearCanvasForRefresh = async () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    context.clearRect(0, 0, canvasWidth, canvasHeight);
    setUserData(initializeUserData());
  };

  const refreshCanvasButtonHandler = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await clearCanvasForRefresh();
      await mergedRefreshCanvas();
    } catch (error) {
      console.error("Error during canvas refresh:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handler for toggling history mode that avoids stale-state problem:
  const handleToggleHistoryMode = async () => {
    const newHistory = !historyMode;
    setHistoryMode(newHistory);
    // pass explicit newHistory to refresh to avoid stale closure
    const startMs = recallStart ? new Date(recallStart).getTime() : null;
    const endMs = recallEnd ? new Date(recallEnd).getTime() : null;
    await mergedRefreshCanvas(newHistory, startMs, endMs);
  };
  
  // Handler to apply a recall range (user sets start/end and clicks Apply)
  const handleApplyRecallRange = async () => {
    const startMs = recallStart ? new Date(recallStart).getTime() : null;
    const endMs = recallEnd ? new Date(recallEnd).getTime() : null;
    await mergedRefreshCanvas(historyMode, startMs, endMs);
  };

  const undo = async () => {
    if (undoStack.length === 0) return;
    if (isRefreshing) {
      alert("Please wait for the canvas to refresh before undoing again.");
      return;
    }
    try {
      await undoAction({
        currentUser,
        undoStack,
        setUndoStack,
        setRedoStack,
        userData,
        drawAllDrawings,
        refreshCanvasButtonHandler,
        checkUndoRedoAvailability
      });
    } catch (error) {
      console.error("Error during undo:", error);
    }
  };

  const redo = async () => {
    if (redoStack.length === 0) return;
    if (isRefreshing) {
      alert("Please wait for the canvas to refresh before redoing again.");
      return;
    }
    try {
      await redoAction({
        currentUser,
        redoStack,
        setRedoStack,
        setUndoStack,
        userData,
        drawAllDrawings,
        refreshCanvasButtonHandler,
        checkUndoRedoAvailability
      });
    } catch (error) {
      console.error("Error during redo:", error);
    }
  };

  // When selectedUser/selectedTime change (user clicked username), redraw immediately and disable drawing
useEffect(() => {
    if (selectedUser && selectedTime) {
      // entering history selection view
      setViewingSelection(true);
      drawAllDrawings(); // immediate visible redraw
    } else {
      // leaving selection view
      if (viewingSelection) {
        setViewingSelection(false);
        drawAllDrawings();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, selectedTime]);
  
  // helper to determine if drawing events should be ignored
  const isReadOnlyView = () => {
    // If a specific user/time is selected for viewing OR in general history recall browsing, disable drawing
    return viewingSelection || historyMode;
  };

  useEffect(() => {
    setIsRefreshing(true);
    clearCanvasForRefresh();

    mergedRefreshCanvas().then(() => {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser]);

  useEffect(() => {
    setUndoAvailable(undoStack.length > 0);
    setRedoAvailable(redoStack.length > 0);
    checkUndoRedoAvailability(currentUser, setUndoAvailable, setRedoAvailable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoStack, redoStack]);

  const [showToolbar, setShowToolbar] = useState(true);
  const [hoverToolbar, setHoverToolbar] = useState(false);

  return (
    <div className="Canvas-wrapper" style={{ pointerEvents: selectedUser !== "" ? "none" : "auto" }}>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        className="Canvas-element"
        style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }}
        onMouseDown={startDrawingHandler}
        onMouseMove={drawHandler}
        onMouseUp={stopDrawingHandler}
        onMouseLeave={stopDrawingHandler}
      />
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          left: showToolbar ? 0 : -100,
          width: 100,
          transition: 'left 0.3s ease',
          pointerEvents: 'all',
          zIndex: 1000,
        }}
        onMouseEnter={() => setHoverToolbar(true)}
        onMouseLeave={() => setHoverToolbar(false)}
      >
        <Box
          onClick={() => setShowToolbar(v => !v)}
          sx={{
            position: 'absolute',
            right: showToolbar ? 0 : -20,
            top: '50%',
            transform: 'translateY(-50%)',

            width: 20,
            height: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',

            opacity: hoverToolbar ? 1 : 0,
            transition: 'opacity 0.2s',
            bgcolor: 'rgba(0,0,0,0.2)',
            cursor: 'pointer',
            zIndex: 1001,
          }}
        >
          <IconButton size="small" sx={{ p: 0, color: 'white' }}>
            {showToolbar
              ? <ChevronLeftIcon fontSize="small"/>
              : <ChevronRightIcon fontSize="small"/>}
          </IconButton>
        </Box>
        <Toolbar
          drawMode={drawMode}
          setDrawMode={setDrawMode}
          shapeType={shapeType}
          setShapeType={setShapeType}
          color={color}
          setColor={setColor}
          showColorPicker={showColorPicker}
          toggleColorPicker={toggleColorPicker}
          closeColorPicker={closeColorPicker}
          lineWidth={lineWidth}
          setLineWidth={setLineWidth}
          previousColor={previousColor}
          setPreviousColor={setPreviousColor}
          historyMode={historyMode}
          toggleHistoryMode={handleToggleHistoryMode}
          recallStart={recallStart}
          recallEnd={recallEnd}
          setRecallStart={setRecallStart}
          setRecallEnd={setRecallEnd}
          applyRecallRange={handleApplyRecallRange}
          refreshCanvasButtonHandler={refreshCanvasButtonHandler}
          undo={undo}
          undoAvailable={undoAvailable}
          redo={redo}
          redoAvailable={redoAvailable}
          selectionRect={selectionRect}
          handleCutSelection={async () => {
            const result = await handleCutSelection();
            if (result && result.compositeCutAction) {
              setUndoStack(prev => [...prev, result.compositeCutAction]);
            }
            setIsRefreshing(true);
            try {
              await mergedRefreshCanvas();
            } catch (e) {
              console.error("Error syncing cut with server:", e);
            } finally {
              setIsRefreshing(false);
            }
          }}
          cutImageData={cutImageData}
          setClearDialogOpen={setClearDialogOpen}
        />
      </Box>

      {isRefreshing && (
        <div className="Canvas-loading-overlay">
          <div className="Canvas-spinner"></div>
        </div>
      )}

      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)}>
        <DialogTitle>Clear Canvas</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to clear the canvas for everyone?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)} color="primary">No</Button>
          <Button
            onClick={async () => {
              await clearCanvas();
              await clearBackendCanvas();
              setUserList([]);
              setClearDialogOpen(false);
            }}
            color="primary"
            autoFocus
          >
            Yes
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

export default Canvas;
