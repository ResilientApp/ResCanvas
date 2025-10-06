// JWT-based canvas backend operations for room-based drawing
import { getRoomStrokes, postRoomStroke, clearRoomCanvas, undoRoomAction, redoRoomAction, getUndoRedoStatus } from './api/rooms';
import { getAuthToken } from './utils/authUtils';
import { getUsername } from './utils/getUsername';
import notify from './utils/notify';

import { API_BASE } from './config/apiConfig';

// Submit a drawing stroke to the room-based API
export const submitToDatabase = async (drawing, auth, options = {}, setUndoAvailable, setRedoAvailable) => {
  const token = auth?.token || getAuthToken();
  if (!token || !options.roomId) {
    console.error('submitToDatabase: Missing auth token or roomId');
    return;
  }

  try {
    // Resolve a safe username for the stroke. The app can be in a transient
    // state where auth.token exists but auth.user is null (for example when
    // a refresh returned only a token). Avoid throwing in that case by
    // attempting a few fallbacks: auth.user, localStorage 'auth', or decode
    // the JWT payload. Final fallback is the literal 'Unknown'.
    // Resolve username using central helper to keep fallback rules consistent
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
      skipUndoStack: options.skipUndoStack || false  // Pass skipUndoStack flag to backend
    };

    // Ensure parentPasteId is sent at the top-level when present. Some
    // pathData formats (notably arrays for freehand strokes) do not
    // serialize custom properties attached to the array, so include the
    // parentPasteId explicitly on the stroke object to preserve the
    // relationship. Backend relies on this to treat pasted child strokes
    // as children of the paste-record so undoing the parent hides them.
    if (drawing.parentPasteId) {
      strokeData.parentPasteId = drawing.parentPasteId;
    } else if (drawing.pathData && drawing.pathData.parentPasteId) {
      strokeData.parentPasteId = drawing.pathData.parentPasteId;
    }

    // For secure rooms, you might need signature and signerPubKey
    // For now, we'll pass null for these optional parameters
    await postRoomStroke(token, options.roomId, strokeData, null, null);

    // Only check undo/redo status if not in a batch operation (skipUndoCheck flag)
    if (!options.skipUndoCheck && setUndoAvailable && setRedoAvailable) {
      await checkUndoRedoAvailability({ token }, setUndoAvailable, setRedoAvailable, options.roomId);
    }
  } catch (error) {
    console.error('Error submitting stroke:', error);
    throw error;
  }
};

// Refresh canvas data from the room-based API
export const refreshCanvas = async (currentCount, userData, drawAllDrawings, startTime, endTime, options = {}) => {
  const token = options.auth?.token || getAuthToken();
  if (!token || !options.roomId) {
    console.warn('refreshCanvas: Missing auth token or roomId');
    return 0;
  }

  try {
    const strokes = await getRoomStrokes(token, options.roomId);

    // Convert backend strokes to our drawing format
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

    // Filter by time range if specified
    const filteredDrawings = backendDrawings.filter(drawing => {
      if (startTime && drawing.timestamp < startTime) return false;
      if (endTime && drawing.timestamp > endTime) return false;
      return true;
    });

    // Sort by order/timestamp
    filteredDrawings.sort((a, b) => (a.order || a.timestamp) - (b.order || b.timestamp));

    // CRITICAL: REPLACE local cache with backend data, don't merge
    // This ensures undo/redo changes from other users are immediately reflected
    // Backend GET endpoint aggregates undo/redo markers from ALL users
    userData.drawings = filteredDrawings;

    drawAllDrawings();
    return userData.drawings.length;
  } catch (error) {
    console.error('Error refreshing canvas:', error);
    return userData.drawings ? userData.drawings.length : 0;
  }
};

// Clear canvas - clears all strokes from the room
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

    // Return parsed server response so callers can use clearedAt if present
    return result;

  } catch (error) {
    console.error('Error clearing canvas:', error);
    throw error;
  }
};

// Prevent concurrent undo/redo operations
let undoRedoInProgress = false;

