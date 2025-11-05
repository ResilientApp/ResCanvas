import {
  getRoomStrokes,
  postRoomStroke,
  clearRoomCanvas,
  undoRoomAction,
  redoRoomAction,
  getUndoRedoStatus,
} from "../api/rooms";
import { getAuthToken } from "../utils/authUtils";
import { getUsername } from "../utils/getUsername";
import notify from "../utils/notify";
import { signStrokeForSecureRoom, isWalletConnected } from "../wallet/resvault";
import { API_BASE } from "../config/apiConfig";
import { Drawing } from "../lib/drawing";

export const submitToDatabase = async (
  drawing,
  auth,
  options = {},
  setUndoAvailable,
  setRedoAvailable
) => {
  const token = auth?.token || getAuthToken();
  if (!token || !options.roomId) {
    console.error("submitToDatabase: Missing auth token or roomId");
    return;
  }

  try {
    let username = null;
    try {
      username = getUsername(auth);
    } catch (e) {
      username = null;
    }
    if (!username) username = "Unknown";

    // Build complete metadata object with all custom features
    console.log("=== SUBMIT STROKE DEBUG ===");
    console.log("Drawing object:", drawing);
    console.log("Drawing.getMetadata exists?", typeof drawing.getMetadata);
    console.log("Drawing fields:", {
      stampData: drawing.stampData,
      stampSettings: drawing.stampSettings,
      drawingType: drawing.drawingType,
      brushType: drawing.brushType
    });

    const metadata = drawing.getMetadata
      ? drawing.getMetadata()
      : {
        brushStyle: drawing.brushStyle || "round",
        brushType: drawing.brushType || "normal",
        brushParams: drawing.brushParams || {},
        drawingType: drawing.drawingType || "stroke",
        stampData: drawing.stampData || null,
        stampSettings: drawing.stampSettings || null,
        filterType: drawing.filterType || null,
        filterParams: drawing.filterParams || {},
      };

    console.log("Extracted metadata:", metadata);

    const strokeData = {
      drawingId: drawing.drawingId,
      color: drawing.color,
      lineWidth: drawing.lineWidth,
      pathData: drawing.pathData,
      timestamp: drawing.timestamp,
      user: username,
      roomId: options.roomId,
      skipUndoStack: options.skipUndoStack || false,
      brushStyle: metadata.brushStyle,
      brushType: metadata.brushType,
      brushParams: metadata.brushParams,
      drawingType: metadata.drawingType,
      stampData: metadata.stampData,
      stampSettings: metadata.stampSettings,
      filterType: metadata.filterType,
      filterParams: metadata.filterParams,
      metadata: metadata,
    };

    if (drawing.parentPasteId) {
      strokeData.parentPasteId = drawing.parentPasteId;
    } else if (drawing.pathData && drawing.pathData.parentPasteId) {
      strokeData.parentPasteId = drawing.pathData.parentPasteId;
    }

    let signature = null;
    let signerPubKey = null;

    if (options.roomType === "secure") {
      if (!isWalletConnected()) {
        notify(
          "Please connect your wallet to draw in this secure room",
          "warning"
        );
        throw new Error("Wallet not connected for secure room");
      }

      try {
        const signedData = await signStrokeForSecureRoom(
          options.roomId,
          strokeData
        );
        signature = signedData.signature;
        signerPubKey = signedData.signerPubKey;

        console.log("Stroke signed for secure room:", {
          signerPubKey: signerPubKey?.substring(0, 16) + "...",
        });
      } catch (signError) {
        console.error("Failed to sign stroke:", signError);
        notify(
          "Failed to sign stroke with wallet: " + signError.message,
          "error"
        );
        throw signError;
      }
    }

    console.log("Submitting stroke data:", {
      drawingId: strokeData.drawingId,
      brushType: strokeData.brushType,
      brushParams: strokeData.brushParams,
      metadata: strokeData.metadata,
      roomType: options.roomType,
      parentPasteId: strokeData.parentPasteId || "NOT SET"
    });
    console.log("Full strokeData object:", strokeData);

    await postRoomStroke(
      token,
      options.roomId,
      strokeData,
      signature,
      signerPubKey
    );

    if (!options.skipUndoCheck && setUndoAvailable && setRedoAvailable) {
      await checkUndoRedoAvailability(
        { token },
        setUndoAvailable,
        setRedoAvailable,
        options.roomId
      );
    }
  } catch (error) {
    console.error("Error submitting stroke:", error);
    throw error;
  }
};

