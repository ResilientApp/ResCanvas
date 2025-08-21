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
    roomId: options.roomId || undefined,
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

// Refresh the canvas data from backend
export async function refreshCanvas(from, userData, drawAllDrawings, start, end, options = {}) {
  let apiUrl = `${API_BASE}/getCanvasData`;
  const params = [];
  if (options && options.roomId) {
    params.push(`roomId=${encodeURIComponent(options.roomId)}`);
  }
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
      const _err = result.message || JSON.stringify(result);
      throw new Error(`Error in response: ${_err}`);
    }

    // normalize items so frontend sees stable fields even when value is an object or a JSON string,
    // and convert any nested {$numberLong: "..."} that accidentally slipped in.
    function normalizeNumberLong(obj) {
      if (obj && typeof obj === 'object') {
        if (obj.$numberLong) return Number(obj.$numberLong);
        if (obj.$numberInt) return Number(obj.$numberInt);
        for (const k in obj) {
          obj[k] = normalizeNumberLong(obj[k]);
        }
      }
      return obj;
    }

    const backendDrawings = (result.data || []).map(item => {
      let parsed = {};
      if (typeof item.value === 'string') {
        try { parsed = JSON.parse(item.value); } catch (e) { parsed = { raw: item.value }; }
      } else if (typeof item.value === 'object') {
        parsed = item.value;
      } else {
        parsed = { raw: item.value };
      }
      // normalize any number wrappers
      parsed = normalizeNumberLong(parsed);
      const ts = parsed.timestamp || parsed.ts || item.ts || parsed.order || 0;
      const timestamp = (typeof ts === 'object' && ts.$numberLong) ? Number(ts.$numberLong) : Number(ts || 0);

      return {
        drawingId: parsed.drawingId || parsed.id || '',
        color: parsed.color || '#000000',
        lineWidth: parsed.lineWidth || parsed.brushSize || parsed.lineWidth || 5,
        pathData: parsed.pathData || parsed.points || parsed.path || [],
        timestamp: timestamp,
        user: item.user || parsed.user || '',
        order: parsed.order || timestamp || 0,
        raw: parsed
      };
    });

    backendDrawings.sort((a, b) => (a.order || a.timestamp) - (b.order || b.timestamp));

    // MERGE strategy (preserve local pending strokes that aren't yet in backend)
    // Build lookup by drawingId for backend items (authoritative)
    const backendById = new Map();
    backendDrawings.forEach(d => {
      if (d.drawingId) backendById.set(String(d.drawingId), d);
    });

    // Helper to compute a compact fingerprint for drawings lacking stable ids
    function drawingFingerprint(d) {
      try {
        const user = d.user || (d.raw && d.raw.user) || '';
        const ts = d.timestamp || (d.raw && (d.raw.timestamp || d.raw.ts)) || 0;
        const pathLen = Array.isArray(d.pathData) ? d.pathData.length
          : (d.raw && Array.isArray(d.raw.pathData) ? d.raw.pathData.length : 0);
        const firstPoints = (d.pathData && d.pathData.slice(0,3)) || (d.raw && d.raw.pathData && d.raw.pathData.slice(0,3)) || [];
        return `${user}|${ts}|${pathLen}|${JSON.stringify(firstPoints)}`;
      } catch (e) { return `${d.user||''}|${d.timestamp||0}|${Math.random()}`; }
    }

    const backendFingerprints = new Set();
    backendDrawings.forEach(d => backendFingerprints.add(d.drawingId ? String(d.drawingId) : drawingFingerprint(d)));

    // Merge backend drawings (authoritative) and keep local pending ones not on backend
    const local = Array.isArray(userData.drawings) ? userData.drawings : [];
    const merged = [];

    // Start with authoritative backend drawings
    backendDrawings.forEach(d => merged.push(d));

    // Add local drawings that are not present on backend (by id or fingerprint)
    local.forEach(ld => {
      const lid = ld.drawingId ? String(ld.drawingId) : null;
      const fp = drawingFingerprint(ld);
      const alreadyOnBackend = (lid && backendById.has(lid)) || backendFingerprints.has(fp);
      if (!alreadyOnBackend) {
        // Keep local pending strokes so they remain visible until server ack
        merged.push(ld);
      }
    });

    // Sort merged list deterministically (oldest->newest)
    merged.sort((a, b) => ( (a.order || a.timestamp || 0) - (b.order || b.timestamp || 0) ));

    // Commit merged list to userData (do not clobber unrelated metadata)
    userData.drawings = merged;

    drawAllDrawings();
    return backendDrawings.length;
  } catch (error) {
    console.error("Error refreshing canvas:", error);
    return userData.drawings ? userData.drawings.length : 0;
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