// Undo action - properly implemented with backend integration
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

  // Prevent concurrent operations
  if (undoRedoInProgress) {
    console.log('UNDO DEBUG: Another undo/redo is in progress, skipping');
    return;
  }

  undoRedoInProgress = true;

  try {
    const lastAction = undoStack[undoStack.length - 1];

    console.log('UNDO DEBUG: undoStack.length =', undoStack.length);
    console.log('UNDO DEBUG: lastAction =', lastAction);

    let shouldRefreshFromBackend = false;

    try {

      if (lastAction.type === 'cut') {
        // For cut operations: only undo the CUT RECORD on backend (1 call)
        // Handle replacement segments and original strokes locally
        console.log('UNDO DEBUG: Processing cut operation undo');

        // First, handle local state changes immediately
        // Remove the composite cut action from the local drawings.
        userData.drawings = userData.drawings.filter(drawing => {
          if (drawing.drawingId === lastAction.cutRecord.drawingId) return false;

          for (const repArr of Object.values(lastAction.replacementSegments)) {
            if (repArr.some(rep => rep.drawingId === drawing.drawingId)) {
              return false;
            }
          }

          return true;
        });

        // Restore the original drawings that were affected.
        lastAction.affectedDrawings.forEach(original => {
          userData.drawings.push(original);
        });

        // Immediately redraw to show the change
        drawAllDrawings();

        // Now undo ONLY the cut record on backend (1 call, not backendCount calls)
        const result = await undoRoomAction(auth.token, roomId);

        if (result.status === "ok" || result.status === "success") {
          console.log('UNDO DEBUG: Cut record undone on backend');
          shouldRefreshFromBackend = true;
        } else if (result.status === "noop") {
          console.log("Backend has no more undo actions available");
        } else {
          console.error("Undo failed:", result.message);
        }
      } else if (lastAction.type === 'paste') {
        for (let i = 0; i < lastAction.backendCount; i++) {
          const result = await undoRoomAction(auth.token, roomId);

          if (result.status === "ok" || result.status === "success") {
            shouldRefreshFromBackend = true;
          } else if (result.status === "noop") {
            console.log("Backend has no more undo actions available");
          } else {
            console.error("Undo failed:", result.message);
          }
        }

        userData.drawings = userData.drawings.filter(drawing =>
          !lastAction.pastedDrawings.some(pasted => pasted.drawingId === drawing.drawingId)
        );

        // Immediately redraw to show the change
        drawAllDrawings();
      } else {
        // For a normal stroke, remove it locally and then call backend undo.
        console.log('UNDO DEBUG: lastAction =', lastAction);
        console.log('UNDO DEBUG: userData.drawings before filter =', userData.drawings.length);
        console.log('UNDO DEBUG: looking for drawingId =', lastAction.drawingId);

        userData.drawings = userData.drawings.filter(
          (drawing) => {
            console.log('UNDO DEBUG: comparing', drawing.drawingId, 'vs', lastAction.drawingId);
            return drawing.drawingId !== lastAction.drawingId;
          }
        );

        console.log('UNDO DEBUG: userData.drawings after filter =', userData.drawings.length);

        // Immediately redraw to show the change
        drawAllDrawings();

        const result = await undoRoomAction(auth.token, roomId);
        console.log('UNDO DEBUG: backend result =', result);

        if (result.status === "noop") {
          console.log('UNDO DEBUG: Backend has nothing to undo, but we already removed locally');
          // Don't refresh from backend since it would re-add the stroke
          // The local removal is sufficient
          shouldRefreshFromBackend = false;
        } else if (result.status === "ok" || result.status === "success") {
          console.log('UNDO DEBUG: Backend undo successful');
          shouldRefreshFromBackend = true;
        } else {
          console.error("Undo failed:", result.message);
          // If backend failed, restore the stroke locally
          userData.drawings.push(lastAction);
          drawAllDrawings();
          shouldRefreshFromBackend = false;
        }
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
      // Release the lock
      undoRedoInProgress = false;

      // CRITICAL: ALWAYS refresh from backend after undo to sync with other users
      // This is how the legacy system stays in sync across multiple users
      // Backend includes undo/redo markers from ALL users, not just this one
      refreshCanvasButtonHandler();

      // Check undo/redo availability
      if (checkUndoRedoAvailability) {
        checkUndoRedoAvailability();
      }
    }
  } catch (error) {
    console.error('Undo outer error:', error);
    undoRedoInProgress = false;
  }
};

