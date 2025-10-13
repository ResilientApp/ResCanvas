const API_BASE = "http://127.0.0.1:10010";

/**
 * Submit a new drawing to the backend (optimistic/local id support)
 */
export const submitToDatabase = async (drawingData, currentUser, options = {}) => {
  // stable temp id for local merge/refresh
  const tempId = drawingData.drawingId || `local-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  drawingData.drawingId = tempId;
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
      const txt = await response.text().catch(() => response.statusText);
      throw new Error(`Failed to submit data: ${response.status} ${txt}`);
    }

    const result = await response.json();
    return { success: result.status === "success", result, tempId };
  } catch (error) {
    console.error("Error submitting data to backend:", error);
    return { success: false, error, tempId };
  }
};

/**
 * Refresh the canvas data from backend (room-aware, robust decoding)
 */
export async function refreshCanvas(from, userData, drawAllDrawings, start, end, options = {}) {
  let apiUrl = `${API_BASE}/getCanvasData`;
  const params = [];
  if (options && options.roomId) params.push(`roomId=${encodeURIComponent(options.roomId)}`);
  if (from !== undefined && from !== null) params.push(`from=${encodeURIComponent(from)}`);

  // normalize start/end into epoch ms integers (backend expects numbers)
  const normalizeTime = (val) => {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'number') return val;
    const n = Number(val);
    return isNaN(n) ? new Date(val).getTime() : n;
  };

  const s = normalizeTime(start);
  const e = normalizeTime(end);
  if (s !== null && !isNaN(s)) params.push(`start=${encodeURIComponent(s)}`);
  if (e !== null && !isNaN(e)) params.push(`end=${encodeURIComponent(e)}`);
  if (params.length) apiUrl += `?${params.join('&')}`;

  // peel nested JSON: value -> { value: "..." } -> { roomId, ... }
  const deepParse = (v, maxDepth = 6) => {
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
      if (obj.$numberInt) return Number(obj.$numberInt);
      for (const k in obj) {
        try { obj[k] = normalizeNumberLong(obj[k]); } catch (_) { /* ignore */ }
      }
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
    userData.drawings.sort((a, b) => (a.order || a.timestamp) - (b.order || b.timestamp));

    // Draw everything using provided callback (UI should be responsible for errors)
    if (typeof drawAllDrawings === 'function') {
      try { drawAllDrawings(); } catch (err) { console.warn('drawAllDrawings threw:', err); }
    }

    return userData.drawings.length;
  } catch (error) {
    console.error("Error refreshing canvas:", error);
    return userData.drawings ? userData.drawings.length : 0;
  }
}

/**
 * Clear the backend canvas (room-aware)
 */
export const clearBackendCanvas = async ({ roomId } = {}) => {
  const ts = Date.now();
  const payload = { ts: ts };
  if (roomId) payload.roomId = roomId;
  const apiUrl = `${API_BASE}/submitClearCanvasTimestamp`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Failed to submit clear: ${response.status} ${text}`);
  }
  return response.json();
};

/**
 * Check Undo/Redo availability (best-effort)
 */
export const checkUndoRedoAvailability = async (currentUser, setUndoAvailable, setRedoAvailable) => {
  try {
    if (currentUser) {
      // roomId is encoded as prefix in currentUser in some flows; fallback to empty string
      const roomParam = encodeURIComponent((currentUser.split && currentUser.split('|')[0]) || '');
      const response = await fetch(`${API_BASE}/getCanvasData?roomId=${roomParam}`);
      if (!response.ok) {
        if (typeof setUndoAvailable === "function") setUndoAvailable(false);
        if (typeof setRedoAvailable === "function") setRedoAvailable(false);
      }
      // availability is ultimately determined by stacks in Canvas.js
    } else {
      if (typeof setUndoAvailable === "function") setUndoAvailable(false);
      if (typeof setRedoAvailable === "function") setRedoAvailable(false);
    }
  } catch (error) {
    console.error(`Error during checkUndoRedoAvailability: ${error}`);
    if (typeof setUndoAvailable === "function") setUndoAvailable(false);
    if (typeof setRedoAvailable === "function") setRedoAvailable(false);
  }
};

/**
 * Undo action handler (robust: handles composite actions, redis clear edge-cases)
 */
