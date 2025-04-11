import React, { useRef, useState, useEffect } from 'react';
import { SketchPicker } from "react-color";
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Slider } from '@mui/material';
import ClipperLib from 'clipper-lib';
import Toolbar from './toolbar'; // Ensure this path is correct
import { 
  submitToDatabase, 
  refreshCanvas as backendRefreshCanvas, 
  clearBackendCanvas, 
  undoAction, 
  redoAction,
  checkUndoRedoAvailability 
} from './canvasBackend';
import "./canvas.css";

// --- Helper Classes ---
class Drawing {
  constructor(drawingId, color, lineWidth, pathData, timestamp, user) {
    this.drawingId = drawingId;
    this.color = color;
    this.lineWidth = lineWidth;
    this.pathData = pathData;
    this.timestamp = timestamp;
    this.user = user;
    this.brushStyle = "round";
    this.order = timestamp;
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

// --- Main Canvas Component ---
function Canvas({ currentUser, setUserList, selectedUser, setSelectedUser }) {
  // Refs
  const canvasRef = useRef(null);
  const snapshotRef = useRef(null);
  const tempPathRef = useRef([]);

  // Drawing settings state
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(5);
  const [drawMode, setDrawMode] = useState("freehand");
  const [shapeType, setShapeType] = useState("circle");
  const [brushStyle, setBrushStyle] = useState("round");

  // Freehand/shape drawing state
  const [shapeStart, setShapeStart] = useState(null);
  const [shapeEnd, setShapeEnd] = useState(null);
  const [pathData, setPathData] = useState([]);

  // Selection and cut/paste state
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionRect, setSelectionRect] = useState(null);
  const [cutImageData, setCutImageData] = useState(null);
  const [cutOriginalIds, setCutOriginalIds] = useState(new Set());
  const [cutStrokesMap, setCutStrokesMap] = useState({});
  const [eraseInsideSegments, setEraseInsideSegments] = useState(new Set());

  // Other UI state
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previousColor, setPreviousColor] = useState(null);
  const [isEraserActive, setIsEraserActive] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [redoAvailable, setRedoAvailable] = useState(false);

  // Initialize user data
  const initializeUserData = () => {
    const uniqueUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    return new UserData(uniqueUserId, "MainUser");
  };
  const [userData, setUserData] = useState(() => initializeUserData());

