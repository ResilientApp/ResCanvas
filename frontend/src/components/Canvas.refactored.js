import React, { useRef, useState, useEffect } from 'react';
import "../styles/Canvas.css";

import { Box, IconButton } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import Toolbar from './Toolbar';
import UserData from '../lib/UserData';
import { useCanvasSelection } from '../hooks/useCanvasSelection';
import { useCanvasState, DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT } from '../hooks/useCanvasState';
import { useCanvasPan } from '../hooks/useCanvasPan';
import { useHistoryMode } from '../hooks/useHistoryMode';
import {
  RoomHeader,
  ArchivedBanner,
  EditingDisabledBanner,
  LoadingOverlay,
  RefreshingOverlay,
  CanvasSnackbar
} from './CanvasOverlays';
import {
  ClearCanvasDialog,
  HistoryRecallDialog,
  DestructiveDeleteDialog
} from './CanvasDialogs';

import {
  submitToDatabase,
  refreshCanvas as backendRefreshCanvas,
  clearBackendCanvas,
  undoAction,
  redoAction,
  checkUndoRedoAvailability
} from '../services/canvasBackendJWT';
import { Drawing } from '../lib/drawing';
import { getSocket, setSocketToken } from '../services/socket';
import { handleAuthError } from '../utils/authUtils';
import { getUsername } from '../utils/getUsername';
import { resetMyStacks, getAuthUser } from '../services/canvasBackendJWT';

