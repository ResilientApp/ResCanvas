import { useState } from 'react';

export function useHistoryMode() {
  const [historyMode, setHistoryMode] = useState(false);
  const [historyRange, setHistoryRange] = useState(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyStartInput, setHistoryStartInput] = useState('');
  const [historyEndInput, setHistoryEndInput] = useState('');

  const openHistoryDialog = () => {
    const fmt = (ms) => {
      if (!ms || !Number.isFinite(ms)) return '';
      const d = new Date(ms);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    if (historyRange && historyRange.start && historyRange.end) {
      setHistoryStartInput(fmt(historyRange.start));
      setHistoryEndInput(fmt(historyRange.end));
    } else {
      setHistoryStartInput(historyStartInput || '');
      setHistoryEndInput(historyEndInput || '');
    }

    setHistoryDialogOpen(true);
  };

  const applyHistoryRange = async (startMs, endMs, showSnack, clearCanvasForRefresh, backendRefreshCanvas, userData, drawAllDrawings, serverCountRef, currentRoomId, auth) => {
    const start = startMs !== undefined ? startMs : (historyStartInput ? (new Date(historyStartInput)).getTime() : NaN);
    const end = endMs !== undefined ? endMs : (historyEndInput ? (new Date(historyEndInput)).getTime() : NaN);

    if (isNaN(start) || isNaN(end)) {
      showSnack("Please select both start and end date/time before applying History Recall.");
      return;
    }
    if (start > end) {
      showSnack("Invalid time range selected. Make sure start <= end.");
      return;
    }

    setHistoryRange({ start, end });

    await clearCanvasForRefresh();
    setHistoryRange({ start, end });
    try {
      const backendCount = await backendRefreshCanvas(
        serverCountRef.current,
        userData,
        drawAllDrawings,
        start,
        end,
        { roomId: currentRoomId, auth }
      );
      serverCountRef.current = backendCount;
      
      if (!userData.drawings || userData.drawings.length === 0) {
        setHistoryRange(null);
        showSnack("No drawings were found in that date/time range. Please select another range or exit history recall mode.");
        return;
      }
      setHistoryMode(true);
      setHistoryDialogOpen(false);
    } catch (e) {
      console.error("Error applying history range:", e);
      setHistoryRange(null);
      showSnack("An error occurred while loading history. See console for details.");
    }
  };

  const exitHistoryMode = async (clearCanvasForRefresh, backendRefreshCanvas, userData, drawAllDrawings, serverCountRef, currentRoomId, auth) => {
    setHistoryMode(false);
    setHistoryRange(null);
    try {
      await clearCanvasForRefresh();
      serverCountRef.current = await backendRefreshCanvas(
        serverCountRef.current,
        userData,
        drawAllDrawings,
        undefined,
        undefined,
        { roomId: currentRoomId, auth }
      );
    } catch (e) {
      console.error("Error exiting history mode:", e);
    }
  };

  return {
    historyMode,
    setHistoryMode,
    historyRange,
    setHistoryRange,
    historyDialogOpen,
    setHistoryDialogOpen,
    historyStartInput,
    setHistoryStartInput,
    historyEndInput,
    setHistoryEndInput,
    openHistoryDialog,
    applyHistoryRange,
    exitHistoryMode
  };
}
