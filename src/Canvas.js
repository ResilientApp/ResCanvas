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

function Canvas({ currentUser, setUserList, selectedUser, setSelectedUser }) {
  const canvasRef = useRef(null);
  const snapshotRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(5);

  const [drawMode, setDrawMode] = useState("freehand");
  const [shapeType, setShapeType] = useState("circle");
  const [brushStyle, setBrushStyle] = useState("round");
  const [shapeStart, setShapeStart] = useState(null);
  const [shapeEnd, setShapeEnd] = useState(null);
  const [cutOriginalIds, setCutOriginalIds] = useState(new Set());
  const [cutStrokesMap, setCutStrokesMap] = useState({});
  
  const [pathData, setPathData] = useState([]);
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionRect, setSelectionRect] = useState(null);
  const [cutImageData, setCutImageData] = useState(null);

  const [eraseInsideSegments, setEraseInsideSegments] = useState(new Set());

  
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

  const generateId = () => `drawing_${Date.now()}_${Math.random().toString(36).substr(2,5)}`;
  let drawingOrderCounter = Date.now();

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

  // Computes intersection points (if any) of the segment [p1, p2] with the boundaries of rect.
function computeIntersections(p1, p2, rect) {
  const intersections = [];
  // Check vertical boundaries if the segment is not vertical
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
  // Check horizontal boundaries if the segment is not horizontal
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
  // Remove near-duplicate intersections
  const unique = [];
  intersections.forEach(inter => {
    if (!unique.some(u => Math.abs(u.t - inter.t) < 1e-6)) {
      unique.push(inter);
    }
  });
  return unique;
}

// Returns an array of segments (each an array of points) that lie OUTSIDE rect.
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
    
    // When crossing the boundary, compute the intersection.
    if (isInside(p1) !== isInside(p2)) {
      const inters = computeIntersections(p1, p2, rect);
      if (inters.length > 0) {
        const ip = inters[0].point;
        if (!isInside(p1)) {
          // p1 is outside; add intersection then finish segment.
          currentSegment.push(ip);
          segments.push(currentSegment);
          currentSegment = [];
        } else {
          // p1 is inside; start new segment from intersection.
          currentSegment = [];
          currentSegment.push(ip);
        }
      }
    } else if (!isInside(p1) && !isInside(p2)) {
      // Both endpoints are outside; simply add p2.
      if (currentSegment.length > 0) currentSegment.push(p2);
    }
  }
  if (currentSegment.length >= 2) segments.push(currentSegment);
  return segments;
}

