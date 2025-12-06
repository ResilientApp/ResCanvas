import { useEffect, useState } from 'react';
import { Box, IconButton } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useAIAssistant } from '../../hooks/useAIAssistant';

export default function ShapeCompletionOverlay({
  enabled = false,
  trigger = 0,
  userData,
  pendingDrawings,
  editingEnabled,
  canvasWidth,
  canvasHeight,
  panOffset = { x: 0, y: 0 },
  getVisibleCanvasBounds,
  addAIGeneratedObjects = () => {},
  showLocalSnack = () => {},
}) {
  const { shapeCompletion } = useAIAssistant();

  const [suggestion, setSuggestion] = useState(null);
  const [anchor, setAnchor] = useState(null);

  // Finds where in the drawings to place the suggestion
  const computeSuggestionAnchor = (pathData) => {
    if (Array.isArray(pathData?.points) && pathData.points.length > 0) {
      const xs = pathData.points.map((p) => p.x);
      const ys = pathData.points.map((p) => p.y);
      return {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      };
    }

    if (pathData?.start && pathData?.end) {
      return {
        x: (pathData.start.x + pathData.end.x) / 2,
        y: (pathData.start.y + pathData.end.y) / 2,
      };
    }

    return { x: canvasWidth / 2, y: canvasHeight / 2 };
  };

  useEffect(() => {
    if (!enabled) return;
    if (!editingEnabled) {
      showLocalSnack('Shape completion is disabled in view-only mode.');
      return;
    }

    const handleCompletion = async () => {
      try {
        const bounds = getVisibleCanvasBounds();
        const canvasState = {
          drawings: [
            ...(userData?.drawings || []),
            ...(pendingDrawings || []),
          ],
          bounds: {
            width: bounds?.width || canvasWidth,
            height: bounds?.height || canvasHeight,
          },
        };

        // API Call for completion
        const s = await shapeCompletion(canvasState);
        if (!s || s.error || !s.object) {
          showLocalSnack('AI could not infer a shape.');
          setSuggestion(null);
          setAnchor(null);
          return;
        }

        const { pathData } = s.object || {};
        const a = computeSuggestionAnchor(pathData);
        setSuggestion(s);
        setAnchor(a);
      } catch (e) {
        console.error('Shape completion error:', e);
        showLocalSnack('Unexpected error during shape completion.');
        setSuggestion(null);
        setAnchor(null);
      }
    };

    if (trigger > 0) {
      handleCompletion();
    }
  }, [
    trigger,
    enabled,
  ]);

  useEffect(() => {
    if (!enabled) {
      setSuggestion(null);
      setAnchor(null);
    }
  }, [enabled]);

  const handleAccept = async () => {
    if (!suggestion?.object) return;
    await addAIGeneratedObjects([suggestion.object]);
    setSuggestion(null);
    setAnchor(null);
  };

  const handleReject = () => {
    setSuggestion(null);
    setAnchor(null);
  };

  if (
    !enabled ||
    !suggestion ||
    !suggestion.object ||
    !suggestion.object.pathData
  ) {
    return null;
  }

  const { object } = suggestion;
  const { pathData } = object;

  const strokeColor = object.color || '#00A0FF';
  const strokeWidth = object.lineWidth || 2;
  const ghostOpacity = 0.25;

  const ax = (anchor?.x ?? canvasWidth / 2) + panOffset.x;
  const ay = (anchor?.y ?? canvasHeight / 2) + panOffset.y;

  const renderShape = () => {
    const t = pathData.type;
    const tool = pathData.tool || 'shape';

    if (
      tool === 'freehand' &&
      t === 'stroke' &&
      Array.isArray(pathData.points) &&
      pathData.points.length > 1
    ) {
      const pointsAttr = pathData.points.map((p) => `${p.x},${p.y}`).join(' ');
      return (
        <polyline
          points={pointsAttr}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={ghostOpacity}
        />
      );
    }

    if (['line', 'circle', 'rectangle'].includes(t) && pathData.start && pathData.end) {
      const { start, end } = pathData;

      if (t === 'line') {
        return (
          <line
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={ghostOpacity}
          />
        );
      }

      if (t === 'circle') {
        const cx = (start.x + end.x) / 2;
        const cy = (start.y + end.y) / 2;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const r = Math.sqrt(dx * dx + dy * dy);

        return (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            opacity={ghostOpacity}
          />
        );
      }

      if (t === 'rectangle') {
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);

        return (
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            opacity={ghostOpacity}
          />
        );
      }
    }

    if (t === 'polygon' && Array.isArray(pathData.points) && pathData.points.length > 1) {
      const pointsAttr = pathData.points.map((p) => `${p.x},${p.y}`).join(' ');
      return (
        <polyline
          points={pointsAttr}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={ghostOpacity}
        />
      );
    }

    if (t === 'text' && typeof pathData.text === 'string' && pathData.start) {
      return (
        <text
          x={pathData.start.x}
          y={pathData.start.y}
          fill={strokeColor}
          fontSize={16}
          opacity={ghostOpacity}
        >
          {pathData.text}
        </text>
      );
    }

    return null;
  };

  return (
    <>
      <svg
        width={canvasWidth}
        height={canvasHeight}
        style={{
          position: 'absolute',
          left: panOffset.x,
          top: panOffset.y,
          pointerEvents: 'none',
          zIndex: 998,
        }}
      >
        {renderShape()}
      </svg>

      <Box
        sx={{
          position: 'absolute',
          left: ax,
          top: ay,
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          gap: 0.5,
          zIndex: 999,
          backgroundColor: 'rgba(0,0,0,0.45)',
          borderRadius: 999,
          padding: '2px 4px',
        }}
      >
        <IconButton
          size="small"
          sx={{
            color: '#A5D6A7',
            '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
          }}
          onClick={handleAccept}
        >
          <CheckIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          sx={{
            color: '#EF9A9A',
            '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
          }}
          onClick={handleReject}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
    </>
  );
}