export const undoAction = async ({
  currentUser,
  undoStack,
  setUndoStack,
  setRedoStack,
  userData,
  refreshCanvasButtonHandler,
  checkUndoRedoAvailability, // not used here but kept for compatibility
  roomId
}) => {
  if (!Array.isArray(undoStack) || undoStack.length === 0) return;

  const lastAction = undoStack[undoStack.length - 1];

  try {
    const callUndoBackend = async (times = 1) => {
      for (let i = 0; i < times; i++) {
        const response = await fetch(`${API_BASE}/undo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUser, roomId }),
        });
        if (!response.ok) throw new Error(`Undo failed: ${response.statusText}`);
        const result = await response.json();
        if (result.status !== "success") {
          // if backend clears cache it might return undefined message; propagate to caller
          const message = result.message || result.error || '';
          throw new Error(message || 'Undo failed');
        }
      }
    };

    if (lastAction.type === 'cut') {
      // composite: call backend multiple times
      await callUndoBackend(lastAction.backendCount || 1);

      // remove replacement segments and cut record
      userData.drawings = userData.drawings.filter(drawing => {
        if (drawing.drawingId === lastAction.cutRecord?.drawingId) return false;
        for (const repArr of Object.values(lastAction.replacementSegments || {})) {
          if (repArr.some(rep => rep.drawingId === drawing.drawingId)) return false;
        }
        return true;
      });

      // restore originals
      (lastAction.affectedDrawings || []).forEach(original => {
        if (original) userData.drawings.push(original);
      });
    } else if (lastAction.type === 'paste') {
      await callUndoBackend(lastAction.backendCount || 1);

      // remove pasted drawings locally
      userData.drawings = userData.drawings.filter(drawing =>
        !(lastAction.pastedDrawings || []).some(pasted => pasted.drawingId === drawing.drawingId)
      );
    } else {
      // normal stroke - remove locally then call backend undo
      userData.drawings = userData.drawings.filter(
        (drawing) => drawing.drawingId !== lastAction.drawingId
      );

      await callUndoBackend(1);
    }

    // update stacks
    const newUndoStack = Array.isArray(undoStack) ? undoStack.slice(0, undoStack.length - 1) : [];
    if (typeof setUndoStack === "function") setUndoStack(newUndoStack);
    if (typeof setRedoStack === "function") setRedoStack(prev => Array.isArray(prev) ? [...prev, lastAction] : [lastAction]);
  } catch (error) {
    const errMsg = (error && error.message) ? error.message : String(error);
    console.error("Undo failed:", errMsg);

    // If backend returned undefined/empty message it may indicate the undo cache was cleared (redis flush)
    if (!error || !error.message || error.message === 'undefined') {
      console.warn("Undo cache appears cleared - resetting local undo/redo state");
    }

    // Always clear both stacks on catastrophic failure to keep UI consistent
    if (typeof setUndoStack === "function") setUndoStack([]);
    if (typeof setRedoStack === "function") setRedoStack([]);
  } finally {
    // refresh UI and re-check availability if handler provided
    try { typeof refreshCanvasButtonHandler === 'function' && refreshCanvasButtonHandler(); } catch (e) { /* ignore */ }
  }
};

/**
 * Redo action handler (robust)
 */
export const redoAction = async ({
  currentUser,
  redoStack,
  setRedoStack,
  setUndoStack,
  userData,
  refreshCanvasButtonHandler,
  checkUndoRedoAvailability,
  roomId
}) => {
  if (!Array.isArray(redoStack) || redoStack.length === 0) return;

  const lastUndone = redoStack[redoStack.length - 1];

  try {
    const callRedoBackend = async (times = 1) => {
      for (let i = 0; i < times; i++) {
        const response = await fetch(`${API_BASE}/redo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUser, roomId }),
        });
        if (!response.ok) throw new Error(`Redo failed: ${response.statusText}`);
        const result = await response.json();
        if (result.status !== "success") {
          const message = result.message || result.error || '';
          throw new Error(message || 'Redo failed');
        }
      }
    };

    if (lastUndone.type === 'cut') {
      await callRedoBackend(lastUndone.backendCount || 1);

      // remove originals
      (lastUndone.affectedDrawings || []).forEach(original => {
        userData.drawings = userData.drawings.filter(drawing => drawing.drawingId !== original.drawingId);
      });

      // add replacement segments
      Object.values(lastUndone.replacementSegments || {}).forEach(segments => {
        (segments || []).forEach(seg => userData.drawings.push(seg));
      });

      // add cut record
      if (lastUndone.cutRecord && typeof userData.addDrawing === 'function') {
        userData.addDrawing(lastUndone.cutRecord);
      } else if (lastUndone.cutRecord) {
        userData.drawings.push(lastUndone.cutRecord);
      }
    } else if (lastUndone.type === 'paste') {
      await callRedoBackend(lastUndone.backendCount || 1);
      (lastUndone.pastedDrawings || []).forEach(pd => userData.drawings.push(pd));
    } else {
      // normal stroke
      userData.drawings.push(lastUndone);
      await callRedoBackend(1);
    }

    // update stacks
    const newRedoStack = redoStack.slice(0, redoStack.length - 1);
    if (typeof setRedoStack === "function") setRedoStack(newRedoStack);
    if (typeof setUndoStack === "function") setUndoStack(prev => Array.isArray(prev) ? [...prev, lastUndone] : [lastUndone]);
  } catch (error) {
    const errMsg = (error && error.message) ? error.message : String(error);
    console.error("Redo failed:", errMsg);

    if (!error || !error.message || error.message === 'undefined') {
      console.warn("Redo cache appears cleared - resetting local undo/redo state");
    }

    if (typeof setRedoStack === "function") setRedoStack([]);
    if (typeof setUndoStack === "function") setUndoStack([]);
  } finally {
    try { typeof refreshCanvasButtonHandler === 'function' && refreshCanvasButtonHandler(); } catch (e) { /* ignore */ }
  }
};

/**
 * Rooms API helpers
 */
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
