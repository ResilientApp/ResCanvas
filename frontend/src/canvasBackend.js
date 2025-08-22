const API_BASE = "http://127.0.0.1:10010"

// Submit a new drawing to the backend
// Submit a new drawing to the backend (optimistic/local id support)
export const submitToDatabase = async (drawingData, currentUser, options = {}) => {
  // Ensure a stable local id so refresh/merge can identify this stroke
  const tempId = drawingData.drawingId || `local-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
  drawingData.drawingId = tempId;
  // Mark as local/pending so merge logic can treat it specially
  drawingData._local = true;

  const apiPayload = {
    ts: drawingData.timestamp,
    value: JSON.stringify(drawingData),
    user: currentUser,
    deletion_date_flag: '',
    roomId: options.roomId ?? null,
    signature: options.signature || undefined,
    signerPubKey: options.signerPubKey || undefined,
  };

  const apiUrl = options.roomId ? `${API_BASE}/submitNewLineRoom` : `${API_BASE}/submitNewLine`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiPayload)
    });

    if (!response.ok) {
      const txt = await response.text().catch(()=>response.statusText);
      throw new Error(`Failed to submit data: ${response.status} ${txt}`);
    }

    const result = await response.json();

    // Return result so caller may update local data (e.g. map temp id to server id)
    return { success: result.status === "success", result, tempId };
  } catch (error) {
    console.error("Error submitting data to NextRes:", error);
    return { success: false, error, tempId };
  }
};

// Refresh the canvas data from backend (room-aware, robust decoding)
export async function refreshCanvas(from, userData, drawAllDrawings, start, end, options = {}) {
  let apiUrl = `${API_BASE}/getCanvasData`;
  const params = [];
  if (options && options.roomId) params.push(`roomId=${encodeURIComponent(options.roomId)}`);
  if (from !== undefined && from !== null) params.push(`from=${encodeURIComponent(from)}`);

  // normalize start/end into epoch ms integers (backend expects numbers)
  if (start !== undefined && start !== null && start !== '') {
    const s = (typeof start === 'number') ? start : (isNaN(Number(start)) ? new Date(start).getTime() : Number(start));
    if (!isNaN(s)) params.push(`start=${encodeURIComponent(s)}`);
  }
  if (end !== undefined && end !== null && end !== '') {
    const e = (typeof end === 'number') ? end : (isNaN(Number(end)) ? new Date(end).getTime() : Number(end));
    if (!isNaN(e)) params.push(`end=${encodeURIComponent(e)}`);
  }
  if (params.length) apiUrl += `?${params.join('&')}`;

  // peel nested JSON: value -> { value: "..." } -> { roomId, ... }
  const deepParse = (v, maxDepth = 5) => {
    let cur = v, depth = 0;
    while (depth < maxDepth) {
      if (cur instanceof Uint8Array) {
        try { cur = new TextDecoder().decode(cur); } catch { break; }
      }
      if (typeof cur === 'string') {
        try { cur = JSON.parse(cur); } catch { break; }
      } else if (cur && typeof cur === 'object') {
        if (Object.prototype.hasOwnProperty.call(cur, 'value')) { cur = cur.value; depth++; continue; }
        return cur;
      } else {
        break;
      }
      depth++;
    }
    return (cur && typeof cur === 'object') ? cur : {};
  };

  const normalizeNumberLong = (obj) => {
    if (obj && typeof obj === 'object') {
      if (obj.$numberLong) return Number(obj.$numberLong);
      if (obj.$numberInt)  return Number(obj.$numberInt);
      for (const k in obj) obj[k] = normalizeNumberLong(obj[k]);
    }
    return obj;
  };

  try {
    const response = await fetch(apiUrl, { method: "GET", headers: { "Content-Type": "application/json" } });
    if (!response.ok) throw new Error(`Failed to fetch canvas data: ${response.statusText}`);

    const result = await response.json();
    if (result.status !== "success") {
      const _err = result.message || JSON.stringify(result);
      throw new Error(`Error in response: ${_err}`);
    }

    // Map backend items to normalized strokes
    const backendDrawings = (result.data || []).map(item => {
      let parsed = {};
      if (item && typeof item === 'object') {
        parsed = deepParse(item.value);
        if (!parsed || Object.keys(parsed).length === 0) {
          // fallback
          if (typeof item.value === 'string') { try { parsed = JSON.parse(item.value); } catch { parsed = {}; } }
          else if (typeof item.value === 'object') { parsed = item.value || {}; }
        }
      }

      parsed = normalizeNumberLong(parsed);

      const rawTs = parsed.timestamp || parsed.ts || item.ts || parsed.order || 0;
      const timestamp = (typeof rawTs === 'object' && rawTs.$numberLong) ? Number(rawTs.$numberLong) : Number(rawTs || 0);

      return {
        drawingId: parsed.drawingId || parsed.id || item.id || '',
        color: parsed.color || '#000000',
        lineWidth: parsed.lineWidth || parsed.brushSize || 5,
        pathData: parsed.pathData || parsed.points || parsed.path || [],
        timestamp,
        user: item.user || parsed.user || '',
        order: parsed.order || timestamp || 0,
        roomId: parsed.roomId || item.roomId || null,
        raw: parsed
      };
    });

    // sort by order/timestamp
    backendDrawings.sort((a, b) => (a.order || a.timestamp) - (b.order || b.timestamp));

    // merge with local cache but keep only strokes for this room
    const targetRoom = options?.roomId ?? null;
    const local = Array.isArray(userData.drawings) ? userData.drawings : [];
    const scopedLocal = local.filter(d => ((d?.roomId ?? null) === targetRoom));

    const byId = new Map();
    for (const d of backendDrawings) byId.set(d.drawingId || d.raw?.id || Math.random().toString(36), d);
    for (const d of scopedLocal) {
      const key = d.drawingId || d.raw?.id || Math.random().toString(36);
      if (!byId.has(key)) byId.set(key, d);
    }

    userData.drawings = Array.from(byId.values());
    userData.drawings.sort((a,b) => (a.order || a.timestamp) - (b.order || b.timestamp));

    drawAllDrawings();
    return userData.drawings.length;
  } catch (error) {
    console.error("Error refreshing canvas:", error);
    return userData.drawings ? userData.drawings.length : 0;
  }
}

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
  refreshCanvasButtonHandler,
  checkUndoRedoAvailability,
  roomId 
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
          body: JSON.stringify({ userId: currentUser, roomId }),
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
    } else if (lastAction.type === 'paste') {
      for (let i = 0; i < lastAction.backendCount; i++) {
        const response = await fetch(`${API_BASE}/undo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUser, roomId }),
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
    } else {
      // For a normal stroke, remove it locally and then call backend undo.
      userData.drawings = userData.drawings.filter(
        (drawing) => drawing.drawingId !== lastAction.drawingId
      );

      const response = await fetch(`${API_BASE}/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser, roomId }),
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
  refreshCanvasButtonHandler,
  checkUndoRedoAvailability, roomId
}) => {
  if (redoStack.length === 0) return;

  const lastUndone = redoStack[redoStack.length - 1];

  try {
    if (lastUndone.type === 'cut') {
      for (let i = 0; i < lastUndone.backendCount; i++) {
        const response = await fetch(`${API_BASE}/redo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUser, roomId }),
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
    } else if (lastUndone.type === 'paste') {
      for (let i = 0; i < lastUndone.backendCount; i++) {
        const response = await fetch(`${API_BASE}/redo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUser, roomId }),
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
    } else {
      userData.drawings.push(lastUndone);

      const response = await fetch(`${API_BASE}/redo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser, roomId }),
      });

      if (!response.ok) {
        setRedoStack([]);
        setUndoStack([]);
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


// === Rooms API helpers ===
export async function listRooms(currentUser) {
  try {
    const res = await fetch(`${API_BASE}/rooms?user=${encodeURIComponent(currentUser)}`, { method: 'GET' });
    const j = await res.json();
    return j;
  } catch (e) {
    console.error('listRooms error', e);
    return { status: 'error', rooms: [] };
  }
}

export async function createRoom({ name, type, currentUser }) {
  try {
    const res = await fetch(`${API_BASE}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type, user: currentUser })
    });
    return await res.json();
  } catch (e) {
    console.error('createRoom error', e);
    return { status: 'error' };
  }
}
