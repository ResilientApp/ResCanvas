const API_BASE = "http://44.193.63.142:10010"

// Submit a new drawing to the backend
export const submitToDatabase = async (drawingData, currentUser) => {
  const apiPayload = {
    ts: drawingData.timestamp,
    value: JSON.stringify(drawingData),
    user: currentUser,
    deletion_date_flag: '',
  };

  const apiUrl = `${API_BASE}/submitNewLine`;

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

// Refresh the canvas data from backend
export const refreshCanvas = async (from, userData, drawAllDrawings, currentUser) => {
  const apiUrl = `${API_BASE}/getCanvasData?from=${from}`;

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
    const backendDrawings = result.data
      .map((item) => {
        const { value, user } = item;

        if (!value) return null;

        const drawingData = JSON.parse(value);

        return {
          drawingId: drawingData.drawingId,
          color: drawingData.color,
          lineWidth: drawingData.lineWidth,
          pathData: drawingData.pathData,
          timestamp: drawingData.timestamp,
          user: user,
          order: drawingData.order || drawingData.timestamp,
        };
      })
      .filter(d => d);

    backendDrawings.sort((a, b) => (a.order || a.timestamp) - (b.order || b.timestamp));

    userData.drawings = backendDrawings;

    drawAllDrawings();
    return backendDrawings.length;
  } catch (error) {
    console.error("Error refreshing canvas:", error);
  }
};

export const clearBackendCanvas = async () => {
  const apiPayload = { ts: Date.now() };
  const apiUrl = `${API_BASE}/submitClearCanvasTimestamp`;
  
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiPayload)
    });

    if (!response.ok) throw new Error(`Failed to submit data: ${response.statusText}`);

    await response.json();
  } catch (error) {
    console.error("Error submitting clear canvas to NextRes:", error);
  }
};

export const checkUndoRedoAvailability = async (currentUser, setUndoAvailable, setRedoAvailable) => {
  try {
    if (currentUser) {
      console.log(currentUser);
    } else {
      if (typeof setUndoAvailable === "function") {
        setUndoAvailable(false);
      }
      if (typeof setRedoAvailable === "function") {
        setRedoAvailable(false);
      }
    }
  } catch (error) {
    console.error(`Error during checkUndoRedoAvailability: ${error}`);
  }
};

export const undoAction = async ({
  currentUser,
  undoStack,
  setUndoStack,
  setRedoStack,
  userData,
  drawAllDrawings,
  refreshCanvasButtonHandler,
  checkUndoRedoAvailability
}) => {
  if (undoStack.length === 0) return;

  const lastAction = undoStack[undoStack.length - 1];

  try {
    if (lastAction.type === 'cut') {
      // For a composite cut action, perform backend undo calls equal to backendCount.
      for (let i = 0; i < lastAction.backendCount; i++) {
        const response = await fetch(`${API_BASE}/undo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUser }),
        });

        if (!response.ok) throw new Error(`Undo failed: ${response.statusText}`);

        const result = await response.json();

        if (result.status !== "success") {
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

      drawAllDrawings();

    } else if (lastAction.type === 'paste') {
      for (let i = 0; i < lastAction.backendCount; i++) {
        const response = await fetch(`${API_BASE}/undo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUser }),
        });

        if (!response.ok) throw new Error(`Undo failed: ${response.statusText}`);

        const result = await response.json();
        if (result.status !== "success") {
          console.error("Undo failed:", result.message);
        }
      }

      userData.drawings = userData.drawings.filter(drawing =>
        !lastAction.pastedDrawings.some(pasted => pasted.drawingId === drawing.drawingId)
      );

      drawAllDrawings();
    } else {
      // For a normal stroke, remove it locally and then call backend undo.
      userData.drawings = userData.drawings.filter(
        (drawing) => drawing.drawingId !== lastAction.drawingId
      );

      drawAllDrawings();

      const response = await fetch(`${API_BASE}/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser }),
      });

      if (!response.ok) throw new Error(`Undo failed: ${response.statusText}`);

      const result = await response.json();
      if (result.status !== "success") {
        console.error("Undo failed:", result.message);
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
    refreshCanvasButtonHandler();
    checkUndoRedoAvailability();
  }
};

// Redo function: similar structure to undo, but for reapplying actions.
export const redoAction = async ({
  currentUser,
  redoStack,
  setRedoStack,
  setUndoStack,
  userData,
  drawAllDrawings,
  refreshCanvasButtonHandler,
  checkUndoRedoAvailability
}) => {
  if (redoStack.length === 0) return;

  const lastUndone = redoStack[redoStack.length - 1];

  try {
    if (lastUndone.type === 'cut') {
      for (let i = 0; i < lastUndone.backendCount; i++) {
        const response = await fetch(`${API_BASE}/redo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUser }),
        });

        if (!response.ok) throw new Error(`Redo failed: ${response.statusText}`);

        const result = await response.json();
        if (result.status !== "success") {
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

      drawAllDrawings();
    } else if (lastUndone.type === 'paste') {
      for (let i = 0; i < lastUndone.backendCount; i++) {
        const response = await fetch(`${API_BASE}/redo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUser }),
        });

        if (!response.ok) throw new Error(`Redo failed: ${response.statusText}`);

        const result = await response.json();
        if (result.status !== "success") {
          console.error("Redo failed:", result.message);
        }
      }

      lastUndone.pastedDrawings.forEach(pd => {
        userData.drawings.push(pd);
      });

      drawAllDrawings();
    } else {
      userData.drawings.push(lastUndone);

      drawAllDrawings();

      const response = await fetch(`${API_BASE}/redo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser }),
      });

      if (!response.ok) {
        setRedoStack([]);
        setUndoStack([]);
        drawAllDrawings();
        alert("Redo failed due to local cache being cleared out.");
        return;
      }

      const result = await response.json();
      if (result.status !== "success") {
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
    checkUndoRedoAvailability();
  }
};
