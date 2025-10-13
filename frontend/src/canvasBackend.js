const API_BASE = "http://127.0.0.1:10010";

/**
 * Submit a new drawing to the backend (with optimistic/local ID support)
 */
export const submitToDatabase = async (drawingData, currentUser, options = {}) => {
  const tempId =
    drawingData.drawingId ||
    `local-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  drawingData.drawingId = tempId;
  drawingData._local = true;

  const apiPayload = {
    ts: drawingData.timestamp,
    value: JSON.stringify(drawingData),
    user: currentUser,
    deletion_date_flag: "",
    roomId: options.roomId ?? null,
    signature: options.signature || undefined,
    signerPubKey: options.signerPubKey || undefined,
  };

  const apiUrl = options.roomId
    ? `${API_BASE}/submitNewLineRoom`
    : `${API_BASE}/submitNewLine`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiPayload),
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
export async function refreshCanvas(
  from,
  userData,
  drawAllDrawings,
  start,
  end,
  options = {}
) {
  let apiUrl = `${API_BASE}/getCanvasData`;
  const params = [];

  if (options.roomId) params.push(`roomId=${encodeURIComponent(options.roomId)}`);
  if (from !== undefined && from !== null) params.push(`from=${encodeURIComponent(from)}`);

  // normalize start/end into epoch ms integers
  const normalizeTime = (val) => {
    if (val === undefined || val === null || val === "") return null;
    if (typeof val === "number") return val;
    const n = Number(val);
    return isNaN(n) ? new Date(val).getTime() : n;
  };

  const s = normalizeTime(start);
  const e = normalizeTime(end);
  if (!isNaN(s) && s) params.push(`start=${encodeURIComponent(s)}`);
  if (!isNaN(e) && e) params.push(`end=${encodeURIComponent(e)}`);
  if (params.length) apiUrl += `?${params.join("&")}`;

  // Recursive parse helper
  const deepParse = (v, maxDepth = 5) => {
    let cur = v,
      depth = 0;
    while (depth < maxDepth) {
      if (cur instanceof Uint8Array) {
        try {
          cur = new TextDecoder().decode(cur);
        } catch {
          break;
        }
      }
      if (typeof cur === "string") {
        try {
          cur = JSON.parse(cur);
        } catch {
          break;
        }
      } else if (cur && typeof cur === "object") {
        if (Object.prototype.hasOwnProperty.call(cur, "value")) {
          cur = cur.value;
          depth++;
          continue;
        }
        return cur;
      } else break;
      depth++;
    }
    return cur && typeof cur === "object" ? cur : {};
  };

  const normalizeNumberLong = (obj) => {
    if (obj && typeof obj === "object") {
      if (obj.$numberLong) return Number(obj.$numberLong);
      if (obj.$numberInt) return Number(obj.$numberInt);
      for (const k in obj) obj[k] = normalizeNumberLong(obj[k]);
    }
    return obj;
  };

  try {
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) throw new Error(`Failed to fetch canvas data: ${response.statusText}`);

    const result = await response.json();
    if (result.status !== "success") {
      throw new Error(`Error in response: ${result.message || JSON.stringify(result)}`);
    }

    const backendDrawings = (result.data || []).map((item) => {
      let parsed = {};
      if (item && typeof item === "object") {
        parsed = deepParse(item.value);
        if (!parsed || Object.keys(parsed).length === 0) {
          if (typeof item.value === "string") {
            try {
              parsed = JSON.parse(item.value);
            } catch {
              parsed = {};
            }
          } else if (typeof item.value === "object") parsed = item.value || {};
        }
      }

      parsed = normalizeNumberLong(parsed);

      const rawTs = parsed.timestamp || parsed.ts || item.ts || parsed.order || 0;
      const timestamp =
        typeof rawTs === "object" && rawTs.$numberLong
          ? Number(rawTs.$numberLong)
          : Number(rawTs || 0);

      return {
        drawingId: parsed.drawingId || parsed.id || item.id || "",
        color: parsed.color || "#000000",
        lineWidth: parsed.lineWidth || parsed.brushSize || 5,
        pathData: parsed.pathData || parsed.points || parsed.path || [],
        timestamp,
        user: item.user || parsed.user || "",
        order: parsed.order || timestamp || 0,
        roomId: parsed.roomId || item.roomId || null,
        raw: parsed,
      };
    });

    backendDrawings.sort((a, b) => (a.order || a.timestamp) - (b.order || b.timestamp));

    const targetRoom = options.roomId ?? null;
    const local = Array.isArray(userData.drawings) ? userData.drawings : [];
    const scopedLocal = local.filter((d) => (d?.roomId ?? null) === targetRoom);

    const byId = new Map();
    for (const d of backendDrawings)
      byId.set(d.drawingId || d.raw?.id || Math.random().toString(36), d);
    for (const d of scopedLocal) {
      const key = d.drawingId || d.raw?.id || Math.random().toString(36);
      if (!byId.has(key)) byId.set(key, d);
    }

    userData.drawings = Array.from(byId.values()).sort(
      (a, b) => (a.order || a.timestamp) - (b.order || b.timestamp)
    );

    drawAllDrawings();
    return userData.drawings.length;
  } catch (error) {
    console.error("Error refreshing canvas:", error);
    return userData.drawings ? userData.drawings.length : 0;
  }
}

/**
 * Clear the backend canvas for a specific room or globally
 */
export const clearBackendCanvas = async ({ roomId } = {}) => {
  const ts = Date.now();
  const payload = { ts };
  if (roomId) payload.roomId = roomId;

  const apiUrl = `${API_BASE}/submitClearCanvasTimestamp`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to submit clear: ${response.status} ${text}`);
  }
  return response.json();
};

