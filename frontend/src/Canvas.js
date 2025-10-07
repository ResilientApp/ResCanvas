// Props: initialStrokes (array), onPostStroke(stroke), viewOnly (bool), currentUser (string)
import React, { useRef, useState, useEffect } from 'react';
import "./Canvas.css";

import {
  Box,
  Fade,
  Paper,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
  CircularProgress,
} from '@mui/material';
import SafeSnackbar from './components/SafeSnackbar';

import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Toolbar from './components/Toolbar';
import { useCanvasSelection } from './useCanvasSelection';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  submitToDatabase,
  refreshCanvas as backendRefreshCanvas,
  clearBackendCanvas,
  undoAction,
  redoAction,
  checkUndoRedoAvailability
} from './canvasBackendJWT';
import { Drawing } from './drawing';
import { getSocket, setSocketToken } from './socket';
import { handleAuthError } from './utils/authUtils';
import { getUsername } from './utils/getUsername';
import { getAuthUser } from './utils/getAuthUser';
import { resetMyStacks } from './api/rooms';

class UserData {
  constructor(userId, username) {
    this.userId = userId;
    this.username = username;
    this.drawings = [];
  }

  addDrawing(drawing) {
    this.drawings.push(drawing);
  }

  // Clear all drawings from this UserData instance
  clearDrawings() {
    this.drawings = [];
  }
}

