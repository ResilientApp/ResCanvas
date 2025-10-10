import { useState, useRef, useEffect } from 'react';

const PAN_REFRESH_COOLDOWN_MS = 2000;

export function useCanvasPan(mergedRefreshCanvas) {
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOriginRef = useRef({ x: 0, y: 0 });
  const panLastRefreshRef = useRef(0);
  const panRefreshSkippedRef = useRef(false);
  const panEndRefreshTimerRef = useRef(null);
  const pendingPanRefreshRef = useRef(false);

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  useEffect(() => {
    const handleMouseUp = () => {
      setIsPanning(false);
      panOriginRef.current = { ...panOffset };
      try {
        if (panEndRefreshTimerRef.current) {
          clearTimeout(panEndRefreshTimerRef.current);
          panEndRefreshTimerRef.current = null;
        }
        if (panRefreshSkippedRef.current) {
          panRefreshSkippedRef.current = false;
          mergedRefreshCanvas('pan-mouseup-skipped').catch(() => {});
        }
        if (pendingPanRefreshRef.current) {
          pendingPanRefreshRef.current = false;
          mergedRefreshCanvas('pan-mouseup-pending').catch(() => {});
        }
      } catch (e) { }
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [panOffset, mergedRefreshCanvas]);

  const startPan = (e, canvasWidth, canvasHeight) => {
    if (e.button !== 1) return false;
    
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY };
    panOriginRef.current = { ...panOffset };
    
    try {
      const now = Date.now();
      const diff = now - panLastRefreshRef.current;
      if (diff > PAN_REFRESH_COOLDOWN_MS) {
        panLastRefreshRef.current = now;
        mergedRefreshCanvas('pan-start').catch(() => {});
      } else {
        panRefreshSkippedRef.current = true;
        if (panEndRefreshTimerRef.current) clearTimeout(panEndRefreshTimerRef.current);
        panEndRefreshTimerRef.current = setTimeout(() => {
          if (panRefreshSkippedRef.current) {
            panRefreshSkippedRef.current = false;
            panLastRefreshRef.current = Date.now();
            mergedRefreshCanvas('pan-deferred').catch(() => {});
          }
          panEndRefreshTimerRef.current = null;
        }, Math.max(200, PAN_REFRESH_COOLDOWN_MS - diff));
      }
    } catch (e) {
      mergedRefreshCanvas().catch(() => {});
    }
    
    return true;
  };

  const handlePan = (e, canvasWidth, canvasHeight) => {
    if (!isPanning) return;

    if (!(e.buttons & 4)) {
      setIsPanning(false);
      panOriginRef.current = { ...panOffset };
      return;
    }

    const deltaX = e.clientX - panStartRef.current.x;
    const deltaY = e.clientY - panStartRef.current.y;
    let newX = panOriginRef.current.x + deltaX;
    let newY = panOriginRef.current.y + deltaY;
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;

    const minX = containerWidth - canvasWidth;
    const minY = containerHeight - canvasHeight;

    newX = clamp(newX, minX, 0);
    newY = clamp(newY, minY, 0);

    setPanOffset({ x: newX, y: newY });
  };

  return {
    panOffset,
    setPanOffset,
    isPanning,
    setIsPanning,
    startPan,
    handlePan,
    panStartRef,
    panOriginRef,
    pendingPanRefreshRef
  };
}
