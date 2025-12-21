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
            const pointsAttr = pathData.points.map(p => `${p.x},${p.y}`).join(' ');
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
            const pointsAttr = pathData.points.map(p => `${p.x},${p.y}`).join(' ');
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