export const refreshCanvas = async (
  currentCount,
  userData,
  drawAllDrawings,
  startTime,
  endTime,
  options = {}
) => {
  const token = options.auth?.token || getAuthToken();
  if (!token || !options.roomId) {
    console.warn("refreshCanvas: Missing auth token or roomId");
    return 0;
  }

  try {
    const strokes = await getRoomStrokes(token, options.roomId, {
      start: startTime,
      end: endTime,
    });

    if (strokes.length > 0) {
      console.log("Received strokes from backend:", {
        count: strokes.length,
        firstStroke: strokes[0],
        lastStroke: strokes[strokes.length - 1]
      });

      console.log('=== BACKEND STROKE ANALYSIS ===');
      console.log('Total strokes received:', strokes.length);

      // Count and log advanced brush strokes
      const advancedBrushStrokes = strokes.filter(s =>
        s.brushType && s.brushType !== "normal" ||
        (s.metadata && s.metadata.brushType && s.metadata.brushType !== "normal")
      );
      console.log('Advanced brush strokes:', advancedBrushStrokes.length);

      if (strokes.length > 0) {
        const firstStroke = strokes[0];
        console.log('First stroke complete object:', firstStroke);
        console.log('First stroke keys:', Object.keys(firstStroke));
        console.log('First stroke brush analysis:', {
          hasBrushType: 'brushType' in firstStroke,
          hasBrush_type: 'brush_type' in firstStroke,
          hasMetadata: 'metadata' in firstStroke,
          brushTypeValue: firstStroke.brushType,
          brush_typeValue: firstStroke.brush_type,
          metadataValue: firstStroke.metadata
        });
      }

      if (advancedBrushStrokes.length > 0) {
        console.log('Sample advanced brush stroke:', advancedBrushStrokes[0]);
      }
    }

    const backendDrawings = strokes.map((stroke) => {
      let metadata = stroke.metadata || {};

      // Merge top-level fields into metadata if not present
      const extractedMetadata = {
        brushStyle: metadata.brushStyle || stroke.brushStyle || "round",
        brushType: metadata.brushType || stroke.brushType || stroke.brush_type || "normal",
        brushParams: metadata.brushParams || stroke.brushParams || stroke.brush_params || {},
        drawingType: metadata.drawingType || stroke.drawingType || "stroke",
        stampData: metadata.stampData || stroke.stampData || null,
        stampSettings: metadata.stampSettings || stroke.stampSettings || null,
        filterType: metadata.filterType || stroke.filterType || null,
        filterParams: metadata.filterParams || stroke.filterParams || {},
      };

      if (extractedMetadata.drawingType === "stamp" || extractedMetadata.brushType !== "normal") {
        console.log(`Reconstructing special drawing from backend:`, {
          id: stroke.drawingId || stroke.id,
          drawingType: extractedMetadata.drawingType,
          brushType: extractedMetadata.brushType,
          stampData: extractedMetadata.stampData,
          stampSettings: extractedMetadata.stampSettings,
          rawStroke: stroke,
          extractedMetadata: extractedMetadata
        });
      }

      const drawing = new Drawing(
        stroke.drawingId || stroke.id ||
        `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        stroke.color || "#000000",
        stroke.lineWidth || 5,
        stroke.pathData || [],
        stroke.timestamp || stroke.ts || Date.now(),
        stroke.user || "",
        extractedMetadata
      );

      drawing.order = stroke.order || stroke.timestamp || 0;
      drawing.roomId = stroke.roomId || options.roomId;

      if (extractedMetadata.drawingType === "stamp" || extractedMetadata.brushType !== "normal") {
        console.log("Created Drawing object with special features:", {
          id: drawing.drawingId,
          drawingType: drawing.drawingType,
          brushType: drawing.brushType,
          stampData: drawing.stampData,
          stampSettings: drawing.stampSettings,
          hasStampData: !!drawing.stampData,
          hasStampSettings: !!drawing.stampSettings,
          pathData: drawing.pathData,
          pathDataIsArray: Array.isArray(drawing.pathData),
          pathDataLength: drawing.pathData ? drawing.pathData.length : 0,
          metadata: drawing.getMetadata()
        });

        // For custom image stamps, verify the base64 data is intact
        if (drawing.stampData && drawing.stampData.image) {
          console.log("Stamp image data length from backend:", drawing.stampData.image.length);
          console.log("Stamp image preview:", drawing.stampData.image.substring(0, 100) + "...");
        }
      }

      return drawing;
    });

    // Filter by time range if specified
    const filteredDrawings = backendDrawings.filter((drawing) => {
      if (startTime && drawing.timestamp < startTime) return false;
      if (endTime && drawing.timestamp > endTime) return false;
      return true;
    });

    // Sort by order/timestamp
    filteredDrawings.sort(
      (a, b) => (a.order || a.timestamp) - (b.order || b.timestamp)
    );

    console.log("[refreshCanvas] About to update userData.drawings:", {
      oldCount: userData.drawings ? userData.drawings.length : 0,
      newCount: filteredDrawings.length,
      newDrawingsSample: filteredDrawings.slice(0, 3).map(d => ({ id: d.drawingId, brushType: d.brushType }))
    });

    // Clear any cached state to force a redraw
    // This ensures the canvas renders again even if the drawing IDs are the same
    if (options.clearLastDrawnState) {
      options.clearLastDrawnState();
    }

    userData.drawings = filteredDrawings;

    console.log("[refreshCanvas] Updated userData.drawings:", {
      count: userData.drawings.length,
      firstDrawing: userData.drawings[0] ? {
        id: userData.drawings[0].drawingId,
        brushType: userData.drawings[0].brushType
      } : null,
      allDrawingIds: userData.drawings.map(d => d.drawingId).join(',').substring(0, 200),
      pastedStrokesStillPresent: userData.drawings.filter(d =>
        d.parentPasteId || (d.pathData && d.pathData.parentPasteId)
      ).length
    });

    if (drawAllDrawings) {
      console.log("[refreshCanvas] Calling drawAllDrawings...");
      drawAllDrawings();
    }

    return userData.drawings.length;
  } catch (error) {
    console.error("Error refreshing canvas:", error);
    return userData.drawings ? userData.drawings.length : 0;
  }
};

export const clearBackendCanvas = async (options = {}) => {
  const token = options.auth?.token || getAuthToken();
  if (!token || !options.roomId) {
    console.warn("clearBackendCanvas: Missing auth token or roomId");
    return;
  }

  try {
    console.log("Clear canvas requested for room:", options.roomId);
    const result = await clearRoomCanvas(token, options.roomId);
    console.log("Canvas cleared successfully", result);

    return result;
  } catch (error) {
    console.error("Error clearing canvas:", error);
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
  roomId,
}) => {
  if (undoStack.length === 0) return;

  if (undoRedoInProgress) {
    console.log("UNDO DEBUG: Another undo/redo is in progress, skipping");
    return;
  }

  undoRedoInProgress = true;

  try {
    const lastAction = undoStack[undoStack.length - 1];

    console.log("UNDO DEBUG: undoStack.length =", undoStack.length);
    console.log("UNDO DEBUG: lastAction =", lastAction);

    let shouldRefreshFromBackend = false;

    try {
      if (lastAction.type === "cut") {
        console.log("UNDO DEBUG: Processing cut operation undo");

        userData.drawings = userData.drawings.filter((drawing) => {
          if (drawing.drawingId === lastAction.cutRecord.drawingId)
            return false;

          for (const repArr of Object.values(lastAction.replacementSegments)) {
            if (repArr.some((rep) => rep.drawingId === drawing.drawingId)) {
              return false;
            }
          }

          return true;
        });

        lastAction.affectedDrawings.forEach((original) => {
          userData.drawings.push(original);
        });

        drawAllDrawings();

        const result = await undoRoomAction(auth.token, roomId);

        if (result.status === "ok" || result.status === "success") {
          console.log("UNDO DEBUG: Cut record undone on backend");
          shouldRefreshFromBackend = true;
        } else if (result.status === "noop") {
          console.log("Backend has no more undo actions available");
        } else {
          console.error("Undo failed:", result.message);
        }
      } else if (lastAction.type === "paste") {
        console.log("UNDO DEBUG: Processing paste operation undo");
        console.log("UNDO DEBUG: Paste undo - pastedDrawings count:", lastAction.pastedDrawings.length);
        console.log("UNDO DEBUG: Paste undo - pastedDrawing IDs:", lastAction.pastedDrawings.map(d => d.drawingId).join(','));
        console.log("UNDO DEBUG: Paste undo - userData.drawings before filter:", userData.drawings.length);

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

        // Remove pasted drawings from local state
        const beforeCount = userData.drawings.length;
        userData.drawings = userData.drawings.filter(
          (drawing) =>
            !lastAction.pastedDrawings.some(
              (pasted) => pasted.drawingId === drawing.drawingId
            )
        );
        const afterCount = userData.drawings.length;
        console.log("UNDO DEBUG: Paste undo - userData.drawings after filter:", afterCount, "(removed", beforeCount - afterCount, "drawings)");

        drawAllDrawings();

        // Refresh from backend after undoing paste
        if (shouldRefreshFromBackend) {
          console.log("UNDO DEBUG: Refreshing from backend after paste undo");
          await refreshCanvasButtonHandler();
          shouldRefreshFromBackend = false; 
        }
      } else {
        console.log("UNDO DEBUG: lastAction =", lastAction);
        console.log(
          "UNDO DEBUG: userData.drawings before filter =",
          userData.drawings.length
        );
        console.log(
          "UNDO DEBUG: looking for drawingId =",
          lastAction.drawingId
        );

        userData.drawings = userData.drawings.filter((drawing) => {
          console.log(
            "UNDO DEBUG: comparing",
            drawing.drawingId,
            "vs",
            lastAction.drawingId
          );
          return drawing.drawingId !== lastAction.drawingId;
        });

        console.log(
          "UNDO DEBUG: userData.drawings after filter =",
          userData.drawings.length
        );

        drawAllDrawings();

        const result = await undoRoomAction(auth.token, roomId);
        console.log("UNDO DEBUG: backend result =", result);

        if (result.status === "noop") {
          console.log(
            "UNDO DEBUG: Backend has nothing to undo, but we already removed locally"
          );
          shouldRefreshFromBackend = false;
        } else if (result.status === "ok" || result.status === "success") {
          console.log("UNDO DEBUG: Backend undo successful");
          shouldRefreshFromBackend = true;

          // Immediately refresh from backend to get updated undone_strokes
          // This ensures the visual state matches the backend state
          console.log("UNDO DEBUG: Refreshing from backend after undo");
          await refreshCanvasButtonHandler();
          shouldRefreshFromBackend = false; 
        } else {
          console.error("Undo failed:", result.message);
          userData.drawings.push(lastAction);
          drawAllDrawings();
          shouldRefreshFromBackend = false;
        }
      }

      const newUndoStack = undoStack.slice(0, undoStack.length - 1);

      setUndoStack(newUndoStack);
      setRedoStack((prev) => [...prev, lastAction]);
    } catch (error) {
      console.error("Undo error:", error);
      setUndoStack([]);
      setRedoStack([]);
      notify("Undo failed due to local cache being cleared out.");
    } finally {
      undoRedoInProgress = false;

      // Only refresh if we haven't already refreshed after backend call
      if (shouldRefreshFromBackend) {
        refreshCanvasButtonHandler();
      }

      if (checkUndoRedoAvailability) {
        checkUndoRedoAvailability();
      }
    }
  } catch (error) {
    console.error("Unexpected undo error:", error);
    undoRedoInProgress = false;
  }
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
  roomId,
}) => {
  if (redoStack.length === 0) return;

  if (undoRedoInProgress) {
    console.log("REDO DEBUG: Another undo/redo is in progress, skipping");
    return;
  }

  undoRedoInProgress = true;
  let shouldRefreshFromBackend = true; // Track if we need to refresh in finally block

  try {
    const lastUndone = redoStack[redoStack.length - 1];

    try {
      if (lastUndone.type === "cut") {
        console.log("REDO DEBUG: Processing cut operation redo");

        lastUndone.affectedDrawings.forEach((original) => {
          userData.drawings = userData.drawings.filter(
            (drawing) => drawing.drawingId !== original.drawingId
          );
        });

        Object.values(lastUndone.replacementSegments).forEach((segments) => {
          segments.forEach((seg) => {
            userData.drawings.push(seg);
          });
        });

        userData.addDrawing(lastUndone.cutRecord);

        drawAllDrawings();

        const result = await redoRoomAction(auth.token, roomId);

        if (result.status === "ok" || result.status === "success") {
          console.log("REDO DEBUG: Cut record redone on backend");
          // Refresh from backend after cut redo
          await refreshCanvasButtonHandler();
          shouldRefreshFromBackend = false; 
        } else if (result.status === "noop") {
          console.log("Backend has no more redo actions available");
        } else {
          console.error("Redo failed:", result.message);
        }
      } else if (lastUndone.type === "paste") {
        console.log("REDO DEBUG: Processing paste operation redo");

        for (let i = 0; i < lastUndone.backendCount; i++) {
          const result = await redoRoomAction(auth.token, roomId);

          if (result.status === "ok" || result.status === "success") {
          } else if (result.status === "noop") {
            console.log("Backend has no more redo actions available");
          } else {
            console.error("Redo failed:", result.message);
          }
        }

        lastUndone.pastedDrawings.forEach((pd) => {
          userData.drawings.push(pd);
        });

        drawAllDrawings();

        // Refresh from backend after paste redo
        console.log("REDO DEBUG: Refreshing from backend after paste redo");
        await refreshCanvasButtonHandler();
        shouldRefreshFromBackend = false; 
      } else {
        userData.drawings.push(lastUndone);

        drawAllDrawings();

        const result = await redoRoomAction(auth.token, roomId);

        if (result.status === "noop") {
          setRedoStack([]);
          setUndoStack([]);
          notify("Redo failed due to local cache being cleared out.");
          return;
        }

        if (result.status === "ok" || result.status === "success") {
          // Refresh from backend after redo
          console.log("REDO DEBUG: Refreshing from backend after redo");
          await refreshCanvasButtonHandler();
          shouldRefreshFromBackend = false; 
        } else if (result.status !== "ok" && result.status !== "success") {
          console.error("Redo failed:", result.message);
        }
      }

      const newRedoStack = redoStack.slice(0, redoStack.length - 1);
      setRedoStack(newRedoStack);
      setUndoStack((prev) => [...prev, lastUndone]);
    } catch (error) {
      console.error("Error during redo:", error);
    } finally {
      undoRedoInProgress = false;

      // Only refresh if we haven't already refreshed after backend call
      if (shouldRefreshFromBackend) {
        refreshCanvasButtonHandler();
      }

      if (checkUndoRedoAvailability) {
        checkUndoRedoAvailability();
      }
    }
  } catch (error) {
    console.error("Redo outer error:", error);
    undoRedoInProgress = false;
  }
};

export const checkUndoRedoAvailability = async (
  auth,
  setUndoAvailable,
  setRedoAvailable,
  roomId
) => {
  try {
    const token = auth?.token || getAuthToken();
    if (!token || !roomId) {
      setUndoAvailable && setUndoAvailable(false);
      setRedoAvailable && setRedoAvailable(false);
      return;
    }

    const result = await getUndoRedoStatus(token, roomId);
    if (result.status === "ok") {
      setUndoAvailable && setUndoAvailable(result.undo_available);
      setRedoAvailable && setRedoAvailable(result.redo_available);
      console.log("Undo/redo status updated:", result);
      return result;
    }
  } catch (error) {
    console.error("Error checking undo/redo availability:", error);
  }

  setUndoAvailable && setUndoAvailable(false);
  setRedoAvailable && setRedoAvailable(false);
  return { undo_available: false, redo_available: false };
};