// Returns an array of segments (each an array of points) that lie INSIDE rect.
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
  
    // Compute bounding box of the cut selection
    let minX = Infinity, minY = Infinity;
    cutImageData.forEach((drawing) => {
      if (Array.isArray(drawing.pathData)) {
        drawing.pathData.forEach((pt) => {
          minX = Math.min(minX, pt.x);
          minY = Math.min(minY, pt.y);
        });
      }
    });
  
    if (minX === Infinity) {
      alert("Invalid cut data.");
      return;
    }
  
    const offsetX = pasteX - minX;
    const offsetY = pasteY - minY;
  
    let pastedDrawings = [];
  
    // Create new drawings with unique IDs and apply offsets
    const newDrawings = cutImageData.map((originalDrawing) => {
      if (!Array.isArray(originalDrawing.pathData)) return null;
  
      const newPathData = originalDrawing.pathData.map((pt) => ({
        x: pt.x + offsetX,
        y: pt.y + offsetY,
      }));
  
      return new Drawing(
        generateId(),
        originalDrawing.color,
        originalDrawing.lineWidth,
        newPathData,
        Date.now(),
        currentUser
      );
    }).filter(Boolean);
  
    // Submit each drawing one by one to ensure backend saves them all
    setIsRefreshing(true);
    for (const newDrawing of newDrawings) {
      try {
        userData.addDrawing(newDrawing);
        await submitToDatabase(newDrawing);
        pastedDrawings.push(newDrawing);
        setUndoStack(prev => [...prev, newDrawing]);
        setRedoStack([]);
      } catch (error) {
        console.error("Failed to save drawing:", newDrawing, error);
      }
    }
    setIsRefreshing(false);

    setPathData([]);
    tempPathRef.current = [];

    if (pastedDrawings.length === newDrawings.length) {
      drawAllDrawings(); // Refresh canvas with all newly pasted strokes
      setCutImageData([]);
      setDrawMode("freehand");
    } else {
      alert("Some strokes may not have been saved. Please try again.");
    }
  };
  

  const startDrawing = (e) => {
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

  const stopDrawing = async (e) => {
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
        brushStyle: (shapeType === "line" ? brushStyle : undefined)
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
        await submitToDatabase(newDrawing);
        await refreshCanvas(userData.drawings.length);
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
        await refreshCanvas(userData.drawings.length);
      } catch (error) {
        console.error("Error during submission or refresh:", error);
      } finally {
        setIsRefreshing(false);
      }
      drawAllDrawings();
    }
  };

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
    let eraseInsideSegmentsNew = []; // for removing inside segments
    let newCutDrawings = []; // inside segments (for paste)
    let updatedDrawings = [];
    const newCutOriginalIds = new Set(cutOriginalIds);
    const newCutStrokesMap = { ...cutStrokesMap };
  
    userData.drawings.forEach((drawing) => {
      // Only process freehand strokes (with pathData as an array of points)
      if (!Array.isArray(drawing.pathData)) {
        updatedDrawings.push(drawing);
        return;
      }
      const points = drawing.pathData;
      // Check if any point is inside the cut rectangle.
      const intersects = points.some(pt =>
        pt.x >= cutRect.x && pt.x <= cutRect.x + cutRect.width &&
        pt.y >= cutRect.y && pt.y <= cutRect.y + cutRect.height
      );
      if (!intersects) {
        updatedDrawings.push(drawing);
        return;
      }
      // Mark this stroke as having been cut.
      newCutOriginalIds.add(drawing.drawingId);
  
      // Compute the segments that lie outside (to be preserved) and inside (to be removed).
      const outsideSegments = getOutsideSegments(points, cutRect);
      const insideSegments = getInsideSegments(points, cutRect);
  
      // Create replacement segments for the parts outside the cut area.
      const replacementSegments = [];
      outsideSegments.forEach(seg => {
        if (seg.length > 1) {
          const newSeg = new Drawing(generateId(), drawing.color, drawing.lineWidth, seg, Date.now(), drawing.user);
          replacementSegments.push(newSeg);
          updatedDrawings.push(newSeg);
        }
      });
      // Save these replacement segments in our map keyed by the original drawing’s ID.
      newCutStrokesMap[drawing.drawingId] = replacementSegments;
  
      // Create cut segments for paste functionality.
      insideSegments.forEach(seg => {
        if (seg.length > 1) {
          const cutSeg = new Drawing(generateId(), drawing.color, drawing.lineWidth, seg, Date.now(), drawing.user);
          newCutDrawings.push(cutSeg);
          const eraseSeg = new Drawing(generateId(), '#ffffff', drawing.lineWidth+4, seg, Date.now(), drawing.user);
          eraseInsideSegmentsNew.push(eraseSeg);
        }
      });
    });
  
    // Update state so that subsequent refreshes do not reload the original strokes.
    setCutImageData(newCutDrawings);
    setCutOriginalIds(newCutOriginalIds);
    setCutStrokesMap(newCutStrokesMap);
    setEraseInsideSegments(eraseInsideSegmentsNew)
  
    for (const eraseStroke of eraseInsideSegmentsNew) {
      try {
        await submitToDatabase(eraseStroke);
      } catch (error) {
        console.error("Failed to submit erase stroke:", eraseStroke, error);
      }
    }
  
    // Replace userData drawings with the updated (outside-only) segments.
    userData.drawings = updatedDrawings;
  
    // Save a cut record (for undo history and for backend synchronization).
    // This record now includes a "cut" flag and a list of original stroke IDs.
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
    setUndoStack(prev => [...prev, cutRecord]);
    userData.addDrawing(cutRecord);
    await submitToDatabase(cutRecord);
    drawAllDrawings();
  
    setSelectionRect(null);
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
  
      // Process backend data.
      const backendDrawings = result.data.map((item) => {
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
      }).filter(d => d);
  
      // Since the backend now filters out cut strokes, simply sort and display.
      backendDrawings.sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : a.timestamp;
        const orderB = b.order !== undefined ? b.order : b.timestamp;
        return orderA - orderB;
      });
  
      userData.drawings = backendDrawings;
      drawAllDrawings();
    } catch (error) {
      console.error("Error refreshing canvas:", error);
    }
  };     

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
      userData.drawings.forEach(d => { if(d.user) userSet.add(d.user); });
      setUserList(Array.from(userSet));
    }
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
        setRedoStack(prev => [...prev, lastAction]);
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
        setUndoStack(prev => [...prev, lastUndone]);
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
        <div className="Canvas-label-group">
          <label className="Canvas-label">Draw Mode:</label>
          <select value={drawMode} onChange={(e) => setDrawMode(e.target.value)}>
            <option value="freehand">Freehand</option>
            <option value="shape">Shape</option>
            <option value="select">Select</option>
            <option value="paste">Paste</option>
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
            <div className="Canvas-color-display" style={{ backgroundColor: color }} onClick={toggleColorPicker}></div>
            {showColorPicker && (
              <div className="Canvas-color-picker">
                <SketchPicker color={color} onChange={(newColor) => setColor(newColor.hex)} />
                <button className="Canvas-close-button" onClick={closeColorPicker}>Close</button>
              </div>
            )}
          </div>
        </div>
        <div className="Canvas-label-group">
          <label className="Canvas-label">Line Width:</label>
          <input type="range" min="1" max="20" value={lineWidth} onChange={(e) => setLineWidth(e.target.value)} className="Canvas-input-range" />
        </div>
        <button onClick={() => {
          if (!isEraserActive) {
            setPreviousColor(color);
            setColor('#FFFFFF');
            setIsEraserActive(true);
          } else {
            setColor(previousColor);
            setPreviousColor(null);
            setIsEraserActive(false);
          }
        }} className={`Canvas-button ${isEraserActive ? 'Canvas-button-active' : ''}`}>
          Eraser
        </button>
        <button onClick={refreshCanvasButtonHandler} className="Canvas-button">Refresh Canvas</button>
        <button onClick={() => setClearDialogOpen(true)} className="Canvas-button">Clear Canvas</button>
        <button onClick={undo} disabled={!undoAvailable} className="Canvas-button">Undo</button>
        <button onClick={redo} disabled={!redoAvailable} className="Canvas-button">Redo</button>
        {/* Buttons for cut and paste */}
        {drawMode === "select" && selectionRect && (
          <button onClick={handleCutSelection} className="Canvas-button">Cut Selection</button>
        )}
        {cutImageData && (
          <button onClick={() => setDrawMode("paste")} className="Canvas-button">Paste</button>
        )}
      </div>
      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)}>
        <DialogTitle>Clear Canvas</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to clear the canvas for everyone?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)} color="primary">No</Button>
          <Button onClick={() => {
            clearCanvas();
            clearBackendCanvas();
            setUserList([]);
            setClearDialogOpen(false);
          }} color="primary" autoFocus>Yes</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

export default Canvas;