  // Unique drawing ID generator
  const generateId = () => `drawing_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  // -------------------------------
  // Helper functions for selection/cut functionality:

  // Compute intersections of a segment [p1, p2] with the boundaries of rect.
  function computeIntersections(p1, p2, rect) {
    const intersections = [];
    if (p2.x - p1.x !== 0) {
      const tLeft = (rect.x - p1.x) / (p2.x - p1.x);
      if (tLeft >= 0 && tLeft <= 1) {
        const yLeft = p1.y + tLeft * (p2.y - p1.y);
        if (yLeft >= rect.y && yLeft <= rect.y + rect.height) {
          intersections.push({ t: tLeft, point: { x: rect.x, y: yLeft } });
        }
      }
      const tRight = ((rect.x + rect.width) - p1.x) / (p2.x - p1.x);
      if (tRight >= 0 && tRight <= 1) {
        const yRight = p1.y + tRight * (p2.y - p1.y);
        if (yRight >= rect.y && yRight <= rect.y + rect.height) {
          intersections.push({ t: tRight, point: { x: rect.x + rect.width, y: yRight } });
        }
      }
    }
    if (p2.y - p1.y !== 0) {
      const tTop = (rect.y - p1.y) / (p2.y - p1.y);
      if (tTop >= 0 && tTop <= 1) {
        const xTop = p1.x + tTop * (p2.x - p1.x);
        if (xTop >= rect.x && xTop <= rect.x + rect.width) {
          intersections.push({ t: tTop, point: { x: xTop, y: rect.y } });
        }
      }
      const tBottom = ((rect.y + rect.height) - p1.y) / (p2.y - p1.y);
      if (tBottom >= 0 && tBottom <= 1) {
        const xBottom = p1.x + tBottom * (p2.x - p1.x);
        if (xBottom >= rect.x && xBottom <= rect.x + rect.width) {
          intersections.push({ t: tBottom, point: { x: xBottom, y: rect.y + rect.height } });
        }
      }
    }
    intersections.sort((a, b) => a.t - b.t);
    const unique = [];
    intersections.forEach(inter => {
      if (!unique.some(u => Math.abs(u.t - inter.t) < 1e-6)) {
        unique.push(inter);
      }
    });
    return unique;
  }

  // Returns an array of segments (each an array of points) lying outside rect.
  function getOutsideSegments(points, rect) {
    const isInside = pt =>
      pt.x >= rect.x && pt.x <= rect.x + rect.width &&
      pt.y >= rect.y && pt.y <= rect.y + rect.height;
    const segments = [];
    let currentSegment = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      if (!isInside(p1)) {
        if (currentSegment.length === 0) currentSegment.push(p1);
      }
      if (isInside(p1) !== isInside(p2)) {
        const inters = computeIntersections(p1, p2, rect);
        if (inters.length > 0) {
          const ip = inters[0].point;
          if (!isInside(p1)) {
            currentSegment.push(ip);
            segments.push(currentSegment);
            currentSegment = [];
          } else {
            currentSegment = [];
            currentSegment.push(ip);
          }
        }
      } else if (!isInside(p1) && !isInside(p2)) {
        if (currentSegment.length > 0) currentSegment.push(p2);
      }
    }
    if (currentSegment.length >= 2) segments.push(currentSegment);
    return segments;
  }

  // Returns segments inside the rect.
  function getInsideSegments(points, rect) {
    const isInside = pt =>
      pt.x >= rect.x && pt.x <= rect.x + rect.width &&
      pt.y >= rect.y && pt.y <= rect.y + rect.height;
    const segments = [];
    let currentSegment = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      if (isInside(p1)) {
        if (currentSegment.length === 0) currentSegment.push(p1);
      }
      if (isInside(p1) !== isInside(p2)) {
        const inters = computeIntersections(p1, p2, rect);
        if (inters.length > 0) {
          const ip = inters[0].point;
          if (isInside(p1)) {
            currentSegment.push(ip);
            segments.push(currentSegment);
            currentSegment = [];
          } else {
            currentSegment = [];
            currentSegment.push(ip);
          }
        }
      } else if (isInside(p1) && isInside(p2)) {
        if (currentSegment.length > 0) currentSegment.push(p2);
      }
    }
    if (currentSegment.length >= 2) segments.push(currentSegment);
    return segments;
  }

  // Ensure a polygon is closed by appending the first point if needed.
  function ensureClosedPolygon(points) {
    const pts = points.slice();
    if (pts.length > 0) {
      const first = pts[0];
      const last = pts[pts.length - 1];
      if (Math.abs(first.x - last.x) > 1e-6 || Math.abs(first.y - last.y) > 1e-6) {
        pts.push(first);
      }
    }
    return pts;
  }

  // Clip a polygon edge using the Sutherland–Hodgman algorithm.
  function clipPolygonEdge(polygon, rect, edge) {
    const outputList = [];
    const len = polygon.length;
    for (let i = 0; i < len; i++) {
      const current = polygon[i];
      const prev = polygon[(i - 1 + len) % len];
      const currentInside = isInsideEdge(current, rect, edge);
      const prevInside = isInsideEdge(prev, rect, edge);
      if (currentInside) {
        if (!prevInside) {
          const ip = computeIntersectionEdge(prev, current, rect, edge);
          if (ip) outputList.push(ip);
        }
        outputList.push(current);
      } else if (prevInside) {
        const ip = computeIntersectionEdge(prev, current, rect, edge);
        if (ip) outputList.push(ip);
      }
    }
    return outputList;
  }

  function isInsideEdge(pt, rect, edge) {
    switch (edge) {
      case 'left':   return pt.x >= rect.x;
      case 'right':  return pt.x <= rect.x + rect.width;
      case 'top':    return pt.y >= rect.y;
      case 'bottom': return pt.y <= rect.y + rect.height;
      default:       return false;
    }
  }

  function computeIntersectionEdge(p1, p2, rect, edge) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    let t = 0;
    switch (edge) {
      case 'left':   t = (rect.x - p1.x) / dx; break;
      case 'right':  t = ((rect.x + rect.width) - p1.x) / dx; break;
      case 'top':    t = (rect.y - p1.y) / dy; break;
      case 'bottom': t = ((rect.y + rect.height) - p1.y) / dy; break;
      default:       return null;
    }
    if (t < 0 || t > 1) return null;
    return { x: p1.x + t * dx, y: p1.y + t * dy };
  }

  function getInsidePolygon(polygon, rect) {
    let cp = ensureClosedPolygon(polygon);
    cp = clipPolygonEdge(cp, rect, 'left');
    cp = clipPolygonEdge(cp, rect, 'right');
    cp = clipPolygonEdge(cp, rect, 'top');
    cp = clipPolygonEdge(cp, rect, 'bottom');
    return cp;
  }

  function getOutsidePolygonsClosed(polygon, rect) {
    const closed = ensureClosedPolygon(polygon);
    return getOutsideSegments(closed, rect);
  }

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
      // Using brushStyle from outer scope (assumes it’s defined)
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
      setUndoStack(prev => [...prev, newDrawing]);
      setRedoStack([]);
      try {
        userData.addDrawing(newDrawing);
        await submitToDatabase(newDrawing, currentUser);
        pastedDrawings.push(newDrawing);
      } catch (error) {
        console.error("Failed to save drawing:", newDrawing, error);
      }
    }
    setIsRefreshing(false);

    setPathData([]);
    tempPathRef.current = [];

    if (pastedDrawings.length === newDrawings.length) {
      drawAllDrawings();
      setCutImageData([]);
      setDrawMode("freehand");
    } else {
      alert("Some strokes may not have been saved. Please try again.");
    }
  };

  // Mouse event handlers
  const startDrawingHandler = (e) => {
    if (isRefreshing) {
      alert("Please wait for the canvas to refresh before drawing again.");
      return;
    }
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
      setShapeStart({ x, y });
      setShapeEnd(null);
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

  const drawHandler = (e) => {
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
      setPathData(prev => [...prev, { x, y }]);
      tempPathRef.current.push({ x, y });
    } else if (drawMode === "shape" && drawing) {
      setShapeEnd({ x, y });
      if (snapshotRef.current && snapshotRef.current.complete) {
        context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        context.drawImage(snapshotRef.current, 0, 0);
      }
      drawShapePreview(shapeStart, { x, y }, shapeType, color, lineWidth);
    } else if (drawMode === "select" && drawing) {
      setSelectionRect({ start: selectionStart, end: { x, y } });
      if (snapshotRef.current && snapshotRef.current.complete) {
        context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        context.drawImage(snapshotRef.current, 0, 0);
      }
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
    if (!drawing) return;
    setDrawing(false);
    snapshotRef.current = null;
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
      newDrawing.brushStyle = brushStyle;
      setUndoStack(prev => [...prev, newDrawing]);
      setRedoStack([]);
      setIsRefreshing(true);
      try {
        userData.addDrawing(newDrawing);
        await submitToDatabase(newDrawing, currentUser);
        await backendRefreshCanvas(userData.drawings.length, userData, drawAllDrawings, currentUser);
      } catch (error) {
        console.error("Error during freehand submission or refresh:", error);
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
      setUndoStack(prev => [...prev, newDrawing]);
      setRedoStack([]);
      setIsRefreshing(true);
      try {
        userData.addDrawing(newDrawing);
        await submitToDatabase(newDrawing, currentUser);
        await backendRefreshCanvas(userData.drawings.length, userData, drawAllDrawings, currentUser);
      } catch (error) {
        console.error("Error during shape submission:", error);
      } finally {
        setIsRefreshing(false);
      }
      setShapeStart(null);
      setShapeEnd(null);
    } else if (drawMode === "select") {
      setDrawing(false);
      try {
        await backendRefreshCanvas(userData.drawings.length, userData, drawAllDrawings, currentUser);
      } catch (error) {
        console.error("Error during select submission or refresh:", error);
      } finally {
        setIsRefreshing(false);
      }
      drawAllDrawings();
    }
  };

  // --- Clear Canvas Function (local reset) ---
  const clearCanvas = async () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    setUserData(initializeUserData());
    setUndoStack([]);
    setRedoStack([]);
  };

  // --- Color Picker Handlers ---
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

  // --- Canvas clear and refresh functions ---
  const clearCanvasForRefresh = async () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    setUserData(initializeUserData());
  };

  const refreshCanvasButtonHandler = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await clearCanvasForRefresh();
      await backendRefreshCanvas(userData.drawings.length, userData, drawAllDrawings, currentUser);
    } catch (error) {
      console.error("Error during canvas refresh:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // --- Handle Cut Selection ---
  const handleCutSelection = async () => {
    if (!selectionRect) return;
  
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const { start, end } = selectionRect;
    const rectX = Math.min(start.x, end.x);
    const rectY = Math.min(start.y, end.y);
    const rectWidth = Math.abs(end.x - start.x);
    const rectHeight = Math.abs(end.y - start.y);
    if (!(rectWidth && rectHeight)) return;
  
    setCutImageData([]);
    await new Promise((resolve) => setTimeout(resolve, 10));
  
    drawAllDrawings();
  
    const cutRect = { x: rectX, y: rectY, width: rectWidth, height: rectHeight };
    let eraseInsideSegmentsNew = [];
    let newCutDrawings = [];
    let updatedDrawings = [];
    let affectedDrawings = [];
    const newCutOriginalIds = new Set(cutOriginalIds);
    const newCutStrokesMap = { ...cutStrokesMap };
  
    userData.drawings.forEach((drawing) => {
      if (Array.isArray(drawing.pathData)) {
        const points = drawing.pathData;
        const intersects = points.some(pt =>
          pt.x >= cutRect.x && pt.x <= cutRect.x + cutRect.width &&
          pt.y >= cutRect.y && pt.y <= cutRect.y + cutRect.height
        );
        if (!intersects) {
          updatedDrawings.push(drawing);
          return;
        }
        affectedDrawings.push(drawing);
        newCutOriginalIds.add(drawing.drawingId);
  
        const outsideSegments = getOutsideSegments(points, cutRect);
        const insideSegments = getInsideSegments(points, cutRect);
        const replacementSegments = [];
        outsideSegments.forEach(seg => {
          if (seg.length > 1) {
            const newSeg = new Drawing(generateId(), drawing.color, drawing.lineWidth, seg, Date.now(), drawing.user);
            replacementSegments.push(newSeg);
            updatedDrawings.push(newSeg);
          }
        });
        newCutStrokesMap[drawing.drawingId] = replacementSegments;
        insideSegments.forEach(seg => {
          if (seg.length > 1) {
            const cutSeg = new Drawing(generateId(), drawing.color, drawing.lineWidth, seg, Date.now(), drawing.user);
            newCutDrawings.push(cutSeg);
            const eraseSeg = new Drawing(generateId(), '#ffffff', drawing.lineWidth + 4, seg, Date.now(), drawing.user);
            eraseInsideSegmentsNew.push(eraseSeg);
          }
        });
      } else if (drawing.pathData && drawing.pathData.tool === "shape") {
        const shapeData = drawing.pathData;
        let shapePoints = [];
        if (shapeData.type === "circle") {
          const center = { x: shapeData.start.x, y: shapeData.start.y };
          const radius = Math.sqrt((shapeData.end.x - shapeData.start.x) ** 2 + (shapeData.end.y - shapeData.start.y) ** 2);
          const numPoints = 30;
          for (let i = 0; i < numPoints; i++) {
            const angle = (2 * Math.PI * i) / numPoints;
            shapePoints.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
          }
          shapePoints.push(shapePoints[0]);
        } else if (shapeData.type === "rectangle") {
          shapePoints = [
            { x: shapeData.start.x, y: shapeData.start.y },
            { x: shapeData.end.x, y: shapeData.start.y },
            { x: shapeData.end.x, y: shapeData.end.y },
            { x: shapeData.start.x, y: shapeData.end.y },
            { x: shapeData.start.x, y: shapeData.start.y }
          ];
        } else if (shapeData.type === "hexagon") {
          const center = { x: shapeData.start.x, y: shapeData.start.y };
          const radius = Math.sqrt((shapeData.end.x - shapeData.start.x) ** 2 + (shapeData.end.y - shapeData.start.y) ** 2);
          for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 3 * i;
            shapePoints.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
          }
          shapePoints.push(shapePoints[0]);
        } else if (shapeData.type === "line") {
          shapePoints = [shapeData.start, shapeData.end];
        }
        const intersects = shapePoints.some(pt =>
          pt.x >= cutRect.x && pt.x <= cutRect.x + cutRect.width &&
          pt.y >= cutRect.y && pt.y <= cutRect.y + cutRect.height
        );
        if (!intersects) {
          updatedDrawings.push(drawing);
          return;
        }
        affectedDrawings.push(drawing);
        newCutOriginalIds.add(drawing.drawingId);
        if (shapeData.type !== "line") {
          const subj = shapePoints.map(pt => ({ X: pt.x, Y: pt.y }));
          const clipPoly = [
            { X: cutRect.x, Y: cutRect.y },
            { X: cutRect.x + cutRect.width, Y: cutRect.y },
            { X: cutRect.x + cutRect.width, Y: cutRect.y + cutRect.height },
            { X: cutRect.x, Y: cutRect.y + cutRect.height }
          ];
          let clipper1 = new ClipperLib.Clipper();
          clipper1.AddPath(subj, ClipperLib.PolyType.ptSubject, true);
          clipper1.AddPath(clipPoly, ClipperLib.PolyType.ptClip, true);
          let insideSolution = new ClipperLib.Paths();
          clipper1.Execute(ClipperLib.ClipType.ctIntersection, insideSolution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
          let clipper2 = new ClipperLib.Clipper();
          clipper2.AddPath(subj, ClipperLib.PolyType.ptSubject, true);
          clipper2.AddPath(clipPoly, ClipperLib.PolyType.ptClip, true);
          let outsideSolution = new ClipperLib.Paths();
          clipper2.Execute(ClipperLib.ClipType.ctDifference, outsideSolution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
          outsideSolution.forEach(poly => {
            if (poly.length >= 3) {
              const newPoly = poly.map(pt => ({ x: pt.X, y: pt.Y }));
              const newSeg = new Drawing(generateId(), drawing.color, drawing.lineWidth, { tool: "shape", type: "polygon", points: newPoly }, Date.now(), drawing.user);
              updatedDrawings.push(newSeg);
              if (!newCutStrokesMap[drawing.drawingId]) newCutStrokesMap[drawing.drawingId] = [];
              newCutStrokesMap[drawing.drawingId].push(newSeg);
            }
          });
          if (insideSolution.length > 0) {
            let maxArea = 0;
            let bestPoly = null;
            insideSolution.forEach(poly => {
              if (poly.length >= 3) {
                let area = Math.abs(ClipperLib.Clipper.Area(poly));
                if (area > maxArea) {
                  maxArea = area;
                  bestPoly = poly;
                }
              }
            });
            if (bestPoly) {
              const insidePoly = bestPoly.map(pt => ({ x: pt.X, y: pt.Y }));
              const cutSeg = new Drawing(generateId(), drawing.color, drawing.lineWidth, { tool: "shape", type: "polygon", points: insidePoly }, Date.now(), drawing.user);
              newCutDrawings.push(cutSeg);
              const eraseSeg = new Drawing(generateId(), '#ffffff', drawing.lineWidth + 4, { tool: "shape", type: "polygon", points: insidePoly }, Date.now(), drawing.user);
              eraseInsideSegmentsNew.push(eraseSeg);
            }
          }
        } else {
          const outsideSegments = getOutsideSegments(shapePoints, cutRect);
          const insideSegments = getInsideSegments(shapePoints, cutRect);
          const replacementSegments = [];
          outsideSegments.forEach(seg => {
            if (seg.length > 1) {
              const newSeg = new Drawing(generateId(), drawing.color, drawing.lineWidth, { tool: "shape", type: "line", start: seg[0], end: seg[seg.length - 1] }, Date.now(), drawing.user);
              replacementSegments.push(newSeg);
              updatedDrawings.push(newSeg);
            }
          });
          newCutStrokesMap[drawing.drawingId] = replacementSegments;
          insideSegments.forEach(seg => {
            if (seg.length > 1) {
              const cutSeg = new Drawing(generateId(), drawing.color, drawing.lineWidth, { tool: "shape", type: "line", start: seg[0], end: seg[seg.length - 1] }, Date.now(), drawing.user);
              newCutDrawings.push(cutSeg);
              const eraseSeg = new Drawing(generateId(), '#ffffff', drawing.lineWidth, { tool: "shape", type: "line", start: seg[0], end: seg[seg.length - 1] }, Date.now(), drawing.user);
              eraseInsideSegmentsNew.push(eraseSeg);
            }
          });
        }
      } else {
        updatedDrawings.push(drawing);
      }
    });
  
    setCutImageData(newCutDrawings);
    setCutOriginalIds(newCutOriginalIds);
    setCutStrokesMap(newCutStrokesMap);
    setEraseInsideSegments(eraseInsideSegmentsNew);
  
    for (const eraseStroke of eraseInsideSegmentsNew) {
      try {
        await submitToDatabase(eraseStroke, currentUser);
      } catch (error) {
        console.error("Failed to submit erase stroke:", eraseStroke, error);
      }
    }
  
    userData.drawings = updatedDrawings;
  
    const cutRecord = new Drawing(
      generateId(),
      "#FFFFFF",
      1,
      {
        tool: "cut",
        rect: cutRect,
        cut: true,
        originalStrokeIds: Array.from(newCutOriginalIds)
      },
      Date.now(),
      currentUser
    );
  
    userData.addDrawing(cutRecord);
    await submitToDatabase(cutRecord, currentUser);
    drawAllDrawings();
  
    const backendCount = 1 + eraseInsideSegmentsNew.length;
    const compositeCutAction = {
      type: 'cut',
      cutRecord: cutRecord,
      eraseStrokes: eraseInsideSegmentsNew,
      affectedDrawings: affectedDrawings,
      replacementSegments: newCutStrokesMap,
      backendCount: backendCount
    };
    setUndoStack(prev => [...prev, compositeCutAction]);
  
    setSelectionRect(null);
  
    setIsRefreshing(true);
    try {
      await backendRefreshCanvas(userData.drawings.length, userData, drawAllDrawings, currentUser);
    } finally {
      setIsRefreshing(false);
    }
  };

  // --- Undo and Redo Handlers (wrapping backend functions) ---
  const undo = async () => {
    if (undoStack.length === 0) return;
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

  // --- useEffect Hooks ---
  useEffect(() => {
    setIsRefreshing(true);
    clearCanvasForRefresh();
    backendRefreshCanvas(0, userData, drawAllDrawings, currentUser).then(() => {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    });
  }, [selectedUser]);

  useEffect(() => {
    setUndoAvailable(undoStack.length > 0);
    setRedoAvailable(redoStack.length > 0);
    checkUndoRedoAvailability(currentUser, setUndoAvailable, setRedoAvailable);
  }, [undoStack, redoStack]);

  // --- Canvas Rendering: drawAllDrawings ---
  const drawAllDrawings = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const sortedDrawings = [...userData.drawings].sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : a.timestamp;
      const orderB = b.order !== undefined ? b.order : b.timestamp;
      return orderA - orderB;
    });
    sortedDrawings.forEach((drawing) => {
      context.globalAlpha = 1.0;
      if (selectedUser !== "" && drawing.user !== selectedUser) {
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
        if(d.user) userSet.add(d.user);
      });
      setUserList(Array.from(userSet));
    }
  };

  // --- Render ---
  return (
    <div className="Canvas-wrapper" style={{ pointerEvents: selectedUser !== "" ? "none" : "auto" }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="Canvas-element"
        onMouseDown={startDrawingHandler}
        onMouseMove={drawHandler}
        onMouseUp={stopDrawingHandler}
        onMouseLeave={stopDrawingHandler}
      />
      
      <Toolbar 
        drawMode={drawMode}
        setDrawMode={setDrawMode}
        shapeType={shapeType}
        setShapeType={setShapeType}
        brushStyle={brushStyle}
        setBrushStyle={setBrushStyle}
        color={color}
        setColor={setColor}
        showColorPicker={showColorPicker}
        toggleColorPicker={toggleColorPicker}
        closeColorPicker={closeColorPicker}
        lineWidth={lineWidth}
        setLineWidth={setLineWidth}
        isEraserActive={isEraserActive}
        previousColor={previousColor}
        setPreviousColor={setPreviousColor}
        setIsEraserActive={setIsEraserActive}
        refreshCanvasButtonHandler={refreshCanvasButtonHandler}
        undo={undo}
        undoAvailable={undoAvailable}
        redo={redo}
        redoAvailable={redoAvailable}
        selectionRect={selectionRect}
        handleCutSelection={handleCutSelection}
        cutImageData={cutImageData}
        setClearDialogOpen={setClearDialogOpen}
      />
      
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
