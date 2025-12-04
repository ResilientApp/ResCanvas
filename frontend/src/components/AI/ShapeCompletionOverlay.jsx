import { Box, IconButton } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

export default function ShapeCompletionOverlay({
    open = false,
    suggestion = null,
    anchor = null,
    panOffset = { x: 0, y: 0 },
    canvasWidth,
    canvasHeight,
    onAccept = () => {},
    onReject = () => {},
}) {
    if (!open || !suggestion || !suggestion.object || !suggestion.object.pathData) {
        return null;
    }

    const { object } = suggestion;
    const { pathData } = object;

    // Compute bounding box and center from the suggestion.pathData.
    // We handle both:
    // - Freehand strokes / polygons: pathData.points[]
    // - Basic shapes (line/circle/rectangle) with start/end
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const updateBounds = (x, y) => {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    };

    if (Array.isArray(pathData.points) && pathData.points.length > 0) {
        // Stroke or polygon: walk through all points
        for (const pt of pathData.points) {
            if (!pt) continue;
            const px = pt.x ?? 0;
            const py = pt.y ?? 0;
            updateBounds(px, py);
        }
    } else if (pathData.start && pathData.end) {
        // Basic shape / line / circle using start / end
        if (typeof pathData.start.x === 'number' && typeof pathData.start.y === 'number') {
            updateBounds(pathData.start.x, pathData.start.y);
        }
        if (typeof pathData.end.x === 'number' && typeof pathData.end.y === 'number') {
            updateBounds(pathData.end.x, pathData.end.y);
        }
    }

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
        return null;
    }

    const shapeWidth = maxX - minX || 1;
    const shapeHeight = maxY - minY || 1;

    const shapeCenterX = minX + shapeWidth / 2;
    const shapeCenterY = minY + shapeHeight / 2;

    // If we have an anchor (the user's last drag or cursor), try to align around it.
    let overlayCenterX = shapeCenterX + panOffset.x;
    let overlayCenterY = shapeCenterY + panOffset.y;

    // Clamp inside canvas
    const halfBoxW = 120;
    const halfBoxH = 40;

    if (typeof canvasWidth === 'number') {
        overlayCenterX = Math.max(halfBoxW, Math.min(canvasWidth - halfBoxW, overlayCenterX));
    }
    if (typeof canvasHeight === 'number') {
        overlayCenterY = Math.max(halfBoxH, Math.min(canvasHeight - halfBoxH, overlayCenterY));
    }

    const overlayLeft = overlayCenterX - halfBoxW;
    const overlayTop = overlayCenterY - halfBoxH;

    // Helper: label for the suggestion, e.g. "Complete rectangle" or "Refine stroke"
    const getSuggestionLabel = () => {
        const tool = pathData.tool;
        const type = pathData.type;

        if (tool === 'freehand' || type === 'stroke') {
            return 'Refine stroke?';
        }
        if (['rectangle', 'circle', 'line', 'polygon'].includes(type)) {
            return `Complete ${type}?`;
        }
        return 'Apply suggestion?';
    };

    return (
        <>
            {/* Outline of the suggested shape area (visual hint) */}
            <Box
                sx={{
                    position: 'absolute',
                    left: minX + panOffset.x,
                    top: minY + panOffset.y,
                    width: shapeWidth,
                    height: shapeHeight,
                    border: '1px dashed rgba(255,255,255,0.4)',
                    borderRadius: 1,
                    pointerEvents: 'none',
                    boxSizing: 'border-box',
                    zIndex: 90,
                }}
            />

            {/* Floating confirmation box near the suggestion */}
            <Box
                sx={{
                    position: 'absolute',
                    left: overlayLeft,
                    top: overlayTop,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    padding: '6px 10px',
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    borderRadius: 999,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                    zIndex: 100,
                    backdropFilter: 'blur(4px)',
                }}
            >
                <Box
                    sx={{
                        color: '#FFFFFF',
                        fontSize: 12,
                        marginRight: 0.5,
                        maxWidth: 160,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}
                >
                    {getSuggestionLabel()}
                </Box>

                <IconButton
                    size="small"
                    sx={{
                        color: '#A5D6A7',
                        '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                    }}
                    onClick={onAccept}
                >
                    <CheckIcon fontSize="small" />
                </IconButton>
                <IconButton
                    size="small"
                    sx={{
                        color: '#EF9A9A',
                        '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                    }}
                    onClick={onReject}
                >
                    <CloseIcon fontSize="small" />
                </IconButton>
            </Box>
        </>
    );
}
