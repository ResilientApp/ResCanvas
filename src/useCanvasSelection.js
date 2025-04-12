// useCanvasSelection.js
import { useState } from 'react';
import ClipperLib from 'clipper-lib';
import { submitToDatabase } from './canvasBackend'; // if needed for cut submission
import { Drawing } from './drawing';

export const useCanvasSelection = (canvasRef, currentUser, userData, generateId, drawAllDrawings) => {
  // State for selection and cut data
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionRect, setSelectionRect] = useState(null);
  const [cutImageData, setCutImageData] = useState(null);
  const [cutOriginalIds, setCutOriginalIds] = useState(new Set());
  const [cutStrokesMap, setCutStrokesMap] = useState({});
  const [eraseInsideSegments, setEraseInsideSegments] = useState(new Set());

  // Utility functions for geometry (copy these from your original code)
  const computeIntersections = (p1, p2, rect) => {
    const intersections = [];
    if (p2.x - p1.x !== 0) {
      const tLeft = (rect.x - p1.x) / (p2.x - p1.x);
      if (tLeft >= 0 && tLeft <= 1) {
        const yLeft = p1.y + tLeft * (p2.y - p1.y);
        if (yLeft >= rect.y && yLeft <= rect.y + rect.height) {
          intersections.push({ t: tLeft, point: { x: rect.x, y: yLeft } });
        }
      }
      const tRight = ((rect.x + rect.width) - p1.x) / (p2.x - p1.x);
      if (tRight >= 0 && tRight <= 1) {
        const yRight = p1.y + tRight * (p2.y - p1.y);
        if (yRight >= rect.y && yRight <= rect.y + rect.height) {
          intersections.push({ t: tRight, point: { x: rect.x + rect.width, y: yRight } });
        }
      }
    }
    if (p2.y - p1.y !== 0) {
      const tTop = (rect.y - p1.y) / (p2.y - p1.y);
      if (tTop >= 0 && tTop <= 1) {
        const xTop = p1.x + tTop * (p2.x - p1.x);
        if (xTop >= rect.x && xTop <= rect.x + rect.width) {
          intersections.push({ t: tTop, point: { x: xTop, y: rect.y } });
        }
      }
      const tBottom = ((rect.y + rect.height) - p1.y) / (p2.y - p1.y);
      if (tBottom >= 0 && tBottom <= 1) {
        const xBottom = p1.x + tBottom * (p2.x - p1.x);
        if (xBottom >= rect.x && xBottom <= rect.x + rect.width) {
          intersections.push({ t: tBottom, point: { x: xBottom, y: rect.y + rect.height } });
        }
      }
    }
    intersections.sort((a, b) => a.t - b.t);
    const unique = [];
    intersections.forEach(inter => {
      if (!unique.some(u => Math.abs(u.t - inter.t) < 1e-6)) {
        unique.push(inter);
      }
    });
    return unique;
  };

  const getOutsideSegments = (points, rect) => {
    const isInside = pt =>
      pt.x >= rect.x && pt.x <= rect.x + rect.width &&
      pt.y >= rect.y && pt.y <= rect.y + rect.height;
    const segments = [];
    let currentSegment = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      if (!isInside(p1)) {
        if (currentSegment.length === 0) currentSegment.push(p1);
      }
      if (isInside(p1) !== isInside(p2)) {
        const inters = computeIntersections(p1, p2, rect);
        if (inters.length > 0) {
          const ip = inters[0].point;
          if (!isInside(p1)) {
            currentSegment.push(ip);
            segments.push(currentSegment);
            currentSegment = [];
          } else {
            currentSegment = [];
            currentSegment.push(ip);
          }
        }
      } else if (!isInside(p1) && !isInside(p2)) {
        if (currentSegment.length > 0) currentSegment.push(p2);
      }
    }
    if (currentSegment.length >= 2) segments.push(currentSegment);
    return segments;
  };

  const getInsideSegments = (points, rect) => {
    const isInside = pt =>
      pt.x >= rect.x && pt.x <= rect.x + rect.width &&
      pt.y >= rect.y && pt.y <= rect.y + rect.height;
    const segments = [];
    let currentSegment = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      if (isInside(p1)) {
        if (currentSegment.length === 0) currentSegment.push(p1);
      }
      if (isInside(p1) !== isInside(p2)) {
        const inters = computeIntersections(p1, p2, rect);
        if (inters.length > 0) {
          const ip = inters[0].point;
          if (isInside(p1)) {
            currentSegment.push(ip);
            segments.push(currentSegment);
            currentSegment = [];
          } else {
            currentSegment = [];
            currentSegment.push(ip);
          }
        }
      } else if (isInside(p1) && isInside(p2)) {
        if (currentSegment.length > 0) currentSegment.push(p2);
      }
    }
    if (currentSegment.length >= 2) segments.push(currentSegment);
    return segments;
  };

  const ensureClosedPolygon = (points) => {
    const pts = points.slice();
    if (pts.length > 0) {
      const first = pts[0];
      const last = pts[pts.length - 1];
      if (Math.abs(first.x - last.x) > 1e-6 || Math.abs(first.y - last.y) > 1e-6) {
        pts.push(first);
      }
    }
    return pts;
  };

  const clipPolygonEdge = (polygon, rect, edge) => {
    const outputList = [];
    const len = polygon.length;
    for (let i = 0; i < len; i++) {
      const current = polygon[i];
      const prev = polygon[(i - 1 + len) % len];
      const currentInside = isInsideEdge(current, rect, edge);
      const prevInside = isInsideEdge(prev, rect, edge);
      if (currentInside) {
        if (!prevInside) {
          const ip = computeIntersectionEdge(prev, current, rect, edge);
          if (ip) outputList.push(ip);
        }
        outputList.push(current);
      } else if (prevInside) {
        const ip = computeIntersectionEdge(prev, current, rect, edge);
        if (ip) outputList.push(ip);
      }
    }
    return outputList;
  };

  const isInsideEdge = (pt, rect, edge) => {
    switch (edge) {
      case 'left':   return pt.x >= rect.x;
      case 'right':  return pt.x <= rect.x + rect.width;
      case 'top':    return pt.y >= rect.y;
      case 'bottom': return pt.y <= rect.y + rect.height;
      default:       return false;
    }
  };

  const computeIntersectionEdge = (p1, p2, rect, edge) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    let t = 0;
    switch (edge) {
      case 'left':   t = (rect.x - p1.x) / dx; break;
      case 'right':  t = ((rect.x + rect.width) - p1.x) / dx; break;
      case 'top':    t = (rect.y - p1.y) / dy; break;
      case 'bottom': t = ((rect.y + rect.height) - p1.y) / dy; break;
      default:       return null;
    }
    if (t < 0 || t > 1) return null;
    return { x: p1.x + t * dx, y: p1.y + t * dy };
  };

  const getInsidePolygon = (polygon, rect) => {
    let cp = ensureClosedPolygon(polygon);
    cp = clipPolygonEdge(cp, rect, 'left');
    cp = clipPolygonEdge(cp, rect, 'right');
    cp = clipPolygonEdge(cp, rect, 'top');
    cp = clipPolygonEdge(cp, rect, 'bottom');
    return cp;
  };

  const getOutsidePolygonsClosed = (polygon, rect) => {
    const closed = ensureClosedPolygon(polygon);
    return getOutsideSegments(closed, rect);
  };

  // Main handler: processes the current selection into a "cut" operation.
  const handleCutSelection = async () => {
    if (!selectionRect) return;

    // Get canvas context and calculate selection rectangle
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const { start, end } = selectionRect;
    const rectX = Math.min(start.x, end.x);
    const rectY = Math.min(start.y, end.y);
    const rectWidth = Math.abs(end.x - start.x);
    const rectHeight = Math.abs(end.y - start.y);
    if (!(rectWidth && rectHeight)) return;

    setCutImageData([]);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Assume that canvas has been refreshed externally (via drawAllDrawings)

    const cutRect = { x: rectX, y: rectY, width: rectWidth, height: rectHeight };
    let eraseInsideSegmentsNew = [];
    let newCutDrawings = [];
    let updatedDrawings = [];
    let affectedDrawings = [];
    const newCutOriginalIds = new Set(cutOriginalIds);
    const newCutStrokesMap = { ...cutStrokesMap };

    // Process each drawing in userData.drawings
    userData.drawings.forEach((drawing) => {
      // Process freehand strokes (pathData as array of points)
      if (Array.isArray(drawing.pathData)) {
        const points = drawing.pathData;
        const intersects = points.some(pt =>
          pt.x >= cutRect.x &&
          pt.x <= cutRect.x + cutRect.width &&
          pt.y >= cutRect.y &&
          pt.y <= cutRect.y + cutRect.height
        );
        if (!intersects) {
          updatedDrawings.push(drawing);
          return;
        }
        affectedDrawings.push(drawing);
        newCutOriginalIds.add(drawing.drawingId);
        const outsideSegments = getOutsideSegments(points, cutRect);
        const insideSegments = getInsideSegments(points, cutRect);
        const replacementSegments = [];
        outsideSegments.forEach(seg => {
          if (seg.length > 1) {
            const newSeg = new Drawing(generateId(), drawing.color, drawing.lineWidth, seg, Date.now(), drawing.user);
            replacementSegments.push(newSeg);
            updatedDrawings.push(newSeg);
          }
        });
        newCutStrokesMap[drawing.drawingId] = replacementSegments;
        insideSegments.forEach(seg => {
          if (seg.length > 1) {
            const cutSeg = new Drawing(generateId(), drawing.color, drawing.lineWidth, seg, Date.now(), drawing.user);
            newCutDrawings.push(cutSeg);
            const eraseSeg = new Drawing(generateId(), '#ffffff', drawing.lineWidth + 4, seg, Date.now(), drawing.user);
            eraseInsideSegmentsNew.push(eraseSeg);
          }
        });
      }
      // Process shape drawings (where pathData is an object with tool === "shape")
      else if (drawing.pathData && drawing.pathData.tool === "shape") {
        const shapeData = drawing.pathData;
        let shapePoints = [];
        if (shapeData.type === "circle") {
          const center = { x: shapeData.start.x, y: shapeData.start.y };
          const radius = Math.sqrt((shapeData.end.x - shapeData.start.x) ** 2 +
                                   (shapeData.end.y - shapeData.start.y) ** 2);
          const numPoints = 30;
          for (let i = 0; i < numPoints; i++) {
            const angle = (2 * Math.PI * i) / numPoints;
            shapePoints.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
          }
          shapePoints.push(shapePoints[0]);
        } else if (shapeData.type === "rectangle") {
          shapePoints = [
            { x: shapeData.start.x, y: shapeData.start.y },
            { x: shapeData.end.x, y: shapeData.start.y },
            { x: shapeData.end.x, y: shapeData.end.y },
            { x: shapeData.start.x, y: shapeData.end.y },
            { x: shapeData.start.x, y: shapeData.start.y },
          ];
        } else if (shapeData.type === "hexagon") {
          const center = { x: shapeData.start.x, y: shapeData.start.y };
          const radius = Math.sqrt((shapeData.end.x - shapeData.start.x) ** 2 +
                                   (shapeData.end.y - shapeData.start.y) ** 2);
          for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 3 * i;
            shapePoints.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
          }
          shapePoints.push(shapePoints[0]);
        } else if (shapeData.type === "line") {
          shapePoints = [shapeData.start, shapeData.end];
        }
        const intersects = shapePoints.some(pt =>
          pt.x >= cutRect.x &&
          pt.x <= cutRect.x + cutRect.width &&
          pt.y >= cutRect.y &&
          pt.y <= cutRect.y + cutRect.height
        );
        if (!intersects) {
          updatedDrawings.push(drawing);
          return;
        }
        affectedDrawings.push(drawing);
        newCutOriginalIds.add(drawing.drawingId);
        if (shapeData.type !== "line") {
          // --- ClipperLib usage for non-line shapes ---
          const subj = shapePoints.map(pt => ({ X: pt.x, Y: pt.y }));
          const clipPoly = [
            { X: cutRect.x, Y: cutRect.y },
            { X: cutRect.x + cutRect.width, Y: cutRect.y },
            { X: cutRect.x + cutRect.width, Y: cutRect.y + cutRect.height },
            { X: cutRect.x, Y: cutRect.y + cutRect.height },
          ];
          let clipper1 = new ClipperLib.Clipper();
          clipper1.AddPath(subj, ClipperLib.PolyType.ptSubject, true);
          clipper1.AddPath(clipPoly, ClipperLib.PolyType.ptClip, true);
          let insideSolution = new ClipperLib.Paths();
          clipper1.Execute(ClipperLib.ClipType.ctIntersection, insideSolution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
          let clipper2 = new ClipperLib.Clipper();
          clipper2.AddPath(subj, ClipperLib.PolyType.ptSubject, true);
          clipper2.AddPath(clipPoly, ClipperLib.PolyType.ptClip, true);
          let outsideSolution = new ClipperLib.Paths();
          clipper2.Execute(ClipperLib.ClipType.ctDifference, outsideSolution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
          outsideSolution.forEach(poly => {
            if (poly.length >= 3) {
              const newPoly = poly.map(pt => ({ x: pt.X, y: pt.Y }));
              const newSeg = new Drawing(generateId(), drawing.color, drawing.lineWidth, { tool: "shape", type: "polygon", points: newPoly }, Date.now(), drawing.user);
              updatedDrawings.push(newSeg);
              if (!newCutStrokesMap[drawing.drawingId]) newCutStrokesMap[drawing.drawingId] = [];
              newCutStrokesMap[drawing.drawingId].push(newSeg);
            }
          });
          if (insideSolution.length > 0) {
            let maxArea = 0;
            let bestPoly = null;
            insideSolution.forEach(poly => {
              if (poly.length >= 3) {
                let area = Math.abs(ClipperLib.Clipper.Area(poly));
                if (area > maxArea) {
                  maxArea = area;
                  bestPoly = poly;
                }
              }
            });
            if (bestPoly) {
              const insidePoly = bestPoly.map(pt => ({ x: pt.X, y: pt.Y }));
              const cutSeg = new Drawing(generateId(), drawing.color, drawing.lineWidth, { tool: "shape", type: "polygon", points: insidePoly }, Date.now(), drawing.user);
              newCutDrawings.push(cutSeg);
              const eraseSeg = new Drawing(generateId(), '#ffffff', drawing.lineWidth + 4, { tool: "shape", type: "polygon", points: insidePoly }, Date.now(), drawing.user);
              eraseInsideSegmentsNew.push(eraseSeg);
            }
          }
          // --- End ClipperLib usage ---
        } else {
          // For line shapes, process without ClipperLib.
          const outsideSegments = getOutsideSegments(shapePoints, cutRect);
          const insideSegments = getInsideSegments(shapePoints, cutRect);
          const replacementSegments = [];
          outsideSegments.forEach(seg => {
            if (seg.length > 1) {
              const newSeg = new Drawing(generateId(), drawing.color, drawing.lineWidth, { tool: "shape", type: "line", start: seg[0], end: seg[seg.length - 1] }, Date.now(), drawing.user);
              replacementSegments.push(newSeg);
              updatedDrawings.push(newSeg);
            }
          });
          newCutStrokesMap[drawing.drawingId] = replacementSegments;
          insideSegments.forEach(seg => {
            if (seg.length > 1) {
              const cutSeg = new Drawing(generateId(), drawing.color, drawing.lineWidth, { tool: "shape", type: "line", start: seg[0], end: seg[seg.length - 1] }, Date.now(), drawing.user);
              newCutDrawings.push(cutSeg);
              const eraseSeg = new Drawing(generateId(), drawing.color, drawing.lineWidth, { tool: "shape", type: "line", start: seg[0], end: seg[seg.length - 1] }, Date.now(), drawing.user);
              eraseInsideSegmentsNew.push(eraseSeg);
            }
          });
        }
      } else {
        updatedDrawings.push(drawing);
      }
    });

    setCutImageData(newCutDrawings);
    setCutOriginalIds(newCutOriginalIds);
    setCutStrokesMap(newCutStrokesMap);
    setEraseInsideSegments(eraseInsideSegmentsNew);

    // Submit the erase strokes
    for (const eraseStroke of eraseInsideSegmentsNew) {
      try {
        await submitToDatabase(eraseStroke, currentUser);
      } catch (error) {
        console.error("Failed to submit erase stroke:", eraseStroke, error);
      }
    }

    userData.drawings = updatedDrawings;

    const cutRecord = new Drawing(
      generateId(),
      "#FFFFFF",
      1,
      {
        tool: "cut",
        rect: cutRect,
        cut: true,
        originalStrokeIds: Array.from(newCutOriginalIds)
      },
      Date.now(),
      currentUser
    );

    userData.addDrawing(cutRecord);
    await submitToDatabase(cutRecord, currentUser);
    drawAllDrawings();

    const backendCount = 1 + eraseInsideSegmentsNew.length;
    const compositeCutAction = {
      type: 'cut',
      cutRecord: cutRecord,
      eraseStrokes: eraseInsideSegmentsNew,
      affectedDrawings: affectedDrawings,
      replacementSegments: newCutStrokesMap,
      backendCount: backendCount
    };

    // Optionally, you might want to return these results so the caller (Canvas.js) can update its state.
    return { updatedDrawings, compositeCutAction };
  };

  return {
    selectionStart, setSelectionStart,
    selectionRect, setSelectionRect,
    cutImageData, setCutImageData,
    handleCutSelection,
  };
};