// Redo action - properly implemented with backend integration
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

  // Prevent concurrent operations
  if (undoRedoInProgress) {
    console.log('REDO DEBUG: Another undo/redo is in progress, skipping');
    return;
  }

  undoRedoInProgress = true;

  try {
    const lastUndone = redoStack[redoStack.length - 1];

    try {
      if (lastUndone.type === 'cut') {
        console.log('REDO DEBUG: Processing cut operation redo');

        // First, handle local state changes immediately
        // Reapply the composite cut action:
        lastUndone.affectedDrawings.forEach(original => {
          userData.drawings = userData.drawings.filter(
            drawing => drawing.drawingId !== original.drawingId
          );
        });

        Object.values(lastUndone.replacementSegments).forEach(segments => {
          segments.forEach(seg => {
            userData.drawings.push(seg);
          });
        });

        userData.addDrawing(lastUndone.cutRecord);

        // Immediately redraw to show the change
        drawAllDrawings();

        // Now redo ONLY the cut record on backend (1 call, not backendCount calls)
        const result = await redoRoomAction(auth.token, roomId);

        if (result.status === "ok" || result.status === "success") {
          console.log('REDO DEBUG: Cut record redone on backend');
        } else if (result.status === "noop") {
          console.log("Backend has no more redo actions available");
        } else {
          console.error("Redo failed:", result.message);
        }
      } else if (lastUndone.type === 'paste') {
        for (let i = 0; i < lastUndone.backendCount; i++) {
          const result = await redoRoomAction(auth.token, roomId);

          if (result.status === "ok" || result.status === "success") {
            // Backend redo successful  
          } else if (result.status === "noop") {
            console.log("Backend has no more redo actions available");
          } else {
            console.error("Redo failed:", result.message);
          }
        }

        lastUndone.pastedDrawings.forEach(pd => {
          userData.drawings.push(pd);
        });

        // Immediately redraw to show the change
        drawAllDrawings();
      } else {
        userData.drawings.push(lastUndone);

        // Immediately redraw to show the change
        drawAllDrawings();

        const result = await redoRoomAction(auth.token, roomId);

        if (result.status === "noop") {
          setRedoStack([]);
          setUndoStack([]);
          notify("Redo failed due to local cache being cleared out.");
          return;
        }

        if (result.status !== "ok" && result.status !== "success") {
          console.error("Redo failed:", result.message);
        }
      }

      // Update the stacks.
      const newRedoStack = redoStack.slice(0, redoStack.length - 1);
      setRedoStack(newRedoStack);
      setUndoStack(prev => [...prev, lastUndone]);
    } catch (error) {
      console.error("Error during redo:", error);
    } finally {
      undoRedoInProgress = false;

      // CRITICAL: ALWAYS refresh from backend after redo to sync with other users
      // This is how the legacy system stays in sync across multiple users
      refreshCanvasButtonHandler();

      // Check undo/redo availability
      if (checkUndoRedoAvailability) {
        checkUndoRedoAvailability();
      }
    }
  } catch (error) {
    console.error('Redo outer error:', error);
    undoRedoInProgress = false;
  }
};

// Check undo/redo availability from backend
export const checkUndoRedoAvailability = async (auth, setUndoAvailable, setRedoAvailable, roomId) => {
  try {
    const token = auth?.token || getAuthToken();
    if (!token || !roomId) {
      setUndoAvailable && setUndoAvailable(false);
      setRedoAvailable && setRedoAvailable(false);
      return;
    }

    const result = await getUndoRedoStatus(token, roomId);
    if (result.status === 'ok') {
      setUndoAvailable && setUndoAvailable(result.undo_available);
      setRedoAvailable && setRedoAvailable(result.redo_available);
      console.log('Undo/redo status updated:', result);
      return result;
    }
  } catch (error) {
    console.error('Error checking undo/redo availability:', error);
  }

  // Fallback - set both to false
  setUndoAvailable && setUndoAvailable(false);
  setRedoAvailable && setRedoAvailable(false);
  return { undo_available: false, redo_available: false };
};