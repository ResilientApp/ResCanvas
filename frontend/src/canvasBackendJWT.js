// JWT-based canvas backend operations for room-based drawing
import { getRoomStrokes, postRoomStroke, clearRoomCanvas, undoRoomAction, redoRoomAction, getUndoRedoStatus } from './api/rooms';

const API_BASE = "http://127.0.0.1:10010";

// Submit a drawing stroke to the room-based API
export const submitToDatabase = async (drawing, auth, options = {}, setUndoAvailable, setRedoAvailable) => {
  if (!auth?.token || !options.roomId) {
    console.error('submitToDatabase: Missing auth token or roomId');
    return;
  }

  try {
    const strokeData = {
      drawingId: drawing.drawingId,
      color: drawing.color,
      lineWidth: drawing.lineWidth,
      pathData: drawing.pathData,
      timestamp: drawing.timestamp,
      user: auth.user.username,
      roomId: options.roomId
    };

    // For secure rooms, you might need signature and signerPubKey
    // For now, we'll pass null for these optional parameters
    console.log('SUBMIT DEBUG: About to submit stroke to backend:', strokeData);
    await postRoomStroke(auth.token, options.roomId, strokeData, null, null);
    
    console.log('Stroke submitted successfully:', strokeData);

    // After submitting, check the undo/redo status
    if (setUndoAvailable && setRedoAvailable) {
        await checkUndoRedoAvailability(auth, setUndoAvailable, setRedoAvailable, options.roomId);
    }
  } catch (error) {
    console.error('Error submitting stroke:', error);
    throw error;
  }
};

// Refresh canvas data from the room-based API
export const refreshCanvas = async (currentCount, userData, drawAllDrawings, startTime, endTime, options = {}) => {
  if (!options.auth?.token || !options.roomId) {
    console.warn('refreshCanvas: Missing auth token or roomId');
    return 0;
  }

  try {
    const strokes = await getRoomStrokes(options.auth.token, options.roomId);
    
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

    // Merge with local cache, avoiding duplicates
    const existingIds = new Set(userData.drawings.map(d => d.drawingId));
    const newDrawings = filteredDrawings.filter(d => !existingIds.has(d.drawingId));
    
    userData.drawings = [...userData.drawings, ...newDrawings];
    userData.drawings.sort((a, b) => (a.order || a.timestamp) - (b.order || b.timestamp));

    drawAllDrawings();
    return userData.drawings.length;
  } catch (error) {
    console.error('Error refreshing canvas:', error);
    return userData.drawings ? userData.drawings.length : 0;
  }
};

// Clear canvas - clears all strokes from the room
export const clearBackendCanvas = async (options = {}) => {
  if (!options.auth?.token || !options.roomId) {
    console.warn('clearBackendCanvas: Missing auth token or roomId');
    return;
  }

  try {
    console.log('Clear canvas requested for room:', options.roomId);
    await clearRoomCanvas(options.auth.token, options.roomId);
    
    console.log('Canvas cleared successfully');
    
    // Note: The backend will broadcast a 'canvas_cleared' event via Socket.IO
    // which will be handled by the Canvas component to clear local state
    
  } catch (error) {
    console.error('Error clearing canvas:', error);
    throw error;
  }
};

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

  const lastAction = undoStack[undoStack.length - 1];
  
  console.log('UNDO DEBUG: undoStack.length =', undoStack.length);
  console.log('UNDO DEBUG: lastAction =', lastAction);
  
  let shouldRefreshFromBackend = false;

  try {
    
    if (lastAction.type === 'cut') {
      // For a composite cut action, perform backend undo calls equal to backendCount.
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
    setUndoStack([]);
    setRedoStack([]);
    alert("Undo failed due to local cache being cleared out.");
  } finally {
    // Only refresh from backend if the backend operation was successful
    if (shouldRefreshFromBackend) {
      refreshCanvasButtonHandler();
    }
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

  const lastUndone = redoStack[redoStack.length - 1];

  try {
    if (lastUndone.type === 'cut') {
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
        alert("Redo failed due to local cache being cleared out.");
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
    refreshCanvasButtonHandler();
  }
};

// Check undo/redo availability from backend
export const checkUndoRedoAvailability = async (auth, setUndoAvailable, setRedoAvailable, roomId) => {
  try {
    if (!auth?.token || !roomId) {
      setUndoAvailable && setUndoAvailable(false);
      setRedoAvailable && setRedoAvailable(false);
      return;
    }
    
    const result = await getUndoRedoStatus(auth.token, roomId);
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