function Canvas({
  auth,
  setUserList,
  selectedUser,
  setSelectedUser,
  currentRoomId,
  canvasRefreshTrigger = 0,
  currentRoomName = 'Master (not in a room)',
  onExitRoom = () => { },
  onOpenSettings = null,
  viewOnly = false,
  isOwner = false,
  roomType = 'public',
}) {
  const canvasRef = useRef(null);
  const snapshotRef = useRef(null);

  const currentUserRef = useRef(null);
  if (currentUserRef.current === null) {
    try {
      const uname = getUsername(auth) || `anon_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      currentUserRef.current = `${uname}|${Date.now()}`;
    } catch (e) {
      currentUserRef.current = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }
  }
  const currentUser = currentUserRef.current;

  const canvasWidth = DEFAULT_CANVAS_WIDTH;
  const canvasHeight = DEFAULT_CANVAS_HEIGHT;

  const refreshTimerRef = useRef(null);
  const [confirmDestructiveOpen, setConfirmDestructiveOpen] = useState(false);
  const [destructiveConfirmText, setDestructiveConfirmText] = useState('');
  const [showToolbar, setShowToolbar] = useState(true);
  const [hoverToolbar, setHoverToolbar] = useState(false);

  const state = useCanvasState(currentRoomId);
  const {
    drawing,
    setDrawing,
    color,
    setColor,
    lineWidth,
    setLineWidth,
    drawMode,
    setDrawMode,
    shapeType,
    setShapeType,
    brushStyle,
    shapeStart,
    setShapeStart,
    showColorPicker,
    setShowColorPicker,
    isRefreshing,
    setIsRefreshing,
    previousColor,
    setPreviousColor,
    clearDialogOpen,
    setClearDialogOpen,
    undoStack,
    setUndoStack,
    redoStack,
    setRedoStack,
    undoAvailable,
    setUndoAvailable,
    redoAvailable,
    setRedoAvailable,
    pendingDrawings,
    setPendingDrawings,
    isLoading,
    setIsLoading,
    localSnack,
    showLocalSnack,
    closeLocalSnack,
    roomClipboardRef,
    roomClearedAtRef,
    tempPathRef,
    serverCountRef
  } = state;

  const history = useHistoryMode();
  const {
    historyMode,
    setHistoryMode,
    historyRange,
    setHistoryRange,
    historyDialogOpen,
    setHistoryDialogOpen,
    historyStartInput,
    setHistoryStartInput,
    historyEndInput,
    setHistoryEndInput,
    openHistoryDialog,
    exitHistoryMode
  } = history;

  const initializeUserData = () => {
    const uniqueUserId = auth?.user?.id || `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const username = auth?.user?.username || "MainUser";
    return new UserData(uniqueUserId, username);
  };
  const [userData, setUserData] = useState(() => initializeUserData());
  const generateId = () => `drawing_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  const editingEnabled = !(historyMode || (selectedUser && selectedUser !== "") || viewOnly);

  const mergedRefreshCanvas = async (sourceLabel = undefined) => {
    try {
      if (sourceLabel) console.debug('[mergedRefreshCanvas] called from:', sourceLabel);
      else console.debug('[mergedRefreshCanvas] called');
    } catch (e) { }

    try {
      if (pan.isPanning) {
        console.debug('[mergedRefreshCanvas] deferring because isPanning=true');
        pan.pendingPanRefreshRef.current = true;
        return;
      }
    } catch (e) { }

    setIsLoading(true);
    const backendCount = await backendRefreshCanvas(
      serverCountRef.current,
      userData,
      drawAllDrawings,
      historyRange ? historyRange.start : undefined,
      historyRange ? historyRange.end : undefined,
      { roomId: currentRoomId, auth }
    );

    const pendingSnapshot = [...pendingDrawings];
    setPendingDrawings([]);
    serverCountRef.current = backendCount;

    try {
      const cutOriginalIds = new Set();
      (userData.drawings || []).forEach(d => {
        if (d.pathData && d.pathData.tool === 'cut' && Array.isArray(d.pathData.originalStrokeIds)) {
          d.pathData.originalStrokeIds.forEach(id => cutOriginalIds.add(id));
        }
      });

      if (cutOriginalIds.size > 0) {
        userData.drawings = (userData.drawings || []).filter(d => !cutOriginalIds.has(d.drawingId));
      }
    } catch (e) { }

    const drawingMatches = (a, b) => {
      if (!a || !b) return false;
      if (a.drawingId && b.drawingId && a.drawingId === b.drawingId) return true;
      try {
        const sameUser = a.user === b.user;
        const tsA = a.timestamp || a.ts || 0;
        const tsB = b.timestamp || b.ts || 0;
        const tsClose = Math.abs(tsA - tsB) < 3000;
        const lenA = Array.isArray(a.pathData) ? a.pathData.length : (a.pathData && a.pathData.points ? a.pathData.points.length : 0);
        const lenB = Array.isArray(b.pathData) ? b.pathData.length : (b.pathData && b.pathData.points ? b.pathData.points.length : 0);
        const lenClose = Math.abs(lenA - lenB) <= 2;
        return sameUser && tsClose && lenClose;
      } catch (e) {
        return false;
      }
    };

    const clearedAt = currentRoomId ? roomClearedAtRef.current[currentRoomId] : null;
    pendingSnapshot.forEach(pd => {
      try {
        const pdTs = pd.timestamp || pd.ts || 0;
        if (clearedAt && pdTs < clearedAt) return;
      } catch (e) { }
      const exists = userData.drawings.find(d => drawingMatches(d, pd));
      if (!exists) {
        userData.drawings.push(pd);
      }
    });

    drawAllDrawings();
    setIsLoading(false);
  };

  const pan = useCanvasPan(mergedRefreshCanvas);

  const drawAllDrawings = () => {
    setIsLoading(true);
    const canvas = canvasRef.current;
    if (!canvas) {
      setIsLoading(false);
      return;
    }
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvasWidth, canvasHeight);

    const combined = [...(userData.drawings || []), ...(pendingDrawings || [])];
    const cutOriginalIds = new Set();
    try {
      combined.forEach(d => {
        if (d && d.pathData && d.pathData.tool === 'cut' && Array.isArray(d.pathData.originalStrokeIds)) {
          d.pathData.originalStrokeIds.forEach(id => cutOriginalIds.add(id));
        }
      });
    } catch (e) { }

    const sortedDrawings = combined.sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : (a.timestamp || a.ts || 0);
      const orderB = b.order !== undefined ? b.order : (b.timestamp || b.ts || 0);
      return orderA - orderB;
    });

    const maskedOriginals = new Set();
    let seenAnyCut = false;
    for (const drawing of sortedDrawings) {
      if (drawing && drawing.pathData && drawing.pathData.tool === 'cut') {
        seenAnyCut = true;
        try {
          if (Array.isArray(drawing.pathData.originalStrokeIds)) {
            drawing.pathData.originalStrokeIds.forEach(id => maskedOriginals.add(id));
          }
        } catch (e) { }

        if (drawing.pathData && drawing.pathData.rect) {
          const r = drawing.pathData.rect;
          context.save();
          try {
            context.globalCompositeOperation = 'destination-out';
            context.fillStyle = 'rgba(0,0,0,1)';
            context.fillRect(Math.floor(r.x) - 2, Math.floor(r.y) - 2, Math.ceil(r.width) + 4, Math.ceil(r.height) + 4);
          } finally {
            context.restore();
          }
        }
        continue;
      }

      if (drawing && drawing.drawingId && (cutOriginalIds.has(drawing.drawingId) || maskedOriginals.has(drawing.drawingId))) {
        continue;
      }

      try {
        if (seenAnyCut && drawing && drawing.color && typeof drawing.color === 'string' && drawing.color.toLowerCase() === '#ffffff') {
          continue;
        }
      } catch (e) { }

      context.globalAlpha = 1.0;
      let viewingUser = null;
      let viewingPeriodStart = null;
      if (selectedUser) {
        if (typeof selectedUser === 'string') viewingUser = selectedUser;
        else if (typeof selectedUser === 'object') { viewingUser = selectedUser.user; viewingPeriodStart = selectedUser.periodStart; }
      }
      if (viewingUser && drawing.user !== viewingUser) {
        context.globalAlpha = 0.1;
      } else if (viewingPeriodStart !== null) {
        const ts = drawing.timestamp || drawing.order || 0;
        if (ts < viewingPeriodStart || ts >= (viewingPeriodStart + (5 * 60 * 1000))) {
          context.globalAlpha = 0.1;
        }
      }

      if (Array.isArray(drawing.pathData)) {
        context.beginPath();
        const pts = drawing.pathData;
        if (pts.length > 0) {
          context.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) context.lineTo(pts[i].x, pts[i].y);
          context.strokeStyle = drawing.color;
          context.lineWidth = drawing.lineWidth;
          context.lineCap = drawing.brushStyle || 'round';
          context.lineJoin = drawing.brushStyle || 'round';
          context.stroke();
        }
      } else if (drawing.pathData && drawing.pathData.tool === 'shape') {
        if (drawing.pathData.points) {
          const pts = drawing.pathData.points;
          context.save();
          context.beginPath();
          context.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) context.lineTo(pts[i].x, pts[i].y);
          context.closePath();
          context.fillStyle = drawing.color;
          context.fill();
          context.restore();
        } else {
          const { type, start, end, brushStyle: storedBrush } = drawing.pathData;
          context.save();
          context.fillStyle = drawing.color;
          context.lineWidth = drawing.lineWidth;
          if (type === 'circle') {
            const radius = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
            context.beginPath();
            context.arc(start.x, start.y, radius, 0, Math.PI * 2);
            context.fill();
          } else if (type === 'rectangle') {
            context.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
          } else if (type === 'hexagon') {
            const radius = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
            context.beginPath();
            for (let i = 0; i < 6; i++) {
              const angle = Math.PI / 3 * i;
              const xPoint = start.x + radius * Math.cos(angle);
              const yPoint = start.y + radius * Math.sin(angle);
              if (i === 0) context.moveTo(xPoint, yPoint); else context.lineTo(xPoint, yPoint);
            }
            context.closePath();
            context.fill();
          } else if (type === 'line') {
            context.beginPath();
            context.moveTo(start.x, start.y);
            context.lineTo(end.x, end.y);
            context.strokeStyle = drawing.color;
            context.lineWidth = drawing.lineWidth;
            const cap = storedBrush || drawing.brushStyle || 'round';
            context.lineCap = cap;
            context.lineJoin = cap;
            context.stroke();
          }
          context.restore();
        }
      } else if (drawing.pathData && drawing.pathData.tool === 'image') {
        const { image, x, y, width, height } = drawing.pathData;
        let img = new Image();
        img.src = image;
        img.onload = () => { context.drawImage(img, x, y, width, height); };
      }
    }

    if (!selectedUser) {
      const groupMap = {};
      const groupingSource = [...(userData.drawings || []), ...(pendingDrawings || [])];
      groupingSource.forEach(d => {
        try {
          const ts = d.timestamp || d.order || 0;
          const periodStart = Math.floor(ts / (5 * 60 * 1000)) * (5 * 60 * 1000);
          if (!groupMap[periodStart]) groupMap[periodStart] = new Set();
          if (d.user) groupMap[periodStart].add(d.user);
        } catch (e) { }
      });
      const groups = Object.keys(groupMap).map(k => ({ periodStart: parseInt(k), users: Array.from(groupMap[k]) }));
      groups.sort((a, b) => b.periodStart - a.periodStart);

      if (selectedUser && selectedUser !== '') {
        let stillExists = false;
        if (typeof selectedUser === 'string') {
          for (const g of groups) {
            if (g.users.includes(selectedUser)) { stillExists = true; break; }
          }
        } else if (typeof selectedUser === 'object' && selectedUser.user) {
          for (const g of groups) {
            if (g.periodStart === selectedUser.periodStart && g.users.includes(selectedUser.user)) { stillExists = true; break; }
          }
        }

        if (!stillExists) {
          try { setSelectedUser(''); } catch (e) { }
        }
      }

      setUserList(groups);
    }
    setIsLoading(false);
  };

  const { selectionStart, setSelectionStart, selectionRect, setSelectionRect, cutImageData, setCutImageData, handleCutSelection } =
    useCanvasSelection(canvasRef, currentUser, userData, generateId, drawAllDrawings, currentRoomId, setUndoAvailable, setRedoAvailable, auth);

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

  const handlePaste = async (e) => {
    if (!editingEnabled) {
      showLocalSnack("Editing is disabled in view-only mode.");
      setDrawMode("freehand");
      return;
    }
    if (!cutImageData || !Array.isArray(cutImageData) || cutImageData.length === 0) {
      showLocalSnack("No cut selection available to paste.");
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
      showLocalSnack("Invalid cut data.");
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
    setRedoStack([]);

    const pasteRecordId = generateId();

    for (const nd of newDrawings) {
      nd.roomId = currentRoomId;
      nd.parentPasteId = pasteRecordId;
      if (!nd.pathData) nd.pathData = {};
      nd.pathData.parentPasteId = pasteRecordId;
    }

    for (const newDrawing of newDrawings) {
      try {
        userData.addDrawing(newDrawing);
        await submitToDatabase(newDrawing, auth, { roomId: currentRoomId, roomType, skipUndoStack: true }, setUndoAvailable, setRedoAvailable);
        pastedDrawings.push(newDrawing);
      } catch (error) {
        console.error("Failed to save drawing:", newDrawing, error);
        handleAuthError(error);
      }
    }

    const pastedIds = pastedDrawings.map(d => d.drawingId);
    const pasteRecord = new Drawing(
      pasteRecordId,
      "#FFFFFF",
      1,
      { tool: "paste", cut: false, pastedDrawingIds: pastedIds },
      Date.now(),
      currentUser
    );
    try {
      await submitToDatabase(pasteRecord, auth, { roomId: currentRoomId, roomType }, setUndoAvailable, setRedoAvailable);
      setUndoStack(prev => [...prev, { type: 'paste', pastedDrawings: pastedDrawings, backendCount: 1 }]);
    } catch (error) {
      console.error("Failed to save paste record:", pasteRecord, error);
      showLocalSnack("Paste failed to persist. Some strokes may be missing.");
    }

    setIsRefreshing(false);

    if (currentRoomId) {
      checkUndoRedoAvailability(auth, setUndoAvailable, setRedoAvailable, currentRoomId);
    }

    tempPathRef.current = [];
    if (pastedDrawings.length === newDrawings.length) {
      drawAllDrawings();
      setCutImageData([]);
      setDrawMode("freehand");
    } else {
      showLocalSnack("Some strokes may not have been saved. Please try again.");
    }
  };

  const startDrawingHandler = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (pan.startPan(e, canvasWidth, canvasHeight)) {
      return;
    }

    if (!editingEnabled) return;

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

  const drawHandler = (e) => {
    if (pan.isPanning) {
      pan.handlePan(e, canvasWidth, canvasHeight);
      return;
    }
    if (!editingEnabled) return;
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
    if (pan.isPanning && e.button === 1) {
      pan.setIsPanning(false);
      return;
    }
    if (!drawing) return;
    setDrawing(false);

    if (!editingEnabled) {
      tempPathRef.current = [];
      return;
    }

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
      newDrawing.roomId = currentRoomId;
      setUndoStack(prev => [...prev, newDrawing]);
      setRedoStack([]);
      try {
        userData.addDrawing(newDrawing);
        const newPendingList = [...pendingDrawings, newDrawing];
        setPendingDrawings(newPendingList);

        await submitToDatabase(newDrawing, auth, { roomId: currentRoomId, roomType }, setUndoAvailable, setRedoAvailable);
        setPendingDrawings(prev => prev.filter(d => d.drawingId !== newDrawing.drawingId));
        mergedRefreshCanvas();

        if (currentRoomId) {
          checkUndoRedoAvailability(auth, setUndoAvailable, setRedoAvailable, currentRoomId);
        }
      } catch (error) {
        console.error("Error during freehand submission or refresh:", error);
        handleAuthError(error);
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
      newDrawing.roomId = currentRoomId;
      if (shapeType === "line") {
        newDrawing.brushStyle = brushStyle;
      }

      userData.addDrawing(newDrawing);
      setPendingDrawings(prev => [...prev, newDrawing]);

      setUndoStack(prev => [...prev, newDrawing]);
      setRedoStack([]);
      setIsRefreshing(true);

      try {
        await submitToDatabase(newDrawing, auth, { roomId: currentRoomId, roomType }, setUndoAvailable, setRedoAvailable);
        setPendingDrawings(prev => prev.filter(d => d.drawingId !== newDrawing.drawingId));
        mergedRefreshCanvas();

        if (currentRoomId) {
          checkUndoRedoAvailability(auth, setUndoAvailable, setRedoAvailable, currentRoomId);
        }
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
    if (!editingEnabled) {
      showLocalSnack("Cannot clear canvas in view-only mode.");
      return;
    }
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    context.clearRect(0, 0, canvasWidth, canvasHeight);

    setUserData(initializeUserData());
    setUndoStack([]);
    setRedoStack([]);
    setPendingDrawings([]);
    serverCountRef.current = 0;
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
    setPendingDrawings([]);
    serverCountRef.current = 0;

    setSelectionRect(null);
    setSelectionStart(null);

    if (drawMode === "select") {
      setDrawMode("freehand");
    }
  };

  const refreshCanvasButtonHandler = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setIsLoading(true);
    try {
      await clearCanvasForRefresh();
      await mergedRefreshCanvas();
    } catch (error) {
      console.error("Error during canvas refresh:", error);
      handleAuthError(error);
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  };

  const undo = async () => {
    if (!editingEnabled) {
      showLocalSnack("Undo is disabled in view-only mode.");
      return;
    }
    if (undoStack.length === 0) return;
    if (isRefreshing) {
      showLocalSnack("Please wait for the canvas to refresh before undoing again.");
      return;
    }
    try {
      await undoAction({
        auth,
        currentUser: auth?.username || 'anonymous',
        undoStack,
        setUndoStack,
        setRedoStack,
        userData,
        drawAllDrawings,
        refreshCanvasButtonHandler: refreshCanvasButtonHandler,
        roomId: currentRoomId
      });
      try {
        await checkUndoRedoAvailability(auth, setUndoAvailable, setRedoAvailable, currentRoomId);
      } catch (e) { }
    } catch (error) {
      console.error("Error during undo:", error);
    }
  };

  const redo = async () => {
    if (!editingEnabled) {
      showLocalSnack("Redo is disabled in view-only mode.");
      return;
    }
    if (redoStack.length === 0) return;
    if (isRefreshing) {
      showLocalSnack("Please wait for the canvas to refresh before redoing again.");
      return;
    }
    try {
      await redoAction({
        auth,
        currentUser: auth?.username || 'anonymous',
        redoStack,
        setRedoStack,
        setUndoStack,
        userData,
        drawAllDrawings,
        refreshCanvasButtonHandler: refreshCanvasButtonHandler,
        roomId: currentRoomId
      });
      try {
        await checkUndoRedoAvailability(auth, setUndoAvailable, setRedoAvailable, currentRoomId);
      } catch (e) { }
    } catch (error) {
      console.error("Error during redo:", error);
    }
  };

  useEffect(() => {
    if (!auth?.token || !currentRoomId) return;
    try { setSocketToken(auth.token); } catch (e) { }

    const socket = getSocket(auth.token);

    try { socket.emit('join_room', { roomId: currentRoomId, token: auth?.token }); } catch (e) { socket.emit('join_room', { roomId: currentRoomId }); }

    const scheduleRefresh = (delay = 300) => {
      try {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      } catch (e) { }
      refreshTimerRef.current = setTimeout(() => {
        mergedRefreshCanvas().catch(e => console.error('Error during scheduled refresh:', e));
        refreshTimerRef.current = null;
      }, delay);
    };

    const handleNewStroke = (data) => {
      try {
        const myName = getUsername(auth);
        if (data.user === myName) return;
      } catch (e) {
        try {
          const user = getAuthUser(auth) || {};
          if (data.user === user.username) return;
        } catch (e2) { }
      }

      const stroke = data.stroke;
      const drawing = new Drawing(
        stroke.drawingId || `remote_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        stroke.color || '#000000',
        stroke.lineWidth || 5,
        stroke.pathData || [],
        stroke.ts || stroke.timestamp || Date.now(),
        stroke.user || 'Unknown'
      );

      try {
        const clearedAt = roomClearedAtRef.current[currentRoomId];
        if (clearedAt && (drawing.timestamp || drawing.ts || Date.now()) < clearedAt) {
          return;
        }
      } catch (e) { }

      setPendingDrawings(prev => [...prev, drawing]);

      drawAllDrawings();

      scheduleRefresh(350);
    };

    const handleUserJoined = (data) => {
      try {
        if (!data) return;
        if (data.roomId !== currentRoomId) return;
        console.debug('socket user_joined event', data);
        if (data.username) {
          showLocalSnack(`${data.username} joined the canvas.`);
        }
      } catch (e) { }
    };

    const handleUserLeft = (data) => {
      try {
        if (!data) return;
        if (data.roomId !== currentRoomId) return;
        console.debug('socket user_left event', data);
        if (data.username) {
          showLocalSnack(`${data.username} left the canvas.`);
        }
      } catch (e) { }
    };

    const handleStrokeUndone = (data) => {
      console.log('Stroke undone event received:', data);
      mergedRefreshCanvas();

      if (currentRoomId) {
        checkUndoRedoAvailability(auth, setUndoAvailable, setRedoAvailable, currentRoomId);
      }
    };

    const handleCanvasCleared = (data) => {
      console.log('Canvas cleared event received:', data);
      const clearedAt = (data && data.clearedAt) ? data.clearedAt : Date.now();
      if (currentRoomId) roomClearedAtRef.current[currentRoomId] = clearedAt;

      try {
        userData.clearDrawings();
      } catch (e) { }
      setPendingDrawings([]);
      serverCountRef.current = 0;

      setUndoStack([]);
      setRedoStack([]);
      setUndoAvailable(false);
      setRedoAvailable(false);
      try {
        if (currentRoomId) {
          state.roomStacksRef.current[currentRoomId] = { undo: [], redo: [] };
          roomClipboardRef.current[currentRoomId] = null;
        }
      } catch (e) { }

      clearCanvasForRefresh();
      drawAllDrawings();

      if (currentRoomId) {
        checkUndoRedoAvailability(auth, setUndoAvailable, setRedoAvailable, currentRoomId);
      }
    };

    socket.on('new_stroke', handleNewStroke);
    socket.on('stroke_undone', handleStrokeUndone);
    socket.on('canvas_cleared', handleCanvasCleared);
    socket.on('user_joined', handleUserJoined);
    socket.on('user_left', handleUserLeft);
    socket.on('user_joined_debug', (d) => { console.debug('socket user_joined_debug', d); });

    return () => {
      socket.off('new_stroke', handleNewStroke);
      socket.off('stroke_undone', handleStrokeUndone);
      socket.off('canvas_cleared', handleCanvasCleared);
      socket.off('user_joined', handleUserJoined);
      socket.off('user_left', handleUserLeft);
      try { socket.emit('leave_room', { roomId: currentRoomId, token: auth?.token }); } catch (e) { socket.emit('leave_room', { roomId: currentRoomId }); }
      try { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); } catch (e) { }
    };
  }, [auth?.token, currentRoomId, auth?.user?.username]);

  useEffect(() => {
    (async () => {
      try {
        setUndoStack([]);
        setRedoStack([]);
        setUndoAvailable(false);
        setRedoAvailable(false);
        if (currentRoomId) {
          state.roomStacksRef.current[currentRoomId] = { undo: [], redo: [] };
        }

        if (auth?.token && currentRoomId) {
          try {
            await resetMyStacks(auth.token, currentRoomId);
          } catch (e) { }
        }

        if (currentRoomId) {
          try {
            await checkUndoRedoAvailability(auth, setUndoAvailable, setRedoAvailable, currentRoomId);
          } catch (e) { }
        }
      } catch (e) { }
    })();
  }, [auth?.token, currentRoomId]);

  useEffect(() => {
    try {
      setUndoStack([]);
      setRedoStack([]);
      if (currentRoomId) {
        state.roomStacksRef.current[currentRoomId] = { undo: [], redo: [] };
      }
      if (currentRoomId) {
        checkUndoRedoAvailability(auth, setUndoAvailable, setRedoAvailable, currentRoomId).catch(() => { });
      }
    } catch (e) { }
  }, [auth?.token, currentRoomId]);

  useEffect(() => {
    userData.drawings = [];
    setIsRefreshing(true);

    try {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx && canvasRef.current) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      drawAllDrawings();
    } catch { }

    (async () => {
      try {
        await mergedRefreshCanvas();
      } finally {
        setIsRefreshing(false);
      }
    })();
  }, [currentRoomId, canvasRefreshTrigger]);

  useEffect(() => {
    setIsRefreshing(true);
    clearCanvasForRefresh();

    mergedRefreshCanvas().then(() => {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    });
  }, [selectedUser]);

  return (
    <div className="Canvas-wrapper" style={{ pointerEvents: "auto" }}>
      <RoomHeader
        currentRoomName={currentRoomName}
        historyMode={historyMode}
        historyRange={historyRange}
        currentRoomId={currentRoomId}
        onExitRoom={() => {
          try {
            setHistoryMode(false);
            setHistoryRange(null);
            setHistoryStartInput('');
            setHistoryEndInput('');
            setSelectedUser('');
          } catch (e) { }
          onExitRoom();
        }}
      />

      <ArchivedBanner
        viewOnly={viewOnly}
        isOwner={isOwner}
        onDeleteClick={() => setConfirmDestructiveOpen(true)}
      />

      <DestructiveDeleteDialog
        open={confirmDestructiveOpen}
        onClose={() => { setConfirmDestructiveOpen(false); setDestructiveConfirmText(''); }}
        confirmText={destructiveConfirmText}
        setConfirmText={setDestructiveConfirmText}
        onConfirm={async () => {
          try {
            const { deleteRoom } = await import('../api/rooms');
            await deleteRoom(auth.token, currentRoomId);
            showLocalSnack('Room permanently deleted');
            try { onExitRoom(); } catch (e) { }
          } catch (e) {
            console.error('Permanent delete failed', e);
            showLocalSnack('Failed to delete room: ' + (e?.message || e));
          } finally {
            setConfirmDestructiveOpen(false);
            setDestructiveConfirmText('');
          }
        }}
      />

      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        className="Canvas-element"
        style={{ transform: `translate(${pan.panOffset.x}px, ${pan.panOffset.y}px)` }}
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
              ? <ChevronLeftIcon fontSize="small" />
              : <ChevronRightIcon fontSize="small" />}
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
          refreshCanvasButtonHandler={refreshCanvasButtonHandler}
          undo={undo}
          undoAvailable={undoAvailable}
          redo={redo}
          redoAvailable={redoAvailable}
          selectionRect={selectionRect}
          handleCutSelection={async () => {
            if (!editingEnabled) {
              showLocalSnack("Cut is disabled in view-only mode.");
              return;
            }
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
          openHistoryDialog={openHistoryDialog}
          exitHistoryMode={() => exitHistoryMode(clearCanvasForRefresh, backendRefreshCanvas, userData, drawAllDrawings, serverCountRef, currentRoomId, auth)}
          historyMode={historyMode}
          controlsDisabled={!editingEnabled}
          onOpenSettings={onOpenSettings}
        />
      </Box>

      <RefreshingOverlay isRefreshing={isRefreshing} />

      <HistoryRecallDialog
        open={historyDialogOpen}
        onClose={() => setHistoryDialogOpen(false)}
        historyStartInput={historyStartInput}
        setHistoryStartInput={setHistoryStartInput}
        historyEndInput={historyEndInput}
        setHistoryEndInput={setHistoryEndInput}
        onApply={async () => {
          const start = historyStartInput ? (new Date(historyStartInput)).getTime() : NaN;
          const end = historyEndInput ? (new Date(historyEndInput)).getTime() : NaN;
          await history.applyHistoryRange(start, end, showLocalSnack, clearCanvasForRefresh, backendRefreshCanvas, userData, drawAllDrawings, serverCountRef, currentRoomId, auth);
        }}
      />

      <EditingDisabledBanner historyMode={historyMode} selectedUser={selectedUser} />

      <LoadingOverlay isLoading={isLoading} />

      <ClearCanvasDialog
        open={clearDialogOpen}
        onClose={() => setClearDialogOpen(false)}
        onConfirm={async () => {
          await clearCanvas();
          try {
            const resp = await clearBackendCanvas({ roomId: currentRoomId, auth });
            if (resp && resp.clearedAt && currentRoomId) {
              roomClearedAtRef.current[currentRoomId] = resp.clearedAt;
            }
          } catch (e) {
            console.error('Failed to clear backend:', e);
          }
          try {
            await checkUndoRedoAvailability(auth, setUndoAvailable, setRedoAvailable, currentRoomId);
          } catch (e) { }
          setUserList([]);
          try { setSelectedUser(''); } catch (e) { }
          setClearDialogOpen(false);
        }}
      />

      <CanvasSnackbar localSnack={localSnack} onClose={closeLocalSnack} />
    </div>
  );
}

export default Canvas;
