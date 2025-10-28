import React, { useRef, useState, useEffect } from "react";
import "../styles/Canvas.css";

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
} from "@mui/material";
import SafeSnackbar from "./SafeSnackbar";

import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import Toolbar from "./Toolbar";
import { useCanvasSelection } from "../hooks/useCanvasSelection";
import useBrushEngine from "../hooks/useBrushEngine";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import {
  submitToDatabase,
  refreshCanvas as backendRefreshCanvas,
  clearBackendCanvas,
  undoAction,
  redoAction,
  checkUndoRedoAvailability,
} from "../services/canvasBackendJWT";
import { Drawing } from "../lib/drawing";
import { getSocket, setSocketToken } from "../services/socket";
import { handleAuthError } from "../utils/authUtils";
import { getUsername } from "../utils/getUsername";
import { getAuthUser } from "../utils/getAuthUser";
import { resetMyStacks } from "../api/rooms";

class UserData {
  constructor(userId, username) {
    this.userId = userId;
    this.username = username;
    this.drawings = [];
  }

  addDrawing(drawing) {
    this.drawings.push(drawing);
  }

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
  currentRoomName = "Master (not in a room)",
  onExitRoom = () => { },
  onOpenSettings = null,
  viewOnly = false,
  isOwner = false,
  roomType = "public",
  walletConnected = false,
}) {
  const canvasRef = useRef(null);
  const snapshotRef = useRef(null);
  const tempPathRef = useRef([]);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const currentUserRef = useRef(null);
  if (currentUserRef.current === null) {
    try {
      const uname =
        getUsername(auth) ||
        `anon_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      currentUserRef.current = `${uname}|${Date.now()}`;
    } catch (e) {
      currentUserRef.current = `anon_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 5)}`;
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

  // Initialize brush engine
  const brushEngine = useBrushEngine();

  // Advanced brush/stamp/filter state
  const [currentBrushType, setCurrentBrushType] = useState("normal");
  const [brushParams, setBrushParams] = useState({});
  const [selectedStamp, setSelectedStamp] = useState(null);
  const [stampSettings, setStampSettings] = useState({
    size: 50,
    rotation: 0,
    opacity: 100,
  });
  const [activeFilter, setActiveFilter] = useState(null);
  const [filterParams, setFilterParams] = useState({});
  const [isFilterPreview, setIsFilterPreview] = useState(false);
  const filterCanvasRef = useRef(null);
  const originalCanvasDataRef = useRef(null);

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
  const PAN_REFRESH_COOLDOWN_MS = 2000;
  const panLastRefreshRef = useRef(0);
  const panRefreshSkippedRef = useRef(false);
  const panEndRefreshTimerRef = useRef(null);
  const pendingPanRefreshRef = useRef(false);
  const [pendingDrawings, setPendingDrawings] = useState([]);
  const refreshTimerRef = useRef(null);
  const submissionQueueRef = useRef([]);
  const isSubmittingRef = useRef(false);
  const confirmedStrokesRef = useRef(new Set());
  const lastDrawnStateRef = useRef(null); // Track last drawn state to avoid redundant redraws
  const isDrawingInProgressRef = useRef(false); // Prevent concurrent drawing operations
  const offscreenCanvasRef = useRef(null); // Offscreen canvas for flicker-free rendering
  const forceNextRedrawRef = useRef(false); // Force next redraw even if signature matches (for undo/redo)
  const [historyMode, setHistoryMode] = useState(false);
  const [historyRange, setHistoryRange] = useState(null); // {start, end} in epoch ms
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyStartInput, setHistoryStartInput] = useState("");
  const [historyEndInput, setHistoryEndInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [localSnack, setLocalSnack] = useState({
    open: false,
    message: "",
    duration: 4000,
  });
  const [confirmDestructiveOpen, setConfirmDestructiveOpen] = useState(false);
  const [destructiveConfirmText, setDestructiveConfirmText] = useState("");
  const showLocalSnack = (msg, duration = 4000) =>
    setLocalSnack({ open: true, message: String(msg), duration });

  // editingEnabled controls whether the user can perform mutating actions.
  // When historyMode is active, a specific user is selected for replay, or
  // when viewOnly is true (room is archived or user is a viewer), editing
  // should be disabled.
  // For secure rooms, wallet must be connected to allow editing.
  const editingEnabled = !(
    historyMode ||
    (selectedUser && selectedUser !== "") ||
    viewOnly ||
    (roomType === "secure" && !walletConnected)
  );
  const closeLocalSnack = () =>
    setLocalSnack({ open: false, message: "", duration: 4000 });

  const roomUiRef = useRef({});
  const previousSelectedUserRef = useRef(null); // Track previous selectedUser to detect changes
  const isRefreshingSelectedUserRef = useRef(false); // Prevent concurrent refreshes
  const selectedUserRefreshQueueRef = useRef(null); // Queue the next refresh target
  const selectedUserAbortControllerRef = useRef(null); // Cancel pending operations
  const roomStacksRef = useRef({});
  const roomClipboardRef = useRef({});
  const roomClearedAtRef = useRef({});

  useEffect(() => {
    if (!currentRoomId) return;
    const ui =
      roomUiRef.current[currentRoomId] ||
      JSON.parse(
        localStorage.getItem(`rescanvas:toolbar:${currentRoomId}`) || "null"
      ) ||
      {};
    if (ui.color) setColor(ui.color);
    if (ui.lineWidth) setLineWidth(ui.lineWidth);
    if (ui.drawMode) setDrawMode(ui.drawMode);
    if (ui.shapeType) setShapeType(ui.shapeType);
    roomUiRef.current[currentRoomId] = {
      color: ui.color ?? color,
      lineWidth: ui.lineWidth ?? lineWidth,
      drawMode: ui.drawMode ?? drawMode,
      shapeType: ui.shapeType ?? shapeType,
    };
    const stacks = roomStacksRef.current[currentRoomId] || {
      undo: [],
      redo: [],
    };
    setUndoStack(stacks.undo);
    setRedoStack(stacks.redo);
    const clip = roomClipboardRef.current[currentRoomId] || null;
    if (setCutImageData) setCutImageData(clip);
  }, [currentRoomId]);

  useEffect(() => {
    if (!currentRoomId) return;
    const ui = { color, lineWidth, drawMode, shapeType };
    roomUiRef.current[currentRoomId] = ui;
    try {
      localStorage.setItem(
        `rescanvas:toolbar:${currentRoomId}`,
        JSON.stringify(ui)
      );
    } catch { }
  }, [currentRoomId, color, lineWidth, drawMode, shapeType]);

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
      try {
        if (panEndRefreshTimerRef.current) {
          clearTimeout(panEndRefreshTimerRef.current);
          panEndRefreshTimerRef.current = null;
        }
        if (panRefreshSkippedRef.current) {
          panRefreshSkippedRef.current = false;
          mergedRefreshCanvas("pan-mouseup-skipped").finally(() => {
            try {
              setIsLoading(false);
            } catch (e) { }
          });
        }
        if (pendingPanRefreshRef.current) {
          pendingPanRefreshRef.current = false;
          mergedRefreshCanvas("pan-mouseup-pending").finally(() => {
            try {
              setIsLoading(false);
            } catch (e) { }
          });
        }
      } catch (e) { }
    };
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [panOffset]);

  // Process submission queue to ensure strokes are submitted sequentially
  const processSubmissionQueue = async () => {
    if (isSubmittingRef.current || submissionQueueRef.current.length === 0) {
      return;
    }

    isSubmittingRef.current = true;

    while (submissionQueueRef.current.length > 0) {
      const submission = submissionQueueRef.current.shift();
      try {
        await submission();
      } catch (error) {
        console.error("Error processing queued submission:", error);
      }
    }

    isSubmittingRef.current = false;

    // After processing all queued submissions, schedule a refresh to sync with backend
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      mergedRefreshCanvas("post-queue").catch((e) =>
        console.error("Error during post-queue refresh:", e)
      );
      refreshTimerRef.current = null;
    }, 500);
  };

  useEffect(() => {
    if (!auth?.token || !currentRoomId) return;
    try {
      setSocketToken(auth.token);
    } catch (e) { }

    const socket = getSocket(auth.token);

    try {
      socket.emit("join_room", { roomId: currentRoomId, token: auth?.token });
    } catch (e) {
      socket.emit("join_room", { roomId: currentRoomId });
    }

    const scheduleRefresh = (delay = 300) => {
      try {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      } catch (e) { }
      refreshTimerRef.current = setTimeout(() => {
        mergedRefreshCanvas().catch((e) =>
          console.error("Error during scheduled refresh:", e)
        );
        refreshTimerRef.current = null;
      }, delay);
    };

    const handleNewStroke = (data) => {
      try {
        const myName = getUsername(auth);
        if (data.user === myName) {
          // This is confirmation of our own stroke
          const stroke = data.stroke;
          if (stroke && stroke.drawingId) {
            confirmedStrokesRef.current.add(stroke.drawingId);
          }
          return;
        }
      } catch (e) {
        try {
          const user = getAuthUser(auth) || {};
          if (data.user === user.username) {
            // This is confirmation of our own stroke
            const stroke = data.stroke;
            if (stroke && stroke.drawingId) {
              confirmedStrokesRef.current.add(stroke.drawingId);
            }
            return;
          }
        } catch (e2) { }
      }

      const stroke = data.stroke;
      const drawing = new Drawing(
        stroke.drawingId ||
        `remote_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        stroke.color || "#000000",
        stroke.lineWidth || 5,
        stroke.pathData || [],
        stroke.ts || stroke.timestamp || Date.now(),
        stroke.user || "Unknown"
      );

      try {
        const clearedAt = roomClearedAtRef.current[currentRoomId];
        if (
          clearedAt &&
          (drawing.timestamp || drawing.ts || Date.now()) < clearedAt
        ) {
          return;
        }
      } catch (e) { }

      setPendingDrawings((prev) => [...prev, drawing]);

      // Use requestAnimationFrame for smoother rendering
      requestAnimationFrame(() => {
        drawAllDrawings();
      });

      scheduleRefresh(350);
    };

    const handleUserJoined = (data) => {
      try {
        if (!data) return;
        if (data.roomId !== currentRoomId) return;
        console.debug("socket user_joined event", data);
        if (data.username) {
          showLocalSnack(`${data.username} joined the canvas.`);
        }
      } catch (e) { }
    };

    const handleUserLeft = (data) => {
      try {
        if (!data) return;
        if (data.roomId !== currentRoomId) return;
        console.debug("socket user_left event", data);
        if (data.username) {
          showLocalSnack(`${data.username} left the canvas.`);
        }
      } catch (e) { }
    };

    const handleStrokeUndone = (data) => {
      console.log("Stroke undone event received:", data);

      // CRITICAL: Force next redraw to bypass signature check
      forceNextRedrawRef.current = true;
      lastDrawnStateRef.current = null;

      // Schedule refresh instead of immediate refresh to avoid flicker
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        mergedRefreshCanvas("undo-event");
        refreshTimerRef.current = null;
      }, 100);

      if (currentRoomId) {
        checkUndoRedoAvailability(
          auth,
          setUndoAvailable,
          setRedoAvailable,
          currentRoomId
        );
      }
    };

    const handleCanvasCleared = (data) => {
      console.log("Canvas cleared event received:", data);
      const clearedAt = data && data.clearedAt ? data.clearedAt : Date.now();
      if (currentRoomId) roomClearedAtRef.current[currentRoomId] = clearedAt;

      // Clear local authoritative drawings and pending drawings that predate the clear
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
          roomStacksRef.current[currentRoomId] = { undo: [], redo: [] };
          roomClipboardRef.current[currentRoomId] = null;
        }
      } catch (e) { }

      clearCanvasForRefresh();
      drawAllDrawings();

      if (currentRoomId) {
        checkUndoRedoAvailability(
          auth,
          setUndoAvailable,
          setRedoAvailable,
          currentRoomId
        );
      }
    };

    socket.on("new_stroke", handleNewStroke);
    socket.on("stroke_undone", handleStrokeUndone);
    socket.on("canvas_cleared", handleCanvasCleared);
    socket.on("user_joined", handleUserJoined);
    socket.on("user_left", handleUserLeft);
    socket.on("user_joined_debug", (d) => {
      console.debug("socket user_joined_debug", d);
    });

    return () => {
      socket.off("new_stroke", handleNewStroke);
      socket.off("stroke_undone", handleStrokeUndone);
      socket.off("canvas_cleared", handleCanvasCleared);
      socket.off("user_joined", handleUserJoined);
      socket.off("user_left", handleUserLeft);
      try {
        socket.emit("leave_room", {
          roomId: currentRoomId,
          token: auth?.token,
        });
      } catch (e) {
        socket.emit("leave_room", { roomId: currentRoomId });
      }
      try {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      } catch (e) { }
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
          roomStacksRef.current[currentRoomId] = { undo: [], redo: [] };
        }

        // Reset selectedUser tracking when room changes
        previousSelectedUserRef.current = null;
        isRefreshingSelectedUserRef.current = false;
        selectedUserRefreshQueueRef.current = null;

        if (auth?.token && currentRoomId) {
          try {
            await resetMyStacks(auth.token, currentRoomId);
          } catch (e) { }
        }

        if (currentRoomId) {
          try {
            await checkUndoRedoAvailability(
              auth,
              setUndoAvailable,
              setRedoAvailable,
              currentRoomId
            );
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
        roomStacksRef.current[currentRoomId] = { undo: [], redo: [] };
      }
      if (currentRoomId) {
        checkUndoRedoAvailability(
          auth,
          setUndoAvailable,
          setRedoAvailable,
          currentRoomId
        ).catch(() => { });
      }
    } catch (e) { }
  }, [auth?.token, currentRoomId]);

  // Force full refresh when selectedUser changes (drawing history selection/deselection)
  useEffect(() => {
    if (!currentRoomId || !auth?.token) return;

    // Serialize selectedUser for comparison (handles both string and object)
    const serializeSelectedUser = (user) => {
      if (!user || user === "") return "";
      if (typeof user === "string") return user;
      if (typeof user === "object")
        return JSON.stringify({
          user: user.user,
          periodStart: user.periodStart,
        });
      return String(user);
    };

    const currentSerialized = serializeSelectedUser(selectedUser);
    const previousSerialized = previousSelectedUserRef.current;

    // Only refresh if selectedUser actually changed
    if (currentSerialized === previousSerialized) {
      return;
    }

    // If a refresh is in progress, queue this change for execution after current one completes
    if (isRefreshingSelectedUserRef.current) {
      console.debug(
        "[selectedUser] Refresh in progress, queuing new selection:",
        currentSerialized
      );
      selectedUserRefreshQueueRef.current = currentSerialized;
      return;
    }

    const performRefresh = async (targetSerialized) => {
      isRefreshingSelectedUserRef.current = true;

      try {
        setIsLoading(true);

        // Update the ref to mark this as the last processed value
        previousSelectedUserRef.current = targetSerialized;

        // Force complete refresh from backend
        userData.drawings = [];
        setPendingDrawings([]);
        serverCountRef.current = 0;
        lastDrawnStateRef.current = null;

        const isDeselect = !selectedUser || selectedUser === "";
        const logLabel = isDeselect
          ? "selectedUser-deselect"
          : "selectedUser-select";
        console.debug(`[selectedUser] Performing full refresh: ${logLabel}`, {
          to: targetSerialized,
        });

        await clearCanvasForRefresh();
        await mergedRefreshCanvas(logLabel);
        await drawAllDrawings();
      } catch (error) {
        console.error("Error refreshing on selectedUser change:", error);
      } finally {
        setIsLoading(false);
        isRefreshingSelectedUserRef.current = false;

        // Check if there's a queued refresh waiting
        if (selectedUserRefreshQueueRef.current !== null) {
          const queuedTarget = selectedUserRefreshQueueRef.current;
          selectedUserRefreshQueueRef.current = null;

          // Only process queued refresh if it's different from what we just processed
          if (queuedTarget !== targetSerialized) {
            console.debug(
              "[selectedUser] Processing queued selection:",
              queuedTarget
            );
            // Use setTimeout to break out of the current call stack
            setTimeout(() => performRefresh(queuedTarget), 0);
          }
        }
      }
    };

    // Start the refresh
    performRefresh(currentSerialized);
  }, [selectedUser, currentRoomId]);

  const initializeUserData = () => {
    const uniqueUserId =
      auth?.user?.id ||
      `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const username = auth?.user?.username || "MainUser";
    return new UserData(uniqueUserId, username);
  };
  const [userData, setUserData] = useState(() => initializeUserData());
  const generateId = () =>
    `drawing_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const serverCountRef = useRef(0);

  // Advanced Brush/Stamp/Filter Functions
  const handleBrushSelect = (brushType) => {
    console.log("handleBrushSelect called with:", brushType);
    setCurrentBrushType(brushType);
    brushEngine.setBrushType(brushType);
    setDrawMode("freehand");
    console.log("Current brush type set to:", brushType);
  };

  const handleBrushParamsChange = (params) => {
    setBrushParams(params);
    brushEngine.setBrushParams(params);
  };

  const placeStamp = async (x, y, stamp, settings) => {
    const canvas = canvasRef.current;
    if (!canvas || !stamp) return;

    const context = canvas.getContext("2d");
    context.save();

    // Apply settings
    context.globalAlpha = settings.opacity / 100;
    context.translate(x, y);
    context.rotate((settings.rotation * Math.PI) / 180);

    const size = settings.size;

    if (stamp.emoji) {
      context.font = `${size}px serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(stamp.emoji, 0, 0);
    } else if (stamp.image) {
      const img = new Image();
      img.onload = () => {
        context.drawImage(img, -size / 2, -size / 2, size, size);
      };
      img.src = stamp.image;
    }

    context.restore();

    // Create drawing record for stamp
    const stampDrawing = new Drawing(
      generateId(),
      color,
      lineWidth,
      [{ x, y }],
      Date.now(),
      currentUser,
      {
        drawingType: "stamp",
        stampData: stamp,
        stampSettings: settings,
      }
    );

    stampDrawing.roomId = currentRoomId;

    // Debug: Log the stamp drawing to verify structure
    console.log("=== PLACING STAMP DEBUG ===");
    console.log("Stamp Drawing object:", stampDrawing);
    console.log("pathData:", stampDrawing.pathData);
    console.log("pathData is array:", Array.isArray(stampDrawing.pathData));
    console.log("pathData length:", stampDrawing.pathData ? stampDrawing.pathData.length : 0);
    console.log("stampData:", stampDrawing.stampData);
    console.log("stampSettings:", stampDrawing.stampSettings);
    console.log("metadata:", stampDrawing.getMetadata());

    userData.addDrawing(stampDrawing);
    setPendingDrawings((prev) => [...prev, stampDrawing]);

    // Add to undo stack
    setUndoStack((prev) => [...prev, stampDrawing]);
    setRedoStack([]);

    // Submit to backend
    try {
      await submitToDatabase(
        stampDrawing,
        auth,
        { roomId: currentRoomId, roomType },
        setUndoAvailable,
        setRedoAvailable
      );
      console.log("Stamp submitted successfully:", stampDrawing.drawingId);
    } catch (error) {
      console.error("Failed to submit stamp:", error);
      handleAuthError(error);
      showLocalSnack("Failed to save stamp. Please try again.");
    }
  };

  const handleStampSelect = (stamp, settings) => {
    setSelectedStamp(stamp);
    setStampSettings(settings);
    setDrawMode("stamp");
  };

  const handleStampChange = (stamp, settings) => {
    setSelectedStamp(stamp);
    setStampSettings(settings);
  };

  const applyFilter = (filterType, params) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Store original canvas data for undo
    originalCanvasDataRef.current = canvas.toDataURL();

    const context = canvas.getContext("2d");
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const filteredImageData = applyImageFilter(imageData, filterType, params);

    context.putImageData(filteredImageData, 0, 0);

    // Create filter record
    const filterDrawing = new Drawing(
      generateId(),
      "#000000",
      0,
      [],
      Date.now(),
      currentUser,
      {
        drawingType: "filter",
        filterType,
        filterParams: params,
      }
    );

    userData.addDrawing(filterDrawing);
    setPendingDrawings((prev) => [...prev, filterDrawing]);

    setUndoStack((prev) => [...prev, filterDrawing]);
    setRedoStack([]);
    setIsFilterPreview(false);
  };

  const previewFilter = (filterType, params) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!originalCanvasDataRef.current) {
      originalCanvasDataRef.current = canvas.toDataURL();
    }

    const context = canvas.getContext("2d");
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const filteredImageData = applyImageFilter(imageData, filterType, params);

    context.putImageData(filteredImageData, 0, 0);
    setIsFilterPreview(true);
  };

  const undoFilter = () => {
    if (originalCanvasDataRef.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext("2d");
      const img = new Image();
      img.onload = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(img, 0, 0);
        setIsFilterPreview(false);
        originalCanvasDataRef.current = null;
      };
      img.src = originalCanvasDataRef.current;
    }
  };

  const applyImageFilter = (imageData, filterType, params) => {
    const data = imageData.data;
    const filtered = new ImageData(
      new Uint8ClampedArray(data),
      imageData.width,
      imageData.height
    );

    switch (filterType) {
      case "blur":
        return applyBlurFilter(filtered, params.intensity || 5);
      case "hueShift":
        return applyHueShiftFilter(
          filtered,
          params.hue || 0,
          params.saturation || 0
        );
      case "chalk":
        return applyChalkFilter(
          filtered,
          params.roughness || 50,
          params.opacity || 80
        );
      case "fade":
        return applyFadeFilter(filtered, params.amount || 30);
      case "vintage":
        return applyVintageFilter(
          filtered,
          params.sepia || 60,
          params.vignette || 40
        );
      case "neon":
        return applyNeonFilter(
          filtered,
          params.intensity || 15,
          params.color || 180
        );
      default:
        return filtered;
    }
  };

  const applyBlurFilter = (imageData, intensity) => {
    // Simple box blur implementation
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const result = new Uint8ClampedArray(data);

    const radius = Math.max(1, Math.floor(intensity));

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0,
          g = 0,
          b = 0,
          a = 0,
          count = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const idx = (ny * width + nx) * 4;
              r += data[idx];
              g += data[idx + 1];
              b += data[idx + 2];
              a += data[idx + 3];
              count++;
            }
          }
        }

        const idx = (y * width + x) * 4;
        result[idx] = r / count;
        result[idx + 1] = g / count;
        result[idx + 2] = b / count;
        result[idx + 3] = a / count;
      }
    }

    return new ImageData(result, width, height);
  };

  const applyHueShiftFilter = (imageData, hueShift, saturationShift) => {
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Convert RGB to HSL
      const max = Math.max(r, g, b) / 255;
      const min = Math.min(r, g, b) / 255;
      const diff = max - min;
      const sum = max + min;

      let h = 0;
      const l = sum / 2;
      const s = diff === 0 ? 0 : l > 0.5 ? diff / (2 - sum) : diff / sum;

      if (diff !== 0) {
        switch (max) {
          case r / 255:
            h = (g - b) / 255 / diff + (g < b ? 6 : 0);
            break;
          case g / 255:
            h = (b - r) / 255 / diff + 2;
            break;
          case b / 255:
            h = (r - g) / 255 / diff + 4;
            break;
        }
        h /= 6;
      }

      // Apply shifts
      h = (h + hueShift / 360) % 1;
      const newS = Math.max(0, Math.min(1, s + saturationShift / 100));

      // Convert back to RGB
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      let newR, newG, newB;

      if (newS === 0) {
        newR = newG = newB = l;
      } else {
        const q = l < 0.5 ? l * (1 + newS) : l + newS - l * newS;
        const p = 2 * l - q;
        newR = hue2rgb(p, q, h + 1 / 3);
        newG = hue2rgb(p, q, h);
        newB = hue2rgb(p, q, h - 1 / 3);
      }

      data[i] = Math.round(newR * 255);
      data[i + 1] = Math.round(newG * 255);
      data[i + 2] = Math.round(newB * 255);
    }

    return imageData;
  };

  const applyChalkFilter = (imageData, roughness, opacity) => {
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * (roughness / 100) * 255;
      const opacityFactor = opacity / 100;

      data[i] = Math.max(0, Math.min(255, data[i] + noise)) * opacityFactor;
      data[i + 1] =
        Math.max(0, Math.min(255, data[i + 1] + noise)) * opacityFactor;
      data[i + 2] =
        Math.max(0, Math.min(255, data[i + 2] + noise)) * opacityFactor;
      data[i + 3] = data[i + 3] * opacityFactor;
    }

    return imageData;
  };

  const applyFadeFilter = (imageData, amount) => {
    const data = imageData.data;
    const fadeAmount = 1 - amount / 100;

    for (let i = 0; i < data.length; i += 4) {
      data[i + 3] = data[i + 3] * fadeAmount;
    }

    return imageData;
  };

  const applyVintageFilter = (imageData, sepia, vignette) => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const sepiaAmount = sepia / 100;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Apply sepia
      data[i] = Math.min(
        255,
        (r * 0.393 + g * 0.769 + b * 0.189) * sepiaAmount +
        r * (1 - sepiaAmount)
      );
      data[i + 1] = Math.min(
        255,
        (r * 0.349 + g * 0.686 + b * 0.168) * sepiaAmount +
        g * (1 - sepiaAmount)
      );
      data[i + 2] = Math.min(
        255,
        (r * 0.272 + g * 0.534 + b * 0.131) * sepiaAmount +
        b * (1 - sepiaAmount)
      );

      // Apply vignette
      const x = (i / 4) % width;
      const y = Math.floor(i / 4 / width);
      const centerX = width / 2;
      const centerY = height / 2;
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      const maxDistance = Math.sqrt(centerX ** 2 + centerY ** 2);
      const vignetteAmount = 1 - (distance / maxDistance) * (vignette / 100);

      data[i] *= vignetteAmount;
      data[i + 1] *= vignetteAmount;
      data[i + 2] *= vignetteAmount;
    }

    return imageData;
  };

  const applyNeonFilter = (imageData, intensity, hue) => {
    const data = imageData.data;
    const glowIntensity = intensity / 100;

    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;

      if (brightness > 128) {
        const neonR = Math.sin((hue * Math.PI) / 180) * 127 + 128;
        const neonG = Math.sin(((hue + 120) * Math.PI) / 180) * 127 + 128;
        const neonB = Math.sin(((hue + 240) * Math.PI) / 180) * 127 + 128;

        data[i] = Math.min(255, data[i] + neonR * glowIntensity);
        data[i + 1] = Math.min(255, data[i + 1] + neonG * glowIntensity);
        data[i + 2] = Math.min(255, data[i + 2] + neonB * glowIntensity);
      }
    }

    return imageData;
  };

  const drawAllDrawings = () => {
    // Prevent concurrent drawing operations
    if (isDrawingInProgressRef.current) {
      return;
    }

    isDrawingInProgressRef.current = true;

    // Save current brush state
    const savedBrushType = brushEngine ? brushEngine.brushType : null;
    const savedBrushParams = brushEngine ? brushEngine.brushParams : null;

    // Debug: Check if brushEngine is available
    console.log("[drawAllDrawings] brushEngine available:", !!brushEngine, "has drawWithType:", !!(brushEngine && brushEngine.drawWithType));

    try {
      setIsLoading(true);
      const canvas = canvasRef.current;
      if (!canvas) {
        setIsLoading(false);
        isDrawingInProgressRef.current = false;
        return;
      }
      const context = canvas.getContext("2d");
      if (!context) {
        setIsLoading(false);
        isDrawingInProgressRef.current = false;
        return;
      }

      // Include any locally-pending drawings (e.g. received via socket but
      // not yet reflected by a backend refresh) so they render immediately.
      // IMPORTANT: Deduplicate to avoid rendering the same drawing twice
      const userDrawingIds = new Set((userData.drawings || []).map(d => d.drawingId));
      const uniquePendingDrawings = (pendingDrawings || []).filter(
        pd => !userDrawingIds.has(pd.drawingId)
      );

      const combined = [
        ...(userData.drawings || []),
        ...uniquePendingDrawings,
      ];

      // Create a state signature to detect if we need to redraw
      const stateSignature = JSON.stringify({
        drawingCount: combined.length,
        drawingIds: combined
          .map((d) => d.drawingId)
          .sort()
          .join(","),
        pendingCount: uniquePendingDrawings.length,
      });

      console.log("[drawAllDrawings] State check:", {
        combined: combined.length,
        lastSignature: lastDrawnStateRef.current ? "exists" : "null",
        currentSignature: stateSignature.substring(0, 100),
        forceRedraw: forceNextRedrawRef.current,
        willSkip: !forceNextRedrawRef.current && lastDrawnStateRef.current === stateSignature
      });

      // Skip redundant redraws if state hasn't changed AND we're not forcing a redraw
      if (!forceNextRedrawRef.current && lastDrawnStateRef.current === stateSignature) {
        console.log("[drawAllDrawings] SKIPPING - state unchanged");
        setIsLoading(false);
        isDrawingInProgressRef.current = false;
        return;
      }

      // Clear force flag after checking it
      forceNextRedrawRef.current = false;
      lastDrawnStateRef.current = stateSignature;

      // Create or reuse offscreen canvas for flicker-free rendering
      if (
        !offscreenCanvasRef.current ||
        offscreenCanvasRef.current.width !== canvasWidth ||
        offscreenCanvasRef.current.height !== canvasHeight
      ) {
        offscreenCanvasRef.current = document.createElement("canvas");
        offscreenCanvasRef.current.width = canvasWidth;
        offscreenCanvasRef.current.height = canvasHeight;
      }

      const offscreenContext = offscreenCanvasRef.current.getContext("2d");
      offscreenContext.imageSmoothingEnabled = false;
      offscreenContext.clearRect(0, 0, canvasWidth, canvasHeight);

      const cutOriginalIds = new Set();
      try {
        combined.forEach((d) => {
          if (
            d &&
            d.pathData &&
            d.pathData.tool === "cut" &&
            Array.isArray(d.pathData.originalStrokeIds)
          ) {
            d.pathData.originalStrokeIds.forEach((id) =>
              cutOriginalIds.add(id)
            );
          }
        });
      } catch (e) { }

      const sortedDrawings = combined.sort((a, b) => {
        const orderA =
          a.order !== undefined ? a.order : a.timestamp || a.ts || 0;
        const orderB =
          b.order !== undefined ? b.order : b.timestamp || b.ts || 0;
        return orderA - orderB;
      });

      // Render drawings in chronological order. When a 'cut' record appears
      // we immediately apply a destination-out erase so it removes prior content
      // but does not erase strokes that are drawn after the cut.
      const maskedOriginals = new Set();
      let seenAnyCut = false;

      // Debug: Count brush types
      const brushTypeCounts = {};
      sortedDrawings.forEach(d => {
        const bt = d.brushType || "unknown";
        brushTypeCounts[bt] = (brushTypeCounts[bt] || 0) + 1;
      });
      console.log("[drawAllDrawings] Brush type counts:", brushTypeCounts, "Total drawings:", sortedDrawings.length);

      // Debug: Log all drawing IDs and types being rendered
      console.log("[drawAllDrawings] Rendering strokes:", sortedDrawings.map(d => ({
        id: d.drawingId,
        type: d.drawingType || "stroke",
        brushType: d.brushType || "normal",
        hasParentPasteId: !!(d.parentPasteId || (d.pathData && d.pathData.parentPasteId))
      })));

      for (const drawing of sortedDrawings) {
        // If this is a cut record, apply the erase to the canvas now.
        if (drawing && drawing.pathData && drawing.pathData.tool === "cut") {
          seenAnyCut = true;
          try {
            if (Array.isArray(drawing.pathData.originalStrokeIds)) {
              drawing.pathData.originalStrokeIds.forEach((id) =>
                maskedOriginals.add(id)
              );
            }
          } catch (e) { }

          if (drawing.pathData && drawing.pathData.rect) {
            const r = drawing.pathData.rect;
            offscreenContext.save();
            try {
              offscreenContext.globalCompositeOperation = "destination-out";
              offscreenContext.fillStyle = "rgba(0,0,0,1)";
              // Expand rect slightly to avoid hairline due to subpixel antialiasing
              offscreenContext.fillRect(
                Math.floor(r.x) - 2,
                Math.floor(r.y) - 2,
                Math.ceil(r.width) + 4,
                Math.ceil(r.height) + 4
              );
            } finally {
              offscreenContext.restore();
            }
          }

          continue;
        }

        // Skip originals that have been masked by a cut
        if (
          drawing &&
          drawing.drawingId &&
          (cutOriginalIds.has(drawing.drawingId) ||
            maskedOriginals.has(drawing.drawingId))
        ) {
          continue;
        }

        // Skip temporary white "erase" helper strokes when we've seen a cut
        // record; destination-out masking is authoritative and drawing white
        // strokes can produce hairlines.
        try {
          if (
            seenAnyCut &&
            drawing &&
            drawing.color &&
            typeof drawing.color === "string" &&
            drawing.color.toLowerCase() === "#ffffff"
          ) {
            continue;
          }
        } catch (e) { }

        // Draw the drawing normally
        offscreenContext.globalAlpha = 1.0;
        let viewingUser = null;
        let viewingPeriodStart = null;
        if (selectedUser) {
          if (typeof selectedUser === "string") viewingUser = selectedUser;
          else if (typeof selectedUser === "object") {
            viewingUser = selectedUser.user;
            viewingPeriodStart = selectedUser.periodStart;
          }
        }
        if (viewingUser && drawing.user !== viewingUser) {
          offscreenContext.globalAlpha = 0.1;
        } else if (viewingPeriodStart !== null) {
          const ts = drawing.timestamp || drawing.order || 0;
          if (
            ts < viewingPeriodStart ||
            ts >= viewingPeriodStart + 5 * 60 * 1000
          ) {
            offscreenContext.globalAlpha = 0.1;
          }
        }

        // CRITICAL: Check for stamps FIRST before checking pathData as array
        // Stamps have pathData as array but need special rendering
        if (drawing.drawingType === "stamp" && drawing.stampData && drawing.stampSettings && Array.isArray(drawing.pathData) && drawing.pathData.length > 0) {
          // Render stamp
          const stamp = drawing.stampData;
          const settings = drawing.stampSettings;
          const position = drawing.pathData[0]; // Stamps have a single position point

          console.log("[drawAllDrawings] Rendering stamp:", {
            drawingId: drawing.drawingId,
            stampData: stamp,
            stampSettings: settings,
            position: position,
            pathData: drawing.pathData,
            pathDataType: typeof drawing.pathData,
            pathDataIsArray: Array.isArray(drawing.pathData),
            pathDataLength: drawing.pathData.length
          });

          offscreenContext.save();
          offscreenContext.globalAlpha = (settings.opacity || 100) / 100;
          offscreenContext.translate(position.x, position.y);
          offscreenContext.rotate(((settings.rotation || 0) * Math.PI) / 180);

          const size = settings.size || 50;

          if (stamp.emoji) {
            offscreenContext.font = `${size}px serif`;
            offscreenContext.textAlign = "center";
            offscreenContext.textBaseline = "middle";
            offscreenContext.fillText(stamp.emoji, 0, 0);
            console.log("[drawAllDrawings] Rendered emoji stamp:", stamp.emoji);
          } else if (stamp.image) {
            const img = new Image();
            img.onload = () => {
              offscreenContext.drawImage(img, -size / 2, -size / 2, size, size);
              console.log("[drawAllDrawings] Rendered image stamp");
            };
            img.src = stamp.image;
          }

          offscreenContext.restore();
        } else if (drawing.drawingType === "stamp") {
          // Debug: Log why stamp is not being rendered
          console.warn("[drawAllDrawings] Stamp NOT rendered - missing requirements:", {
            drawingId: drawing.drawingId,
            drawingType: drawing.drawingType,
            hasStampData: !!drawing.stampData,
            hasStampSettings: !!drawing.stampSettings,
            pathDataIsArray: Array.isArray(drawing.pathData),
            pathDataLength: drawing.pathData ? drawing.pathData.length : 0,
            pathDataType: typeof drawing.pathData,
            pathDataValue: drawing.pathData,
            fullDrawing: drawing
          });
        } else if (Array.isArray(drawing.pathData)) {
          const pts = drawing.pathData;
          if (pts.length > 0) {
            // Check if this is an advanced brush drawing
            if (drawing.brushType && drawing.brushType !== "normal" && brushEngine) {
              console.log("Rendering advanced brush in drawAllDrawings:", {
                id: drawing.drawingId,
                brushType: drawing.brushType,
                pointCount: pts.length
              });

              // Use brush engine to render advanced brush strokes
              offscreenContext.save();
              brushEngine.updateContext(offscreenContext);

              // Start the stroke at the first point
              offscreenContext.beginPath();
              offscreenContext.moveTo(pts[0].x, pts[0].y);

              // Render the stroke using the brush engine with explicit brush type
              brushEngine.startStroke(pts[0].x, pts[0].y);
              for (let i = 1; i < pts.length; i++) {
                // Use drawWithType instead of draw to bypass state dependency
                brushEngine.drawWithType(
                  pts[i].x,
                  pts[i].y,
                  drawing.lineWidth,
                  drawing.color,
                  drawing.brushType  // Pass brush type directly
                );
              }
              offscreenContext.restore();
            } else {
              if (drawing.brushType && drawing.brushType !== "normal") {
                console.log("Advanced brush found but no brushEngine:", {
                  id: drawing.drawingId,
                  brushType: drawing.brushType,
                  hasBrushEngine: !!brushEngine
                });
              }
              // Default rendering for normal brush
              offscreenContext.beginPath();
              offscreenContext.moveTo(pts[0].x, pts[0].y);
              for (let i = 1; i < pts.length; i++)
                offscreenContext.lineTo(pts[i].x, pts[i].y);
              offscreenContext.strokeStyle = drawing.color;
              offscreenContext.lineWidth = drawing.lineWidth;
              offscreenContext.lineCap = drawing.brushStyle || "round";
              offscreenContext.lineJoin = drawing.brushStyle || "round";
              offscreenContext.stroke();
            }
          }
        } else if (drawing.pathData && drawing.pathData.tool === "shape") {
          if (drawing.pathData.points) {
            const pts = drawing.pathData.points;
            offscreenContext.save();
            offscreenContext.beginPath();
            offscreenContext.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++)
              offscreenContext.lineTo(pts[i].x, pts[i].y);
            offscreenContext.closePath();
            offscreenContext.fillStyle = drawing.color;
            offscreenContext.fill();
            offscreenContext.restore();
          } else {
            const {
              type,
              start,
              end,
              brushStyle: storedBrush,
            } = drawing.pathData;
            offscreenContext.save();
            offscreenContext.fillStyle = drawing.color;
            offscreenContext.lineWidth = drawing.lineWidth;
            if (type === "circle") {
              const radius = Math.sqrt(
                (end.x - start.x) ** 2 + (end.y - start.y) ** 2
              );
              offscreenContext.beginPath();
              offscreenContext.arc(start.x, start.y, radius, 0, Math.PI * 2);
              offscreenContext.fill();
            } else if (type === "rectangle") {
              offscreenContext.fillRect(
                start.x,
                start.y,
                end.x - start.x,
                end.y - start.y
              );
            } else if (type === "hexagon") {
              const radius = Math.sqrt(
                (end.x - start.x) ** 2 + (end.y - start.y) ** 2
              );
              offscreenContext.beginPath();
              for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i;
                const xPoint = start.x + radius * Math.cos(angle);
                const yPoint = start.y + radius * Math.sin(angle);
                if (i === 0) offscreenContext.moveTo(xPoint, yPoint);
                else offscreenContext.lineTo(xPoint, yPoint);
              }
              offscreenContext.closePath();
              offscreenContext.fill();
            } else if (type === "line") {
              offscreenContext.beginPath();
              offscreenContext.moveTo(start.x, start.y);
              offscreenContext.lineTo(end.x, end.y);
              offscreenContext.strokeStyle = drawing.color;
              offscreenContext.lineWidth = drawing.lineWidth;
              const cap = storedBrush || drawing.brushStyle || "round";
              offscreenContext.lineCap = cap;
              offscreenContext.lineJoin = cap;
              offscreenContext.stroke();
            }
            offscreenContext.restore();
          }
        } else if (drawing.pathData && drawing.pathData.tool === "image") {
          const { image, x, y, width, height } = drawing.pathData;
          let img = new Image();
          img.src = image;
          img.onload = () => {
            offscreenContext.drawImage(img, x, y, width, height);
          };
        }
      }
      if (!selectedUser) {
        // Group users by 5-minute intervals (periodStart in epoch ms).
        // Use both committed drawings and pending drawings so the UI's
        // user/time-group list reflects the strokes the user currently sees.
        const groupMap = {};
        const groupingSource = [
          ...(userData.drawings || []),
          ...(pendingDrawings || []),
        ];
        groupingSource.forEach((d) => {
          try {
            const ts = d.timestamp || d.order || 0;
            const periodStart =
              Math.floor(ts / (5 * 60 * 1000)) * (5 * 60 * 1000);
            if (!groupMap[periodStart]) groupMap[periodStart] = new Set();
            if (d.user) groupMap[periodStart].add(d.user);
          } catch (e) { }
        });
        const groups = Object.keys(groupMap).map((k) => ({
          periodStart: parseInt(k),
          users: Array.from(groupMap[k]),
        }));
        groups.sort((a, b) => b.periodStart - a.periodStart);
        if (selectedUser && selectedUser !== "") {
          let stillExists = false;
          if (typeof selectedUser === "string") {
            for (const g of groups) {
              if (g.users.includes(selectedUser)) {
                stillExists = true;
                break;
              }
            }
          } else if (typeof selectedUser === "object" && selectedUser.user) {
            for (const g of groups) {
              if (
                g.periodStart === selectedUser.periodStart &&
                g.users.includes(selectedUser.user)
              ) {
                stillExists = true;
                break;
              }
            }
          }

          if (!stillExists) {
            try {
              setSelectedUser("");
            } catch (e) {
              /* swallow if setter changed */
            }
          }
        }

        setUserList(groups);
      }

      // Copy offscreen canvas to visible canvas atomically (no flicker)
      console.log("[drawAllDrawings] Copying offscreen canvas to visible canvas. Total strokes rendered:", sortedDrawings.length);
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      context.drawImage(offscreenCanvasRef.current, 0, 0);
      console.log("[drawAllDrawings] Canvas update complete");
    } catch (e) {
      console.error("Error in drawAllDrawings:", e);
    } finally {
      // Restore current brush state
      if (brushEngine && savedBrushType) {
        brushEngine.setBrushType(savedBrushType);
        if (savedBrushParams) {
          brushEngine.setBrushParams(savedBrushParams);
        }
      }
      setIsLoading(false);
      isDrawingInProgressRef.current = false;
    }
  };

  const {
    selectionStart,
    setSelectionStart,
    selectionRect,
    setSelectionRect,
    cutImageData,
    setCutImageData,
    handleCutSelection,
  } = useCanvasSelection(
    canvasRef,
    currentUser,
    userData,
    generateId,
    drawAllDrawings,
    currentRoomId,
    setUndoAvailable,
    setRedoAvailable,
    auth,
    roomType
  );

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
    if (
      !cutImageData ||
      !Array.isArray(cutImageData) ||
      cutImageData.length === 0
    ) {
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

    let minX = Infinity,
      minY = Infinity;

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

    const newDrawings = cutImageData
      .map((originalDrawing) => {
        let newPathData;
        if (Array.isArray(originalDrawing.pathData)) {
          newPathData = originalDrawing.pathData.map((pt) => ({
            x: pt.x + offsetX,
            y: pt.y + offsetY,
          }));
        } else if (
          originalDrawing.pathData &&
          originalDrawing.pathData.tool === "shape"
        ) {
          if (
            originalDrawing.pathData.points &&
            Array.isArray(originalDrawing.pathData.points)
          ) {
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
            newPathData = {
              ...originalDrawing.pathData,
              start: newStart,
              end: newEnd,
            };
          }
        } else {
          return null;
        }

        // Preserve all metadata from original drawing
        const metadata = {
          brushStyle: originalDrawing.brushStyle,
          brushType: originalDrawing.brushType,
          brushParams: originalDrawing.brushParams,
          drawingType: originalDrawing.drawingType,
          stampData: originalDrawing.stampData,
          stampSettings: originalDrawing.stampSettings,
          filterType: originalDrawing.filterType,
          filterParams: originalDrawing.filterParams,
        };

        return new Drawing(
          generateId(),
          originalDrawing.color,
          originalDrawing.lineWidth,
          newPathData,
          Date.now(),
          currentUser,
          metadata
        );
      })
      .filter(Boolean);

    setIsRefreshing(true);
    setRedoStack([]);

    const pasteRecordId = generateId();
    console.log("[handlePaste] Starting paste operation:", {
      pasteRecordId,
      drawingCount: newDrawings.length,
      drawingTypes: newDrawings.map(d => d.drawingType || "stroke")
    });

    // Attach parentPasteId to each new drawing so the backend/read path can filter them
    for (const nd of newDrawings) {
      nd.roomId = currentRoomId;
      nd.parentPasteId = pasteRecordId;
      if (!nd.pathData) nd.pathData = {};
      nd.pathData.parentPasteId = pasteRecordId;
    }
    console.log("[handlePaste] Attached parentPasteId to all drawings:", pasteRecordId);

    // Submit all pasted drawings as replacement/child strokes but DO NOT add each to the undo stack
    for (const newDrawing of newDrawings) {
      try {
        userData.addDrawing(newDrawing);
        // skipUndoStack=true so these individual strokes don't create separate undo entries
        await submitToDatabase(
          newDrawing,
          auth,
          { roomId: currentRoomId, roomType, skipUndoStack: true },
          setUndoAvailable,
          setRedoAvailable
        );
        pastedDrawings.push(newDrawing);
      } catch (error) {
        console.error("Failed to save drawing:", newDrawing, error);
        handleAuthError(error);
      }
    }

    const pastedIds = pastedDrawings.map((d) => d.drawingId);
    const pasteRecord = new Drawing(
      pasteRecordId,
      "#FFFFFF",
      1,
      { tool: "paste", cut: false, pastedDrawingIds: pastedIds },
      Date.now(),
      currentUser
    );
    console.log("[handlePaste] Created paste record:", {
      pasteRecordId,
      pastedCount: pastedIds.length,
      pastedIds: pastedIds.join(',')
    });
    try {
      // Submit the single paste-record (counts as one backend undo operation)
      await submitToDatabase(
        pasteRecord,
        auth,
        { roomId: currentRoomId, roomType },
        setUndoAvailable,
        setRedoAvailable
      );
      console.log("[handlePaste] Paste record submitted successfully");
      setUndoStack((prev) => [
        ...prev,
        { type: "paste", pastedDrawings: pastedDrawings, backendCount: 1 },
      ]);
    } catch (error) {
      console.error("Failed to save paste record:", pasteRecord, error);
      showLocalSnack("Paste failed to persist. Some strokes may be missing.");
    }

    setIsRefreshing(false);

    // Update undo/redo availability after paste operations
    if (currentRoomId) {
      checkUndoRedoAvailability(
        auth,
        setUndoAvailable,
        setRedoAvailable,
        currentRoomId
      );
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
    try {
      if (sourceLabel)
        console.debug("[mergedRefreshCanvas] called from:", sourceLabel);
      else console.debug("[mergedRefreshCanvas] called");
    } catch (e) { }
    // If currently panning, defer refresh until pan ends to avoid races and frequent backend calls.
    try {
      if (isPanning) {
        console.debug(
          "[mergedRefreshCanvas] deferring because isPanning=true, marking pendingPanRefreshRef"
        );
        pendingPanRefreshRef.current = true;
        return;
      }
    } catch (e) { }

    // CRITICAL: For undo/redo events, force a complete state reset
    if (sourceLabel === "undo-event" || sourceLabel === "redo-event") {
      console.log("[mergedRefreshCanvas] Forcing complete state reset for undo/redo");
      lastDrawnStateRef.current = null;
    }

    setIsLoading(true);
    const backendCount = await backendRefreshCanvas(
      serverCountRef.current,
      userData,
      drawAllDrawings,
      historyRange ? historyRange.start : undefined,
      historyRange ? historyRange.end : undefined,
      {
        roomId: currentRoomId,
        auth,
        clearLastDrawnState: () => {
          console.log("[mergedRefreshCanvas] Clearing lastDrawnStateRef to force redraw");
          lastDrawnStateRef.current = null;
        }
      }
    );

    const pendingSnapshot = [...pendingDrawings];

    // Don't clear all pending drawings, only mark confirmed ones for removal

    serverCountRef.current = backendCount;
    // Re-append any pending drawings that the backend didn't return.
    const drawingMatches = (a, b) => {
      if (!a || !b) return false;
      if (a.drawingId && b.drawingId && a.drawingId === b.drawingId)
        return true;

      try {
        const sameUser = a.user === b.user;
        const tsA = a.timestamp || a.ts || 0;
        const tsB = b.timestamp || b.ts || 0;
        const tsClose = Math.abs(tsA - tsB) < 1000;
        const lenA = Array.isArray(a.pathData)
          ? a.pathData.length
          : a.pathData && a.pathData.points
            ? a.pathData.points.length
            : 0;
        const lenB = Array.isArray(b.pathData)
          ? b.pathData.length
          : b.pathData && b.pathData.points
            ? b.pathData.points.length
            : 0;
        const lenClose = Math.abs(lenA - lenB) <= 1;
        return sameUser && tsClose && lenClose;
      } catch (e) {
        return false;
      }
    };

    try {
      const cutOriginalIds = new Set();
      (userData.drawings || []).forEach((d) => {
        if (
          d.pathData &&
          d.pathData.tool === "cut" &&
          Array.isArray(d.pathData.originalStrokeIds)
        ) {
          d.pathData.originalStrokeIds.forEach((id) => cutOriginalIds.add(id));
        }
      });

      if (cutOriginalIds.size > 0) {
        userData.drawings = (userData.drawings || []).filter(
          (d) => !cutOriginalIds.has(d.drawingId)
        );
      }
    } catch (e) {
      // best-effort
    }

    // Re-append pending drawings that the backend didn't return, but
    // skip any pending items older than the authoritative clearedAt timestamp
    const clearedAt = currentRoomId
      ? roomClearedAtRef.current[currentRoomId]
      : null;
    const stillPending = [];

    pendingSnapshot.forEach((pd) => {
      try {
        const pdTs = pd.timestamp || pd.ts || 0;
        if (clearedAt && pdTs < clearedAt) {
          // This pending drawing was created before a server clear; ignore it
          return;
        }
      } catch (e) { }

      const exists = userData.drawings.find((d) => drawingMatches(d, pd));
      if (!exists) {
        // Backend doesn't have it yet, keep it pending
        userData.drawings.push(pd);
        stillPending.push(pd);
      } else {
        // Backend has it, mark as confirmed and remove from pending
        if (pd.drawingId) {
          confirmedStrokesRef.current.add(pd.drawingId);
        }
      }
    });

    // Update pending drawings to only include those still not confirmed by backend
    setPendingDrawings(stillPending);

    // Use requestAnimationFrame for smoother rendering
    requestAnimationFrame(() => {
      drawAllDrawings();
      setIsLoading(false);
    });
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
        console.debug(
          `[pan] now=${now} lastRefresh=${panLastRefreshRef.current} diff=${diff} cooldown=${PAN_REFRESH_COOLDOWN_MS}`
        );
        if (diff > PAN_REFRESH_COOLDOWN_MS) {
          panLastRefreshRef.current = now;
          console.debug("[pan] triggering immediate mergedRefreshCanvas");
          mergedRefreshCanvas("pan-start").finally(() => setIsLoading(false));
        } else {
          // Mark that we skipped the immediate refresh and schedule a deferred refresh on mouseup
          panRefreshSkippedRef.current = true;
          console.debug(
            "[pan] skipped immediate refresh; scheduling deferred refresh on mouseup"
          );
          if (panEndRefreshTimerRef.current)
            clearTimeout(panEndRefreshTimerRef.current);
          panEndRefreshTimerRef.current = setTimeout(() => {
            if (panRefreshSkippedRef.current) {
              panRefreshSkippedRef.current = false;
              panLastRefreshRef.current = Date.now();
              console.debug("[pan] deferred timer firing mergedRefreshCanvas");
              mergedRefreshCanvas("pan-deferred").finally(() =>
                setIsLoading(false)
              );
            }
            panEndRefreshTimerRef.current = null;
          }, Math.max(200, PAN_REFRESH_COOLDOWN_MS - diff));
          setIsLoading(false);
        }
      } catch (e) {
        mergedRefreshCanvas().finally(() => setIsLoading(false));
      }
      return;
    }

    if (!editingEnabled) return;

    if (drawMode === "eraser" || drawMode === "freehand") {
      const context = canvas.getContext("2d");
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.lineCap = brushStyle;
      context.lineJoin = brushStyle;

      // Initialize brush engine for advanced brushes
      if (brushEngine) {
        brushEngine.updateContext(context);
        brushEngine.startStroke(x, y);

        // For normal brush, we still need the standard path setup
        if (currentBrushType === "normal") {
          context.beginPath();
          context.moveTo(x, y);
        }
      } else {
        // Fallback if no brush engine
        context.beginPath();
        context.moveTo(x, y);
      }

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
    } else if (drawMode === "stamp") {
      // Place stamp on mousedown
      if (selectedStamp && stampSettings) {
        placeStamp(x, y, selectedStamp, stampSettings);
      }
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
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;

    // Calculate minimum allowed offsets so that the canvas edge is not exceeded.
    // Our canvas is fixed at canvasWidth and canvasHeight.
    const minX = containerWidth - canvasWidth; // This will be negative if canvasWidth > containerWidth
    const minY = containerHeight - canvasHeight;

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

    console.log(
      "Drawing with brush type:",
      currentBrushType,
      "drawMode:",
      drawMode
    );

    if (drawMode === "eraser" || drawMode === "freehand") {
      const context = canvas.getContext("2d");

      // Use advanced brush engine if available
      if (brushEngine && currentBrushType !== "normal") {
        console.log("Drawing with advanced brush engine:", currentBrushType);
        // Ensure context is up to date
        brushEngine.updateContext(context);

        // Ensure brush engine has current state
        if (brushEngine.brushType !== currentBrushType) {
          brushEngine.setBrushType(currentBrushType);
        }
        if (
          JSON.stringify(brushEngine.brushParams) !==
          JSON.stringify(brushParams)
        ) {
          brushEngine.setBrushParams(brushParams);
        }

        brushEngine.draw(x, y, lineWidth, color);
      } else {
        console.log("Drawing with normal brush");
        // Default drawing behavior
        context.lineTo(x, y);
        context.stroke();
        context.beginPath();
        context.moveTo(x, y);
      }

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
        `drawing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        color,
        lineWidth,
        tempPathRef.current,
        Date.now(),
        currentUser,
        {
          brushStyle: brushStyle,
          brushType: currentBrushType,
          brushParams: brushParams,
          drawingType: "stroke",
        }
      );
      newDrawing.roomId = currentRoomId;
      newDrawing.brushType = currentBrushType;
      newDrawing.brushParams = brushParams;

      setUndoStack((prev) => [...prev, newDrawing]);
      setRedoStack([]);

      try {
        userData.addDrawing(newDrawing);
        // Add to pending drawings for immediate display (optimistic UI)
        setPendingDrawings((prev) => [...prev, newDrawing]);

        // Use requestAnimationFrame for immediate, smooth redraw
        requestAnimationFrame(() => {
          drawAllDrawings();
        });

        // Queue the submission instead of submitting immediately
        const submitTask = async () => {
          try {
            console.log("Submitting queued stroke:", {
              drawingId: newDrawing.drawingId,
              pathLength: tempPathRef.current.length,
            });

            await submitToDatabase(
              newDrawing,
              auth,
              {
                roomId: currentRoomId,
                roomType,
              },
              setUndoAvailable,
              setRedoAvailable
            );

            // Don't remove from pending here - let mergedRefreshCanvas or socket confirmation handle it

            if (currentRoomId) {
              checkUndoRedoAvailability(
                auth,
                setUndoAvailable,
                setRedoAvailable,
                currentRoomId
              );
            }
          } catch (error) {
            console.error("Error during queued freehand submission:", error);
            // On error, remove the failed stroke from pending
            setPendingDrawings((prev) =>
              prev.filter((d) => d.drawingId !== newDrawing.drawingId)
            );
            handleAuthError(error);
          }
        };

        submissionQueueRef.current.push(submitTask);
        processSubmissionQueue();
      } catch (error) {
        console.error("Error preparing freehand stroke:", error);
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
        const radius = Math.sqrt(
          (finalEnd.x - shapeStart.x) ** 2 + (finalEnd.y - shapeStart.y) ** 2
        );

        context.beginPath();
        context.arc(shapeStart.x, shapeStart.y, radius, 0, Math.PI * 2);
        context.fill();
      } else if (shapeType === "rectangle") {
        context.fillRect(
          shapeStart.x,
          shapeStart.y,
          finalEnd.x - shapeStart.x,
          finalEnd.y - shapeStart.y
        );
      } else if (shapeType === "hexagon") {
        const radius = Math.sqrt(
          (finalEnd.x - shapeStart.x) ** 2 + (finalEnd.y - shapeStart.y) ** 2
        );
        context.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
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
        brushStyle: shapeType === "line" ? brushStyle : undefined,
      };

      const newDrawing = new Drawing(
        `drawing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        color,
        lineWidth,
        shapeDrawingData,
        Date.now(),
        currentUser,
        {
          brushStyle: shapeType === "line" ? brushStyle : "round",
          brushType: currentBrushType,
          brushParams: brushParams,
          drawingType: "shape",
        }
      );
      newDrawing.roomId = currentRoomId;

      userData.addDrawing(newDrawing);
      setPendingDrawings((prev) => [...prev, newDrawing]);

      // Use requestAnimationFrame for smooth shape rendering
      requestAnimationFrame(() => {
        drawAllDrawings();
      });

      setUndoStack((prev) => [...prev, newDrawing]);
      setRedoStack([]);

      // Queue the submission
      const submitTask = async () => {
        try {
          await submitToDatabase(
            newDrawing,
            auth,
            {
              roomId: currentRoomId,
              roomType,
            },
            setUndoAvailable,
            setRedoAvailable
          );

          // Don't remove from pending here - let mergedRefreshCanvas or socket confirmation handle it

          // Update undo/redo availability after shape submission
          if (currentRoomId) {
            checkUndoRedoAvailability(
              auth,
              setUndoAvailable,
              setRedoAvailable,
              currentRoomId
            );
          }
        } catch (error) {
          console.error("Error during queued shape submission:", error);
          // On error, remove the failed stroke from pending
          setPendingDrawings((prev) =>
            prev.filter((d) => d.drawingId !== newDrawing.drawingId)
          );
          handleAuthError(error);
        }
      };

      submissionQueueRef.current.push(submitTask);
      processSubmissionQueue();

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
    setSelectedUser("");
    setHistoryDialogOpen(true);
  };

  const handleApplyHistory = async (startMs, endMs) => {
    // startMs and endMs are epoch ms. If not provided, read from inputs.
    const start =
      startMs !== undefined
        ? startMs
        : historyStartInput
          ? new Date(historyStartInput).getTime()
          : NaN;
    const end =
      endMs !== undefined
        ? endMs
        : historyEndInput
          ? new Date(historyEndInput).getTime()
          : NaN;

    if (isNaN(start) || isNaN(end)) {
      showLocalSnack(
        "Please select both start and end date/time before applying History Recall."
      );
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
      const backendCount = await backendRefreshCanvas(
        serverCountRef.current,
        userData,
        drawAllDrawings,
        start,
        end,
        { roomId: currentRoomId, auth }
      );
      serverCountRef.current = backendCount;
      // If no drawings loaded, inform user and rollback historyRange
      if (!userData.drawings || userData.drawings.length === 0) {
        setHistoryRange(null);
        showLocalSnack(
          "No drawings were found in that date/time range. Please select another range or exit history recall mode."
        );
        return;
      }
      setHistoryMode(true);
      setHistoryDialogOpen(false);
    } catch (e) {
      console.error("Error applying history range:", e);
      setHistoryRange(null);
      showLocalSnack(
        "An error occurred while loading history. See console for details."
      );
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
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          ctx.clearRect(
            0,
            0,
            canvasRef.current.width,
            canvasRef.current.height
          );
        }
        drawAllDrawings();
      }
    } catch { }

    // reload for the new room
    (async () => {
      try {
        await mergedRefreshCanvas(); // already room-aware
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
      serverCountRef.current = await backendRefreshCanvas(
        serverCountRef.current,
        userData,
        drawAllDrawings,
        undefined,
        undefined,
        { roomId: currentRoomId, auth }
      );
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
    if (!canvas) return; // Guard against null ref during tests

    const context = canvas.getContext("2d");
    if (!context) return; // Guard against null context during tests

    context.clearRect(0, 0, canvasWidth, canvasHeight);
    setUserData(initializeUserData());
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
      // Force full refresh from backend by clearing local state
      userData.drawings = [];
      setPendingDrawings([]);
      serverCountRef.current = 0;
      lastDrawnStateRef.current = null;

      await clearCanvasForRefresh();
      await mergedRefreshCanvas("refresh-button");
      await drawAllDrawings();
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
      showLocalSnack(
        "Please wait for the canvas to refresh before undoing again."
      );
      return;
    }
    try {
      await undoAction({
        auth,
        currentUser: auth?.username || "anonymous",
        undoStack,
        setUndoStack,
        setRedoStack,
        userData,
        drawAllDrawings,
        refreshCanvasButtonHandler: refreshCanvasButtonHandler,
        roomId: currentRoomId,
      });
      // After undo completes, refresh undo/redo availability from server
      try {
        await checkUndoRedoAvailability(
          auth,
          setUndoAvailable,
          setRedoAvailable,
          currentRoomId
        );
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
      showLocalSnack(
        "Please wait for the canvas to refresh before redoing again."
      );
      return;
    }
    try {
      await redoAction({
        auth,
        currentUser: auth?.username || "anonymous",
        redoStack,
        setRedoStack,
        setUndoStack,
        userData,
        drawAllDrawings,
        refreshCanvasButtonHandler: refreshCanvasButtonHandler,
        roomId: currentRoomId,
      });
      // After redo completes, refresh undo/redo availability from server
      try {
        await checkUndoRedoAvailability(
          auth,
          setUndoAvailable,
          setRedoAvailable,
          currentRoomId
        );
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
    setUndoAvailable(undoStack.length > 0);
    setRedoAvailable(redoStack.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoStack, redoStack]);

  const [showToolbar, setShowToolbar] = useState(true);
  const [hoverToolbar, setHoverToolbar] = useState(false);

  return (
    <div className="Canvas-wrapper" style={{ pointerEvents: "auto" }}>
      {/* Top header: room name + optional history range + exit button */}
      <Box
        sx={{
          position: "absolute",
          top: 8,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 2100,
          bgcolor: "background.paper",
          px: 2,
          py: 0.5,
          borderRadius: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 1,
          boxShadow: "0 6px 14px rgba(0,0,0,0.12)",
          border: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
          {currentRoomName || "Master (not in a room)"}
        </Typography>

        {historyMode && historyRange && (
          <Typography variant="caption" sx={{ whiteSpace: "nowrap", ml: 1 }}>
            {new Date(historyRange.start).toLocaleString()} —{" "}
            {new Date(historyRange.end).toLocaleString()}
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
                setHistoryStartInput("");
                setHistoryEndInput("");
                setSelectedUser("");
              } catch (e) {
                /* swallow if state setters changed */
              }
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
            position: "absolute",
            top: 56,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2200,
            pointerEvents: "none",
          }}
        >
          <Paper
            elevation={6}
            sx={{
              px: 2,
              py: 0.5,
              bgcolor: "rgba(33,33,33,0.86)",
              color: "white",
              borderRadius: 1,
            }}
          >
            <Typography
              variant="caption"
              sx={{ fontWeight: "bold", letterSpacing: 0.5 }}
            >
              Archived — View Only
            </Typography>
            {/* Owner-only destructive delete button placed under the banner */}
            {isOwner && (
              <Box sx={{ mt: 1, display: "flex", justifyContent: "center" }}>
                <Button
                  size="small"
                  color="error"
                  variant="contained"
                  onClick={() => setConfirmDestructiveOpen(true)}
                  sx={{ pointerEvents: "all" }}
                >
                  Delete permanently
                </Button>
              </Box>
            )}
          </Paper>
        </Box>
      )}

      {/* Wallet disconnected banner - visible when secure room wallet is not connected */}
      {roomType === "secure" && !walletConnected && (
        <Box
          sx={{
            position: "absolute",
            top: 56,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2200,
            pointerEvents: "none",
          }}
        >
          <Paper
            elevation={6}
            sx={{
              px: 2,
              py: 0.5,
              bgcolor: "rgba(255, 152, 0, 0.9)",
              color: "white",
              borderRadius: 1,
            }}
          >
            <Typography
              variant="caption"
              sx={{ fontWeight: "bold", letterSpacing: 0.5 }}
            >
              ⚠ Wallet Not Connected — Canvas Locked
            </Typography>
          </Paper>
        </Box>
      )}

      {/* Confirm Destructive Delete dialog (owner-only) */}
      <Dialog
        open={confirmDestructiveOpen}
        onClose={() => {
          setConfirmDestructiveOpen(false);
          setDestructiveConfirmText("");
        }}
      >
        <DialogTitle>Permanently delete room</DialogTitle>
        <DialogContent>
          <DialogContentText color="error">
            This will permanently delete this room and all its data for every
            user. This action is irreversible.
          </DialogContentText>
          <DialogContentText sx={{ mt: 1 }}>
            To confirm, type <strong>DELETE</strong> below.
          </DialogContentText>
          <TextField
            fullWidth
            value={destructiveConfirmText}
            onChange={(e) => setDestructiveConfirmText(e.target.value)}
            placeholder="Type DELETE to confirm"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setConfirmDestructiveOpen(false);
              setDestructiveConfirmText("");
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={destructiveConfirmText !== "DELETE"}
            onClick={async () => {
              try {
                const { deleteRoom } = await import("../api/rooms");
                await deleteRoom(auth.token, currentRoomId);
                setLocalSnack({
                  open: true,
                  message: "Room permanently deleted",
                  duration: 4000,
                });
                // After Delete, navigate back to dashboard
                try {
                  onExitRoom();
                } catch (e) { }
              } catch (e) {
                console.error("Permanent delete failed", e);
                setLocalSnack({
                  open: true,
                  message: "Failed to delete room: " + (e?.message || e),
                  duration: 4000,
                });
              } finally {
                setConfirmDestructiveOpen(false);
                setDestructiveConfirmText("");
              }
            }}
          >
            Delete permanently
          </Button>
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
          position: "absolute",
          top: "50%",
          transform: "translateY(-50%)",
          left: showToolbar ? 0 : -100,
          width: 100,
          transition: "left 0.3s ease",
          pointerEvents: "all",
          zIndex: 1000,
        }}
        onMouseEnter={() => setHoverToolbar(true)}
        onMouseLeave={() => setHoverToolbar(false)}
      >
        <Box
          onClick={() => setShowToolbar((v) => !v)}
          sx={{
            position: "absolute",
            right: showToolbar ? 0 : -20,
            top: "50%",
            transform: "translateY(-50%)",

            width: 20,
            height: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            opacity: hoverToolbar ? 1 : 0,
            transition: "opacity 0.2s",
            bgcolor: "rgba(0,0,0,0.2)",
            cursor: "pointer",
            zIndex: 1001,
          }}
        >
          <IconButton size="small" sx={{ p: 0, color: "white" }}>
            {showToolbar ? (
              <ChevronLeftIcon fontSize="small" />
            ) : (
              <ChevronRightIcon fontSize="small" />
            )}
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
              setUndoStack((prev) => [...prev, result.compositeCutAction]);
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
          /* Advanced brush/stamp/filter props */
          currentBrushType={currentBrushType}
          onBrushSelect={handleBrushSelect}
          onBrushParamsChange={handleBrushParamsChange}
          selectedStamp={selectedStamp}
          onStampSelect={handleStampSelect}
          onStampChange={handleStampChange}
          onFilterApply={applyFilter}
          onFilterPreview={previewFilter}
          onFilterUndo={undoFilter}
          canUndoFilter={!!originalCanvasDataRef.current}
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
        <DialogTitle id="history-recall-dialog">
          History Recall - Select Date/Time Range
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Choose a start and end date/time to recall drawings from
            ResilientDB. Only drawings within the selected range will be loaded.
          </DialogContentText>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
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
          <Button
            onClick={() => {
              setHistoryDialogOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              const start = historyStartInput
                ? new Date(historyStartInput).getTime()
                : NaN;
              const end = historyEndInput
                ? new Date(historyEndInput).getTime()
                : NaN;
              await handleApplyHistory(start, end);
            }}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>

      <Fade
        in={Boolean(historyMode || (selectedUser && selectedUser !== ""))}
        timeout={300}
      >
        <Paper
          elevation={6}
          sx={{
            position: "fixed",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2000,
            bgcolor: "background.paper",
            px: 2,
            py: 0.6,
            display: "flex",
            alignItems: "center",
            gap: 1,
            borderRadius: 1.5,
          }}
        >
          <InfoOutlinedIcon fontSize="small" />
          <Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>
            {historyMode
              ? "History Mode Enabled — Canvas Editing Disabled"
              : selectedUser && selectedUser !== ""
                ? "Viewing Past Drawing History of Selected User — Canvas Editing Disabled"
                : ""}
          </Typography>
        </Paper>
      </Fade>

      {/* Loading overlay: fades in/out while drawings load */}
      <Fade in={Boolean(isLoading)} timeout={300}>
        <Paper
          elevation={6}
          sx={{
            position: "absolute",
            left: "50%",
            top: "12%",
            transform: "translateX(-50%)",
            padding: "8px 12px",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
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
          <Button onClick={() => setClearDialogOpen(false)} color="primary">
            No
          </Button>
          <Button
            onClick={async () => {
              // Immediate local clear for responsiveness
              await clearCanvas();
              try {
                const resp = await clearBackendCanvas({
                  roomId: currentRoomId,
                  auth,
                });
                // If backend returned a clearedAt timestamp, use it as authoritative
                if (resp && resp.clearedAt && currentRoomId) {
                  roomClearedAtRef.current[currentRoomId] = resp.clearedAt;
                }
              } catch (e) {
                console.error("Failed to clear backend:", e);
              }
              // Update undo/redo availability after clear
              try {
                await checkUndoRedoAvailability(
                  auth,
                  setUndoAvailable,
                  setRedoAvailable,
                  currentRoomId
                );
              } catch (e) { }
              setUserList([]);
              try {
                setSelectedUser("");
              } catch (e) {
                /* ignore if setter missing */
              }
              setClearDialogOpen(false);
            }}
            color="primary"
            autoFocus
          >
            Yes
          </Button>
        </DialogActions>
      </Dialog>
      <SafeSnackbar
        open={localSnack.open}
        message={localSnack.message}
        autoHideDuration={localSnack.duration}
        onClose={closeLocalSnack}
      />
    </div>
  );
}

export default Canvas;
