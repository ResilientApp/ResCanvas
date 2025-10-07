// JWT-based canvas backend operations for room-based drawing
import { getRoomStrokes, postRoomStroke, clearRoomCanvas, undoRoomAction, redoRoomAction, getUndoRedoStatus } from '../api/rooms';
import { getAuthToken } from '../utils/authUtils';
import { getUsername } from '../utils/getUsername';
import notify from '../utils/notify';

import { API_BASE } from '../config/apiConfig';

// Submit a drawing stroke to the room-based API
export const submitToDatabase = async (drawing, auth, options = {}, setUndoAvailable, setRedoAvailable) => {
  const token = auth?.token || getAuthToken();
  if (!token || !options.roomId) {
    console.error('submitToDatabase: Missing auth token or roomId');
    return;
  }

  try {
    let username = null;
    try { username = getUsername(auth); } catch (e) { username = null; }
    if (!username) username = 'Unknown';

    const strokeData = {
      drawingId: drawing.drawingId,
      color: drawing.color,
      lineWidth: drawing.lineWidth,
      pathData: drawing.pathData,
      timestamp: drawing.timestamp,
      user: username,
      roomId: options.roomId,
      skipUndoStack: options.skipUndoStack || false
    };

    if (drawing.parentPasteId) {
      strokeData.parentPasteId = drawing.parentPasteId;
    } else if (drawing.pathData && drawing.pathData.parentPasteId) {
      strokeData.parentPasteId = drawing.pathData.parentPasteId;
    }

    await postRoomStroke(token, options.roomId, strokeData, null, null);

    if (!options.skipUndoCheck && setUndoAvailable && setRedoAvailable) {
      await checkUndoRedoAvailability({ token }, setUndoAvailable, setRedoAvailable, options.roomId);
    }
  } catch (error) {
    console.error('Error submitting stroke:', error);
    throw error;
  }
};