/**
 * Check Undo/Redo availability
 */
export const checkUndoRedoAvailability = async (
  currentUser,
  setUndoAvailable,
  setRedoAvailable
) => {
  try {
    if (currentUser) {
      const response = await fetch(
        `${API_BASE}/getCanvasData?roomId=${encodeURIComponent(
          currentUser.split("|")[0] || ""
        )}`
      );
      if (!response.ok) {
        setUndoAvailable?.(false);
        setRedoAvailable?.(false);
      }
    } else {
      setUndoAvailable?.(false);
      setRedoAvailable?.(false);
    }
  } catch (error) {
    console.error("Error during checkUndoRedoAvailability:", error);
    setUndoAvailable?.(false);
    setRedoAvailable?.(false);
  }
};

/**
 * Undo action handler
 */
export const undoAction = async ({
  currentUser,
  undoStack,
  setUndoStack,
  setRedoStack,
  userData,
  refreshCanvasButtonHandler,
  roomId,
}) => {
  if (undoStack.length === 0) return;

  const lastAction = undoStack[undoStack.length - 1];

  try {
    const callUndoBackend = async (times = 1) => {
      for (let i = 0; i < times; i++) {
        const res = await fetch(`${API_BASE}/undo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUser, roomId }),
        });
        if (!res.ok) throw new Error(`Undo failed: ${res.statusText}`);
        const result = await res.json();
        if (result.status !== "success") throw new Error(result.message || "Undo failed");
      }
    };

    if (lastAction.type === "cut") {
      await callUndoBackend(lastAction.backendCount);

      userData.drawings = userData.drawings.filter((drawing) => {
        if (drawing.drawingId === lastAction.cutRecord.drawingId) return false;
        for (const repArr of Object.values(lastAction.replacementSegments)) {
          if (repArr.some((rep) => rep.drawingId === drawing.drawingId)) return false;
        }
        return true;
      });

      lastAction.affectedDrawings.forEach((original) => userData.drawings.push(original));
    } else if (lastAction.type === "paste") {
      await callUndoBackend(lastAction.backendCount);

      userData.drawings = userData.drawings.filter(
        (drawing) =>
          !lastAction.pastedDrawings.some(
            (pasted) => pasted.drawingId === drawing.drawingId
          )
      );
    } else {
      userData.drawings = userData.drawings.filter(
        (drawing) => drawing.drawingId !== lastAction.drawingId
      );
      await callUndoBackend();
    }

    setUndoStack(undoStack.slice(0, -1));
    setRedoStack((prev) => [...prev, lastAction]);
  } catch (error) {
    console.error("Undo failed:", error.message);
    setUndoStack([]);
    setRedoStack([]);
  } finally {
    refreshCanvasButtonHandler();
  }
};

/**
 * Redo action handler
 */
export const redoAction = async ({
  currentUser,
  redoStack,
  setRedoStack,
  setUndoStack,
  userData,
  refreshCanvasButtonHandler,
  roomId,
}) => {
  if (redoStack.length === 0) return;

  const lastUndone = redoStack[redoStack.length - 1];

  try {
    const callRedoBackend = async (times = 1) => {
      for (let i = 0; i < times; i++) {
        const res = await fetch(`${API_BASE}/redo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUser, roomId }),
        });
        if (!res.ok) throw new Error(`Redo failed: ${res.statusText}`);
        const result = await res.json();
        if (result.status !== "success") throw new Error(result.message || "Redo failed");
      }
    };

    if (lastUndone.type === "cut") {
      await callRedoBackend(lastUndone.backendCount);

      lastUndone.affectedDrawings.forEach((original) => {
        userData.drawings = userData.drawings.filter(
          (drawing) => drawing.drawingId !== original.drawingId
        );
      });

      Object.values(lastUndone.replacementSegments).forEach((segments) =>
        segments.forEach((seg) => userData.drawings.push(seg))
      );

      userData.addDrawing?.(lastUndone.cutRecord);
    } else if (lastUndone.type === "paste") {
      await callRedoBackend(lastUndone.backendCount);
      lastUndone.pastedDrawings.forEach((pd) => userData.drawings.push(pd));
    } else {
      userData.drawings.push(lastUndone);
      await callRedoBackend();
    }

    setRedoStack(redoStack.slice(0, -1));
    setUndoStack((prev) => [...prev, lastUndone]);
  } catch (error) {
    console.error("Redo failed:", error.message);
    setRedoStack([]);
    setUndoStack([]);
  } finally {
    refreshCanvasButtonHandler();
  }
};

/**
 * Room management helpers
 */
export async function listRooms(currentUser) {
  try {
    const res = await fetch(
      `${API_BASE}/rooms?user=${encodeURIComponent(currentUser)}`,
      { method: "GET" }
    );
    return await res.json();
  } catch (e) {
    console.error("listRooms error", e);
    return { status: "error", rooms: [] };
  }
}

export async function createRoom({ name, type, currentUser }) {
  try {
    const res = await fetch(`${API_BASE}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type, user: currentUser }),
    });
    return await res.json();
  } catch (e) {
    console.error("createRoom error", e);
    return { status: "error" };
  }
}
