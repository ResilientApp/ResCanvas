import { useState, useRef, useEffect } from 'react';

export const DEFAULT_CANVAS_WIDTH = 3000;
export const DEFAULT_CANVAS_HEIGHT = 2000;

export function useCanvasState(currentRoomId) {
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
  const [pendingDrawings, setPendingDrawings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [localSnack, setLocalSnack] = useState({ open: false, message: '', duration: 4000 });

  const roomUiRef = useRef({});
  const roomStacksRef = useRef({});
  const roomClipboardRef = useRef({});
  const roomClearedAtRef = useRef({});
  const tempPathRef = useRef([]);
  const serverCountRef = useRef(0);

  const showLocalSnack = (msg, duration = 4000) =>
    setLocalSnack({ open: true, message: String(msg), duration });

  const closeLocalSnack = () =>
    setLocalSnack({ open: false, message: '', duration: 4000 });

  useEffect(() => {
    if (!currentRoomId) return;
    const ui = roomUiRef.current[currentRoomId] ||
      JSON.parse(localStorage.getItem(`rescanvas:toolbar:${currentRoomId}`) || "null") || {};
    if (ui.color) setColor(ui.color);
    if (ui.lineWidth) setLineWidth(ui.lineWidth);
    if (ui.drawMode) setDrawMode(ui.drawMode);
    if (ui.shapeType) setShapeType(ui.shapeType);
    roomUiRef.current[currentRoomId] = {
      color: ui.color ?? color,
      lineWidth: ui.lineWidth ?? lineWidth,
      drawMode: ui.drawMode ?? drawMode,
      shapeType: ui.shapeType ?? shapeType
    };

    const stacks = roomStacksRef.current[currentRoomId] || { undo: [], redo: [] };
    setUndoStack(stacks.undo);
    setRedoStack(stacks.redo);
  }, [currentRoomId]);

  useEffect(() => {
    if (!currentRoomId) return;
    const ui = { color, lineWidth, drawMode, shapeType };
    roomUiRef.current[currentRoomId] = ui;
    try {
      localStorage.setItem(`rescanvas:toolbar:${currentRoomId}`, JSON.stringify(ui));
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
    setUndoAvailable(undoStack.length > 0);
    setRedoAvailable(redoStack.length > 0);
  }, [undoStack, redoStack]);

  return {
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
    roomUiRef,
    roomStacksRef,
    roomClipboardRef,
    roomClearedAtRef,
    tempPathRef,
    serverCountRef
  };
}