export const refreshCanvas = async (currentCount, userData, drawAllDrawings, startTime, endTime, options = {}) => {
  const token = options.auth?.token || getAuthToken();
  if (!token || !options.roomId) {
    console.warn('refreshCanvas: Missing auth token or roomId');
    return 0;
  }

  try {
    const strokes = await getRoomStrokes(token, options.roomId, { start: startTime, end: endTime });

    const backendDrawings = strokes.map(stroke => ({
      drawingId: stroke.drawingId || `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      color: stroke.color || '#000000',
      lineWidth: stroke.lineWidth || 5,
      pathData: stroke.pathData || [],
      timestamp: stroke.timestamp || Date.now(),
      user: stroke.user || '',
      order: stroke.order || stroke.timestamp || 0,
      roomId: stroke.roomId || options.roomId
    }));

    const filteredDrawings = backendDrawings.filter(drawing => {
      if (startTime && drawing.timestamp < startTime) return false;
      if (endTime && drawing.timestamp > endTime) return false;
      return true;
    });

    filteredDrawings.sort((a, b) => (a.order || a.timestamp) - (b.order || b.timestamp));

    userData.drawings = filteredDrawings;

    drawAllDrawings();
    return userData.drawings.length;
  } catch (error) {
    console.error('Error refreshing canvas:', error);
    return userData.drawings ? userData.drawings.length : 0;
  }
};

export const clearBackendCanvas = async (options = {}) => {
  const token = options.auth?.token || getAuthToken();
  if (!token || !options.roomId) {
    console.warn('clearBackendCanvas: Missing auth token or roomId');
    return;
  }

  try {
    console.log('Clear canvas requested for room:', options.roomId);
    const result = await clearRoomCanvas(token, options.roomId);
    console.log('Canvas cleared successfully', result);
    return result;
  } catch (error) {
    console.error('Error clearing canvas:', error);
    throw error;
  }
};

let undoRedoInProgress = false;

export const undoAction = async ({
  auth,
  currentUser,
  undoStack,
  setUndoStack,
  setRedoStack,
  userData,
  drawAllDrawings,
  refreshCanvasButtonHandler,
  checkUndoRedoAvailability,
  roomId
}) => {
  if (undoStack.length === 0) return;
  if (undoRedoInProgress) { console.log('UNDO DEBUG: Another undo/redo is in progress, skipping'); return; }
  undoRedoInProgress = true;
  try {
    const lastAction = undoStack[undoStack.length - 1];
    let shouldRefreshFromBackend = false;
    try {
      if (lastAction.type === 'cut') {
        userData.drawings = userData.drawings.filter(drawing => {
          if (drawing.drawingId === lastAction.cutRecord.drawingId) return false;
          for (const repArr of Object.values(lastAction.replacementSegments)) {
            if (repArr.some(rep => rep.drawingId === drawing.drawingId)) {
              return false;
            }
          }
          return true;
        });
        lastAction.affectedDrawings.forEach(original => { userData.drawings.push(original); });
        drawAllDrawings();
        const result = await undoRoomAction(auth.token, roomId);
        if (result.status === "ok" || result.status === "success") { shouldRefreshFromBackend = true; }
      } else if (lastAction.type === 'paste') {
        for (let i = 0; i < lastAction.backendCount; i++) {
          const result = await undoRoomAction(auth.token, roomId);
          if (result.status === "ok" || result.status === "success") { shouldRefreshFromBackend = true; }
        }
        userData.drawings = userData.drawings.filter(drawing =>
          !lastAction.pastedDrawings.some(pasted => pasted.drawingId === drawing.drawingId)
        );
        drawAllDrawings();
      } else {
        userData.drawings = userData.drawings.filter((drawing) => drawing.drawingId !== lastAction.drawingId);
        drawAllDrawings();
        const result = await undoRoomAction(auth.token, roomId);
        if (result.status === "noop") { shouldRefreshFromBackend = false; }
        else if (result.status === "ok" || result.status === "success") { shouldRefreshFromBackend = true; }
        else { userData.drawings.push(lastAction); drawAllDrawings(); shouldRefreshFromBackend = false; }
      }
      const newUndoStack = undoStack.slice(0, undoStack.length - 1);
      setUndoStack(newUndoStack);
      setRedoStack(prev => [...prev, lastAction]);
    } catch (error) {
      console.error('Undo error:', error);
      setUndoStack([]);
      setRedoStack([]);
      notify("Undo failed due to local cache being cleared out.");
    } finally {
      undoRedoInProgress = false;
      refreshCanvasButtonHandler();
      if (checkUndoRedoAvailability) { checkUndoRedoAvailability(); }
    }
  } catch (error) { console.error('Undo outer error:', error); undoRedoInProgress = false; }
};

export const redoAction = async ({
  auth,
  currentUser,
  redoStack,
  setRedoStack,
  setUndoStack,
  userData,
  drawAllDrawings,
  refreshCanvasButtonHandler,
  checkUndoRedoAvailability,
  roomId
}) => {
  if (redoStack.length === 0) return;
  if (undoRedoInProgress) { console.log('REDO DEBUG: Another undo/redo is in progress, skipping'); return; }
  undoRedoInProgress = true;
  try {
    const lastUndone = redoStack[redoStack.length - 1];
    try {
      if (lastUndone.type === 'cut') {
        lastUndone.affectedDrawings.forEach(original => {
          userData.drawings = userData.drawings.filter(drawing => drawing.drawingId !== original.drawingId);
        });
        Object.values(lastUndone.replacementSegments).forEach(segments => { segments.forEach(seg => { userData.drawings.push(seg); }); });
        userData.addDrawing(lastUndone.cutRecord);
        drawAllDrawings();
        const result = await redoRoomAction(auth.token, roomId);
      } else if (lastUndone.type === 'paste') {
        for (let i = 0; i < lastUndone.backendCount; i++) { const result = await redoRoomAction(auth.token, roomId); }
        lastUndone.pastedDrawings.forEach(pd => { userData.drawings.push(pd); });
        drawAllDrawings();
      } else {
        userData.drawings.push(lastUndone);
        drawAllDrawings();
        const result = await redoRoomAction(auth.token, roomId);
        if (result.status === "noop") { setRedoStack([]); setUndoStack([]); notify("Redo failed due to local cache being cleared out."); return; }
      }
      const newRedoStack = redoStack.slice(0, redoStack.length - 1);
      setRedoStack(newRedoStack);
      setUndoStack(prev => [...prev, lastUndone]);
    } catch (error) { console.error("Error during redo:", error); }
    finally { undoRedoInProgress = false; refreshCanvasButtonHandler(); if (checkUndoRedoAvailability) { checkUndoRedoAvailability(); } }
  } catch (error) { console.error('Redo outer error:', error); undoRedoInProgress = false; }
};