const DEFAULT_CANVAS_WIDTH = 3000;
const DEFAULT_CANVAS_HEIGHT = 2000;

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
}) {
  const canvasRef = useRef(null);
  const snapshotRef = useRef(null);
  const tempPathRef = useRef([]);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  // Derive a stable currentUser identifier from auth prop (kept stable for the session)
  // Use central getUsername helper to keep fallback rules consistent across the app.
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

  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(5);
  const [drawMode, setDrawMode] = useState("freehand");
  const [shapeType, setShapeType] = useState("circle");
  const [brushStyle] = useState("round");
  const [shapeStart, setShapeStart] = useState(null);

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previousColor, setPreviousColor] = useState(null);
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
  // Throttle/debounce pan-triggered refreshes to avoid frequent backend calls
  const PAN_REFRESH_COOLDOWN_MS = 2000; // ms
  const panLastRefreshRef = useRef(0);
  const panRefreshSkippedRef = useRef(false);
  const panEndRefreshTimerRef = useRef(null);
  const pendingPanRefreshRef = useRef(false);
  const [pendingDrawings, setPendingDrawings] = useState([]);
  const refreshTimerRef = useRef(null);
  const [historyMode, setHistoryMode] = useState(false);
  const [historyRange, setHistoryRange] = useState(null); // {start, end} in epoch ms
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyStartInput, setHistoryStartInput] = useState('');
  const [historyEndInput, setHistoryEndInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Local themed snackbar for Canvas-specific messages (replaces alert())
  const [localSnack, setLocalSnack] = useState({ open: false, message: '', duration: 4000 });
  const [confirmDestructiveOpen, setConfirmDestructiveOpen] = useState(false);
  const [destructiveConfirmText, setDestructiveConfirmText] = useState('');
  const showLocalSnack = (msg, duration = 4000) => setLocalSnack({ open: true, message: String(msg), duration });
  const closeLocalSnack = () => setLocalSnack({ open: false, message: '', duration: 4000 });

  // Per-room UI and stack isolation
  const roomUiRef = useRef({});      // roomId -> { color, lineWidth, drawMode, shapeType }
  const roomStacksRef = useRef({});  // roomId -> { undo:[], redo:[] }
  const roomClipboardRef = useRef({}); // roomId -> cutImageData[]
  // Track authoritative clear timestamps per room (epoch ms) provided by server
  const roomClearedAtRef = useRef({}); // roomId -> clearedAt (ms)

  // Load per-room toolbar + stacks + clipboard on room switch
  useEffect(() => {
    if (!currentRoomId) return;
    // Toolbar
    const ui = roomUiRef.current[currentRoomId] || JSON.parse(localStorage.getItem(`rescanvas:toolbar:${currentRoomId}`) || "null") || {};
    if (ui.color) setColor(ui.color);
    if (ui.lineWidth) setLineWidth(ui.lineWidth);
    if (ui.drawMode) setDrawMode(ui.drawMode);
    if (ui.shapeType) setShapeType(ui.shapeType);
    roomUiRef.current[currentRoomId] = { color: ui.color ?? color, lineWidth: ui.lineWidth ?? lineWidth, drawMode: ui.drawMode ?? drawMode, shapeType: ui.shapeType ?? shapeType };
    // Stacks
    const stacks = roomStacksRef.current[currentRoomId] || { undo: [], redo: [] };
    setUndoStack(stacks.undo);
    setRedoStack(stacks.redo);
    // Clipboard (cut/paste)
    const clip = roomClipboardRef.current[currentRoomId] || null;
    if (setCutImageData) setCutImageData(clip);
  }, [currentRoomId]);

  // Persist toolbar per room whenever it changes
  useEffect(() => {
    if (!currentRoomId) return;
    const ui = { color, lineWidth, drawMode, shapeType };
    roomUiRef.current[currentRoomId] = ui;
    try { localStorage.setItem(`rescanvas:toolbar:${currentRoomId}`, JSON.stringify(ui)); } catch { }
  }, [currentRoomId, color, lineWidth, drawMode, shapeType]);

  // Persist stacks per room
  useEffect(() => {
    if (!currentRoomId) return;
    const cur = roomStacksRef.current[currentRoomId] || { undo: [], redo: [] };
    cur.undo = undoStack;
    roomStacksRef.current[currentRoomId] = cur;
  }, [currentRoomId, undoStack]);
  useEffect(() => {
    if (!currentRoomId) return;
    const cur = roomStacksRef.current[currentRoomId] || { undo: [], redo: [] };
    cur.redo = redoStack;
    roomStacksRef.current[currentRoomId] = cur;
  }, [currentRoomId, redoStack]);

  useEffect(() => {
    const handleMouseUp = () => {
      setIsPanning(false);
      panOriginRef.current = { ...panOffset };
      // If we skipped a refresh at pan-start due to cooldown, perform a deferred merge refresh now
      try {
        if (panEndRefreshTimerRef.current) {
          clearTimeout(panEndRefreshTimerRef.current);
          panEndRefreshTimerRef.current = null;
        }
        if (panRefreshSkippedRef.current) {
          panRefreshSkippedRef.current = false;
          // run mergedRefreshCanvas to reconcile pending drawings
          mergedRefreshCanvas('pan-mouseup-skipped').finally(() => {
            try { setIsLoading(false); } catch (e) { }
          });
        }
        // If any caller deferred a merged refresh because panning was active, run it now
        if (pendingPanRefreshRef.current) {
          pendingPanRefreshRef.current = false;
          mergedRefreshCanvas('pan-mouseup-pending').finally(() => {
            try { setIsLoading(false); } catch (e) { }
          });
        }
      } catch (e) { }
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [panOffset]);

  // Socket.IO integration for real-time collaboration
  useEffect(() => {
    if (!auth?.token || !currentRoomId) return;
    // Ensure socket has the latest token (in case token was refreshed)
    try { setSocketToken(auth.token); } catch (e) { }

    const socket = getSocket(auth.token);

    // Join the room (include token for servers that read it from payload/query)
    try { socket.emit('join_room', { roomId: currentRoomId, token: auth?.token }); } catch (e) { socket.emit('join_room', { roomId: currentRoomId }); }

    // Listen for new strokes from other users
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
        if (data.user === myName) return; // Ignore our own strokes
      } catch (e) {
        // if helper fails for any reason, try resolving a full user object
        try {
          const user = getAuthUser(auth) || {};
          if (data.user === user.username) return;
        } catch (e2) { /* give up and continue */ }
      }

      // Create a proper Drawing object from the incoming stroke
      const stroke = data.stroke;
      const drawing = new Drawing(
        stroke.drawingId || `remote_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        stroke.color || '#000000',
        stroke.lineWidth || 5,
        stroke.pathData || [],
        stroke.ts || stroke.timestamp || Date.now(),
        stroke.user || 'Unknown'
      );

      // Do NOT mutate userData directly here. Keep incoming strokes in pendingDrawings
      // so we can render them immediately but rely on mergedRefreshCanvas for authoritative
      // ordering and deduplication (similar to pressing the Refresh button).
      // If we have a recent authoritative clearedAt for this room, ignore any incoming
      // stroke that is older than that clearedAt to avoid re-appending pre-clear strokes.
      try {
        const clearedAt = roomClearedAtRef.current[currentRoomId];
        if (clearedAt && (drawing.timestamp || drawing.ts || Date.now()) < clearedAt) {
          // ignore pre-clear stroke
          return;
        }
      } catch (e) { }

      setPendingDrawings(prev => [...prev, drawing]);

      // Redraw immediately so the local user sees the stroke
      drawAllDrawings();

      // Schedule a debounced authoritative refresh so clients converge to server state
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
      // Force a full refresh from backend to ensure consistency
      mergedRefreshCanvas();

      // Update undo/redo status
      if (currentRoomId) {
        checkUndoRedoAvailability(auth, setUndoAvailable, setRedoAvailable, currentRoomId);
      }
    };

    const handleCanvasCleared = (data) => {
      console.log('Canvas cleared event received:', data);
      // Use server-provided clearedAt if available; fall back to now
      const clearedAt = (data && data.clearedAt) ? data.clearedAt : Date.now();
      if (currentRoomId) roomClearedAtRef.current[currentRoomId] = clearedAt;

      // Clear local authoritative drawings and pending drawings that predate the clear
      try {
        userData.clearDrawings();
      } catch (e) { }
      setPendingDrawings([]);
      serverCountRef.current = 0;

      // Reset undo/redo stacks locally
      setUndoStack([]);
      setRedoStack([]);
      setUndoAvailable(false);
      setRedoAvailable(false);
      try {
        if (currentRoomId) {
          roomStacksRef.current[currentRoomId] = { undo: [], redo: [] };
          roomClipboardRef.current[currentRoomId] = null;
        }
      } catch (e) { }

      // Clear the canvas and redraw
      clearCanvasForRefresh();
      drawAllDrawings();

      // Refresh server-reported undo/redo availability; this should now report zeros
      if (currentRoomId) {
        checkUndoRedoAvailability(auth, setUndoAvailable, setRedoAvailable, currentRoomId);
      }
    };

    socket.on('new_stroke', handleNewStroke);
    socket.on('stroke_undone', handleStrokeUndone);
    socket.on('canvas_cleared', handleCanvasCleared);
    socket.on('user_joined', handleUserJoined);
    socket.on('user_left', handleUserLeft);
    // Debug: server-side handlers sometimes emit a debug payload to help
    // confirm that the server processed the join. Log it to the console.
    socket.on('user_joined_debug', (d) => { console.debug('socket user_joined_debug', d); });

    // Cleanup
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

  // Ensure local undo/redo stacks are reset on auth/room change (e.g. full page refresh or room switch)
  useEffect(() => {
    (async () => {
      try {
        // Reset local stacks immediately
        setUndoStack([]);
        setRedoStack([]);
        setUndoAvailable(false);
        setRedoAvailable(false);
        if (currentRoomId) {
          roomStacksRef.current[currentRoomId] = { undo: [], redo: [] };
        }

        // Also reset server-side stacks for this authenticated user to avoid stale undo counts
        if (auth?.token && currentRoomId) {
          try {
            await resetMyStacks(auth.token, currentRoomId);
          } catch (e) {
            // ignore reset failure
          }
        }

        // After server reset, fetch authoritative undo/redo availability
        if (currentRoomId) {
          try {
            await checkUndoRedoAvailability(auth, setUndoAvailable, setRedoAvailable, currentRoomId);
          } catch (e) {
            // ignore
          }
        }
      } catch (e) {
        // ignore
      }
    })();
  }, [auth?.token, currentRoomId]);

  // When auth or room changes (including full page refresh), reset local undo/redo
  // stacks to avoid showing stale local data carried across sessions.
  useEffect(() => {
    try {
      setUndoStack([]);
      setRedoStack([]);
      if (currentRoomId) {
        roomStacksRef.current[currentRoomId] = { undo: [], redo: [] };
      }
      // Also ensure the server-reported availability is refreshed
      if (currentRoomId) {
        checkUndoRedoAvailability(auth, setUndoAvailable, setRedoAvailable, currentRoomId).catch(() => { });
      }
    } catch (e) {
      // ignore
    }
    // run when token or room changes
  }, [auth?.token, currentRoomId]);

  const initializeUserData = () => {
    const uniqueUserId = auth?.user?.id || `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const username = auth?.user?.username || "MainUser";
    return new UserData(uniqueUserId, username);
  };
  const [userData, setUserData] = useState(() => initializeUserData());
  const generateId = () => `drawing_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  // Track how many strokes the server has told us about
  const serverCountRef = useRef(0);

  const drawAllDrawings = () => {
    setIsLoading(true);
    const canvas = canvasRef.current;
    if (!canvas) {
      // Canvas element not mounted yet; nothing to draw
      setIsLoading(false);
      return;
    }
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvasWidth, canvasHeight);

    // Include any locally-pending drawings (e.g. received via socket but
    // not yet reflected by a backend refresh) so they render immediately.
    const combined = [...(userData.drawings || []), ...(pendingDrawings || [])];
    // If there are cut records present in the combined set, compute the original
    // stroke ids they refer to and ensure we do not draw those originals. This
    // makes the UI robust even if server-side Redis cut-sets were lost.
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

    // Render drawings in chronological order. When a 'cut' record appears
    // we immediately apply a destination-out erase so it removes prior content
    // but does not erase strokes that are drawn after the cut.
    const maskedOriginals = new Set();
    let seenAnyCut = false;
    for (const drawing of sortedDrawings) {
      // If this is a cut record, apply the erase to the canvas now.
      if (drawing && drawing.pathData && drawing.pathData.tool === 'cut') {
        seenAnyCut = true;
        // Collect referenced originals so we can skip rendering them if they
        // appear later in the timeline (defensive).
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
            // Expand rect slightly to avoid hairline due to subpixel antialiasing
            context.fillRect(Math.floor(r.x) - 2, Math.floor(r.y) - 2, Math.ceil(r.width) + 4, Math.ceil(r.height) + 4);
          } finally {
            context.restore();
          }
        }

        // continue to next timeline item
        continue;
      }

      // Skip originals that have been masked by a cut
      if (drawing && drawing.drawingId && (cutOriginalIds.has(drawing.drawingId) || maskedOriginals.has(drawing.drawingId))) {
        continue;
      }

      // Skip temporary white "erase" helper strokes when we've seen a cut
      // record; destination-out masking is authoritative and drawing white
      // strokes can produce hairlines.
      try {
        if (seenAnyCut && drawing && drawing.color && typeof drawing.color === 'string' && drawing.color.toLowerCase() === '#ffffff') {
          continue;
        }
      } catch (e) { }

      // Draw the drawing normally
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
      // Group users by 5-minute intervals (periodStart in epoch ms).
      // Use both committed drawings and pending drawings so the UI's
      // user/time-group list reflects the strokes the user currently sees.
      const groupMap = {};
      const groupingSource = [...(userData.drawings || []), ...(pendingDrawings || [])];
      groupingSource.forEach(d => {
        try {
          const ts = d.timestamp || d.order || 0;
          const periodStart = Math.floor(ts / (5 * 60 * 1000)) * (5 * 60 * 1000);
          if (!groupMap[periodStart]) groupMap[periodStart] = new Set();
          if (d.user) groupMap[periodStart].add(d.user);
        } catch (e) {
          // ignore malformed entries
        }
      });
      const groups = Object.keys(groupMap).map(k => ({ periodStart: parseInt(k), users: Array.from(groupMap[k]) }));
      // Sort groups descending (most recent first)
      groups.sort((a, b) => b.periodStart - a.periodStart);
      // Validate the currently-selected user (if any) still exists in the new groups.
      // If it does not, clear the selection to avoid unexpected greying/filtering.
      if (selectedUser && selectedUser !== '') {
        let stillExists = false;
        if (typeof selectedUser === 'string') {
          // simple username string selection
          for (const g of groups) {
            if (g.users.includes(selectedUser)) { stillExists = true; break; }
          }
        } else if (typeof selectedUser === 'object' && selectedUser.user) {
          for (const g of groups) {
            if (g.periodStart === selectedUser.periodStart && g.users.includes(selectedUser.user)) { stillExists = true; break; }
          }
        }

        if (!stillExists) {
          try { setSelectedUser(''); } catch (e) { /* swallow if setter changed */ }
        }
      }

      setUserList(groups);
    }
    setIsLoading(false);
  };

  const {
    selectionStart, setSelectionStart,
    selectionRect, setSelectionRect,
    cutImageData, setCutImageData,
    handleCutSelection,
  } = useCanvasSelection(canvasRef, currentUser, userData, generateId, drawAllDrawings, currentRoomId, setUndoAvailable, setRedoAvailable, auth);

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
    // Clear redo stack once for the whole paste operation
    setRedoStack([]);

    // Create a pasteRecordId up front so each pasted segment can reference its parent.
    const pasteRecordId = generateId();

    // Attach parentPasteId to each new drawing so the backend/read path can filter them
    for (const nd of newDrawings) {
      nd.roomId = currentRoomId;
      nd.parentPasteId = pasteRecordId;
      // also embed in pathData for legacy consumers
      if (!nd.pathData) nd.pathData = {};
      nd.pathData.parentPasteId = pasteRecordId;
    }

    // Submit all pasted drawings as replacement/child strokes but DO NOT add each to the undo stack
    for (const newDrawing of newDrawings) {
      try {
        userData.addDrawing(newDrawing);
        // skipUndoStack=true so these individual strokes don't create separate undo entries
        await submitToDatabase(newDrawing, auth, { roomId: currentRoomId, skipUndoStack: true }, setUndoAvailable, setRedoAvailable);
        pastedDrawings.push(newDrawing);
      } catch (error) {
        console.error("Failed to save drawing:", newDrawing, error);
        handleAuthError(error);
      }
    }

    // Create a single paste-record that represents the grouped paste operation.
    // This single backend write will be the one undoable action.
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
      // Submit the single paste-record (counts as one backend undo operation)
      await submitToDatabase(pasteRecord, auth, { roomId: currentRoomId }, setUndoAvailable, setRedoAvailable);
      // Record the paste action in the local undo stack with backendCount=1
      setUndoStack(prev => [...prev, { type: 'paste', pastedDrawings: pastedDrawings, backendCount: 1 }]);
    } catch (error) {
      console.error("Failed to save paste record:", pasteRecord, error);
      // If paste-record fails, surface to user
      showLocalSnack("Paste failed to persist. Some strokes may be missing.");
    }

    setIsRefreshing(false);

    // Update undo/redo availability after paste operations
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

  const mergedRefreshCanvas = async (sourceLabel = undefined) => {
    // Debug: log caller/source to help diagnose frequent refreshes
    try {
      if (sourceLabel) console.debug('[mergedRefreshCanvas] called from:', sourceLabel);
      else console.debug('[mergedRefreshCanvas] called');
    } catch (e) { }
    // If currently panning, defer refresh until pan ends to avoid races and frequent backend calls.
    try {
      if (isPanning) {
        console.debug('[mergedRefreshCanvas] deferring because isPanning=true, marking pendingPanRefreshRef');
        pendingPanRefreshRef.current = true;
        return;
      }
    } catch (e) { }
    setIsLoading(true);
    const backendCount = await backendRefreshCanvas(serverCountRef.current, userData, drawAllDrawings, historyRange ? historyRange.start : undefined, historyRange ? historyRange.end : undefined, { roomId: currentRoomId, auth });

    // Snapshot and clear pending drawings to avoid races where stale pending
    // items re-append after a backend clear or undo. We'll re-append only
    // those that the backend doesn't already provide.
    const pendingSnapshot = [...pendingDrawings];
    setPendingDrawings([]);

    serverCountRef.current = backendCount;
    // Re-append any pending drawings that the backend didn't return.
    const drawingMatches = (a, b) => {
      if (!a || !b) return false;
      if (a.drawingId && b.drawingId && a.drawingId === b.drawingId) return true;
      // Fallback heuristic: same user + timestamp close + similar path length
      try {
        const sameUser = a.user === b.user;
        const tsA = a.timestamp || a.ts || 0;
        const tsB = b.timestamp || b.ts || 0;
        const tsClose = Math.abs(tsA - tsB) < 3000; // 3s tolerance
        const lenA = Array.isArray(a.pathData) ? a.pathData.length : (a.pathData && a.pathData.points ? a.pathData.points.length : 0);
        const lenB = Array.isArray(b.pathData) ? b.pathData.length : (b.pathData && b.pathData.points ? b.pathData.points.length : 0);
        const lenClose = Math.abs(lenA - lenB) <= 2;
        return sameUser && tsClose && lenClose;
      } catch (e) {
        return false;
      }
    };

    // If backend included 'cut' records that list originalStrokeIds, ensure
    // those originals are removed so they do not reappear after refresh.
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
    } catch (e) {
      // best-effort
    }

    // Re-append pending drawings that the backend didn't return, but
    // skip any pending items older than the authoritative clearedAt timestamp
    const clearedAt = currentRoomId ? roomClearedAtRef.current[currentRoomId] : null;
    pendingSnapshot.forEach(pd => {
      try {
        const pdTs = pd.timestamp || pd.ts || 0;
        if (clearedAt && pdTs < clearedAt) {
          // This pending drawing was created before a server clear; ignore it
          return;
        }
      } catch (e) { }
      const exists = userData.drawings.find(d => drawingMatches(d, pd));
      if (!exists) {
        userData.drawings.push(pd);
      }
    });

    drawAllDrawings();
    setIsLoading(false);
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
      setIsLoading(true);
      // Throttle pan-triggered refreshes: if we recently refreshed, defer until pan end
      try {
        const now = Date.now();
        const diff = now - panLastRefreshRef.current;
        console.debug(`[pan] now=${now} lastRefresh=${panLastRefreshRef.current} diff=${diff} cooldown=${PAN_REFRESH_COOLDOWN_MS}`);
        if (diff > PAN_REFRESH_COOLDOWN_MS) {
          panLastRefreshRef.current = now;
          console.debug('[pan] triggering immediate mergedRefreshCanvas');
          mergedRefreshCanvas('pan-start').finally(() => setIsLoading(false));
        } else {
          // Mark that we skipped the immediate refresh and schedule a deferred refresh on mouseup
          panRefreshSkippedRef.current = true;
          console.debug('[pan] skipped immediate refresh; scheduling deferred refresh on mouseup');
          // ensure we clear any previous timer and set a safety timer to run after PAN_REFRESH_COOLDOWN_MS
          if (panEndRefreshTimerRef.current) clearTimeout(panEndRefreshTimerRef.current);
          panEndRefreshTimerRef.current = setTimeout(() => {
            if (panRefreshSkippedRef.current) {
              panRefreshSkippedRef.current = false;
              panLastRefreshRef.current = Date.now();
              console.debug('[pan] deferred timer firing mergedRefreshCanvas');
              mergedRefreshCanvas('pan-deferred').finally(() => setIsLoading(false));
            }
            panEndRefreshTimerRef.current = null;
          }, Math.max(200, PAN_REFRESH_COOLDOWN_MS - diff));
          setIsLoading(false);
        }
      } catch (e) {
        // Fallback: attempt a merged refresh if anything goes wrong
        mergedRefreshCanvas().finally(() => setIsLoading(false));
      }
      return;
    }

    if (!editingEnabled) return; // prevent drawing but allow other handlers like panning to proceed

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
    if (!editingEnabled) return; // prevent drawing but allow other handlers like panning to proceed
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

    // If editing is disabled (history mode, selected user playback, or view-only room),
    // ensure we do not create or submit any new drawings. This prevents archived rooms
    // from accepting client-side edits even if an event slips through.
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
        //drawAllDrawings();

        console.log('About to submit stroke:', {
          auth: auth,
          currentRoomId: currentRoomId,
          newDrawing: newDrawing
        });
        await submitToDatabase(newDrawing, auth, { roomId: currentRoomId }, setUndoAvailable, setRedoAvailable);
        setPendingDrawings(prev => prev.filter(d => d.drawingId !== newDrawing.drawingId));
        mergedRefreshCanvas();

        // Update undo/redo availability after stroke submission
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
      //drawAllDrawings();

      setUndoStack(prev => [...prev, newDrawing]);
      setRedoStack([]);
      setIsRefreshing(true);

      try {
        await submitToDatabase(newDrawing, auth, { roomId: currentRoomId }, setUndoAvailable, setRedoAvailable);
        setPendingDrawings(prev => prev.filter(d => d.drawingId !== newDrawing.drawingId));
        mergedRefreshCanvas();

        // Update undo/redo availability after shape submission
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

  const openHistoryDialog = () => {
    // deselect any selected username before choosing a new history range
    setSelectedUser("");

    // helper: format epoch ms into a local 'yyyy-MM-ddTHH:mm' string suitable for input[type="datetime-local"]
    const fmt = (ms) => {
      if (!ms || !Number.isFinite(ms)) return '';
      const d = new Date(ms);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    if (historyRange && historyRange.start && historyRange.end) {
      setHistoryStartInput(fmt(historyRange.start));
      setHistoryEndInput(fmt(historyRange.end));
    } else {
      // keep previously-typed inputs (if any) so the dialog 'remembers' the user's last values
      setHistoryStartInput(historyStartInput || '');
      setHistoryEndInput(historyEndInput || '');
    }

    setHistoryDialogOpen(true);
  };


  const handleApplyHistory = async (startMs, endMs) => {
    // startMs and endMs are epoch ms. If not provided, read from inputs.
    const start = startMs !== undefined ? startMs : (historyStartInput ? (new Date(historyStartInput)).getTime() : NaN);
    const end = endMs !== undefined ? endMs : (historyEndInput ? (new Date(historyEndInput)).getTime() : NaN);

    // Improved validation messages
    if (isNaN(start) || isNaN(end)) {
      showLocalSnack("Please select both start and end date/time before applying History Recall.");
      return;
    }
    if (start > end) {
      showLocalSnack("Invalid time range selected. Make sure start <= end.");
      return;
    }

    // Deselect any selected user when entering history recall
    setSelectedUser("");
    setHistoryRange({ start, end });
    setIsLoading(true);

    // Try to load drawings for the requested time range
    await clearCanvasForRefresh();
    // set a temporary historyRange so mergedRefreshCanvas will use it
    setHistoryRange({ start, end });
    try {
      const backendCount = await backendRefreshCanvas(serverCountRef.current, userData, drawAllDrawings, start, end, { roomId: currentRoomId, auth });
      serverCountRef.current = backendCount;
      // If no drawings loaded, inform user and rollback historyRange
      if (!userData.drawings || userData.drawings.length === 0) {
        setHistoryRange(null);
        showLocalSnack("No drawings were found in that date/time range. Please select another range or exit history recall mode.");
        return;
      }
      setHistoryMode(true);
      setHistoryDialogOpen(false);
    } catch (e) {
      console.error("Error applying history range:", e);
      setHistoryRange(null);
      showLocalSnack("An error occurred while loading history. See console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-refresh when the active room changes
  useEffect(() => {
    // wipe local cache so we don't flash previous room's strokes
    userData.drawings = [];
    setIsRefreshing(true);

    // clear what's on screen immediately
    try {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx && canvasRef.current) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      drawAllDrawings();
    } catch { }

    // reload for the new room
    (async () => {
      try {
        await mergedRefreshCanvas();  // already room-aware
      } finally {
        setIsRefreshing(false);
      }
    })();
  }, [currentRoomId, canvasRefreshTrigger]);



  const exitHistoryMode = async () => {
    // Deselect any selected user when leaving history mode
    setSelectedUser("");
    setHistoryMode(false);
    setHistoryRange(null);
    setIsLoading(true);
    try {
      await clearCanvasForRefresh();
      serverCountRef.current = await backendRefreshCanvas(serverCountRef.current, userData, drawAllDrawings, undefined, undefined, { roomId: currentRoomId, auth });
    } finally {
      setIsLoading(false);
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
    // ensure any pending/stale drawings are removed so they won't reappear
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
    // ensure no pending drawings remain after a refresh clear
    setPendingDrawings([]);
    serverCountRef.current = 0;

    // Clear selection overlay artifacts
    setSelectionRect(null);
    setSelectionStart(null);

    // Reset draw mode to freehand if in select mode
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
      // After undo completes, refresh undo/redo availability from server
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
      // After redo completes, refresh undo/redo availability from server
      try {
        await checkUndoRedoAvailability(auth, setUndoAvailable, setRedoAvailable, currentRoomId);
      } catch (e) { }
    } catch (error) {
      console.error("Error during redo:", error);
    }
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
    // Set button availability based on local stacks (legacy behavior)
    setUndoAvailable(undoStack.length > 0);
    setRedoAvailable(redoStack.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoStack, redoStack]);

  const [showToolbar, setShowToolbar] = useState(true);
  const [hoverToolbar, setHoverToolbar] = useState(false);
  // editingEnabled controls whether the user can perform mutating actions.
  // When historyMode is active, a specific user is selected for replay, or
  // when viewOnly is true (room is archived or user is a viewer), editing
  // should be disabled.
  const editingEnabled = !(historyMode || (selectedUser && selectedUser !== "") || viewOnly);

  return (
    <div className="Canvas-wrapper" style={{ pointerEvents: "auto" }}>
      {/* Top header: room name + optional history range + exit button */}
      <Box
        sx={{
          position: 'absolute',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2100,
          bgcolor: 'background.paper',
          px: 2,
          py: 0.5,
          borderRadius: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          boxShadow: '0 6px 14px rgba(0,0,0,0.12)',
          border: '1px solid rgba(0,0,0,0.08)'
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
          {currentRoomName || 'Master (not in a room)'}
        </Typography>

        {historyMode && historyRange && (
          <Typography variant="caption" sx={{ whiteSpace: 'nowrap', ml: 1 }}>
            {new Date(historyRange.start).toLocaleString()} — {new Date(historyRange.end).toLocaleString()}
          </Typography>
        )}

        {currentRoomId && (
          <Button
            size="small"
            onClick={() => {
              // Clear local history UI state for a smooth return to master
              try {
                setHistoryMode(false);
                setHistoryRange(null);
                setHistoryStartInput('');
                setHistoryEndInput('');
                setSelectedUser('');
              } catch (e) { /* swallow if state setters changed */ }
              onExitRoom();
            }}
            sx={{ ml: 1 }}
          >
            Return to Master
          </Button>
        )}
      </Box>

      {/* Archived overlay banner - visible when viewOnly (archived or explicit viewer) */}
      {viewOnly && (
        <Box
          sx={{
            position: 'absolute',
            top: 56,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2200,
            pointerEvents: 'none',
          }}
        >
          <Paper elevation={6} sx={{ px: 2, py: 0.5, bgcolor: 'rgba(33,33,33,0.86)', color: 'white', borderRadius: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 'bold', letterSpacing: 0.5 }}>
              Archived — View Only
            </Typography>
            {/* Owner-only destructive delete button placed under the banner */}
            {isOwner && (
              <Box sx={{ mt: 1, display: 'flex', justifyContent: 'center' }}>
                <Button size="small" color="error" variant="contained" onClick={() => setConfirmDestructiveOpen(true)} sx={{ pointerEvents: 'all' }}>
                  Delete permanently
                </Button>
              </Box>
            )}
          </Paper>
        </Box>
      )}

      {/* Confirm Destructive Delete dialog (owner-only) */}
      <Dialog open={confirmDestructiveOpen} onClose={() => { setConfirmDestructiveOpen(false); setDestructiveConfirmText(''); }}>
        <DialogTitle>Permanently delete room</DialogTitle>
        <DialogContent>
          <DialogContentText color="error">This will permanently delete this room and all its data for every user. This action is irreversible.</DialogContentText>
          <DialogContentText sx={{ mt: 1 }}>To confirm, type <strong>DELETE</strong> below.</DialogContentText>
          <TextField fullWidth value={destructiveConfirmText} onChange={e => setDestructiveConfirmText(e.target.value)} placeholder="Type DELETE to confirm" sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setConfirmDestructiveOpen(false); setDestructiveConfirmText(''); }}>Cancel</Button>
          <Button variant="contained" color="error" disabled={destructiveConfirmText !== 'DELETE'} onClick={async () => {
            try {
              const { deleteRoom } = await import('./api/rooms');
              await deleteRoom(auth.token, currentRoomId);
              setLocalSnack({ open: true, message: 'Room permanently deleted', duration: 4000 });
              // After Delete, navigate back to dashboard
              try { onExitRoom(); } catch (e) { }
            } catch (e) {
              console.error('Permanent delete failed', e);
              setLocalSnack({ open: true, message: 'Failed to delete room: ' + (e?.message || e), duration: 4000 });
            } finally {
              setConfirmDestructiveOpen(false);
              setDestructiveConfirmText('');
            }
          }}>Delete permanently</Button>
        </DialogActions>
      </Dialog>

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
          /* History Recall props (required so the toolbar can open/change/exit history mode) */
          openHistoryDialog={openHistoryDialog}
          exitHistoryMode={exitHistoryMode}
          historyMode={historyMode}
          controlsDisabled={!editingEnabled}
          onOpenSettings={onOpenSettings}
        />
      </Box>

      {isRefreshing && (
        <div className="Canvas-loading-overlay">
          <div className="Canvas-spinner"></div>
        </div>
      )}

      {/* History Recall Dialog */}
      <Dialog
        open={historyDialogOpen}
        onClose={() => setHistoryDialogOpen(false)}
        aria-labelledby="history-recall-dialog"
      >
        <DialogTitle id="history-recall-dialog">History Recall - Select Date/Time Range</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Choose a start and end date/time to recall drawings from ResilientDB. Only drawings within the selected range will be loaded.
          </DialogContentText>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Start"
              type="datetime-local"
              value={historyStartInput}
              onChange={(e) => setHistoryStartInput(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="End"
              type="datetime-local"
              value={historyEndInput}
              onChange={(e) => setHistoryEndInput(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setHistoryDialogOpen(false); }}>Cancel</Button>
          <Button onClick={async () => { const start = historyStartInput ? (new Date(historyStartInput)).getTime() : NaN; const end = historyEndInput ? (new Date(historyEndInput)).getTime() : NaN; await handleApplyHistory(start, end); }}>Apply</Button>
        </DialogActions>
      </Dialog>

      <Fade in={Boolean(historyMode || (selectedUser && selectedUser !== ""))} timeout={300}>
        <Paper
          elevation={6}
          sx={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2000,
            bgcolor: 'background.paper',
            px: 2,
            py: 0.6,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            borderRadius: 1.5
          }}
        >
          <InfoOutlinedIcon fontSize="small" />
          <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
            {historyMode
              ? 'History Mode Enabled — Canvas Editing Disabled'
              : (selectedUser && selectedUser !== '' ? 'Viewing Past Drawing History of Selected User — Canvas Editing Disabled' : '')}
          </Typography>
        </Paper>
      </Fade>

      {/* Loading overlay: fades in/out while drawings load */}
      <Fade in={Boolean(isLoading)} timeout={300}>
        <Paper elevation={6} sx={{
          position: 'absolute',
          left: '50%',
          top: '12%',
          transform: 'translateX(-50%)',
          padding: '8px 12px',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          gap: 1
        }}>
          <CircularProgress size={18} />
          <Typography variant="body2">Loading Drawings...</Typography>
        </Paper>
      </Fade>

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
              // Immediate local clear for responsiveness
              await clearCanvas();
              try {
                const resp = await clearBackendCanvas({ roomId: currentRoomId, auth });
                // If backend returned a clearedAt timestamp, use it as authoritative
                if (resp && resp.clearedAt && currentRoomId) {
                  roomClearedAtRef.current[currentRoomId] = resp.clearedAt;
                }
              } catch (e) {
                console.error('Failed to clear backend:', e);
              }
              // Update undo/redo availability after clear
              try {
                await checkUndoRedoAvailability(auth, setUndoAvailable, setRedoAvailable, currentRoomId);
              } catch (e) { }
              setUserList([]);
              try { setSelectedUser(''); } catch (e) { /* ignore if setter missing */ }
              setClearDialogOpen(false);
            }}
            color="primary"
            autoFocus
          >
            Yes
          </Button>
        </DialogActions>
      </Dialog>
      <SafeSnackbar open={localSnack.open} message={localSnack.message} autoHideDuration={localSnack.duration} onClose={closeLocalSnack} />
    </div>
  );
}

export default Canvas;
