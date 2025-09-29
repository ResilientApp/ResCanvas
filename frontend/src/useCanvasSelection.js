import { useState } from 'react';
import ClipperLib from 'clipper-lib';
import { submitToDatabase } from './canvasBackendJWT';
import { Drawing } from './drawing';

export function useCanvasSelection(canvasRef, currentUser, userData, generateId, drawAllDrawings, currentRoomId, setUndoAvailable, setRedoAvailable) {
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionRect, setSelectionRect] = useState(null);
  const [cutImageData, setCutImageData] = useState(null);
  const [cutOriginalIds, setCutOriginalIds] = useState(new Set());
  const [cutStrokesMap, setCutStrokesMap] = useState({});

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

  // Main handler to processes current selection into a cut operation.
  const handleCutSelection = async () => {
    if (!selectionRect) return;

    // Get canvas context and calculate selection rectangle
    const { start, end } = selectionRect;
    const rectX = Math.min(start.x, end.x);
    const rectY = Math.min(start.y, end.y);
    const rectWidth = Math.abs(end.x - start.x);
    const rectHeight = Math.abs(end.y - start.y);

    if (!(rectWidth && rectHeight)) return;

    setCutImageData([]);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Assume that canvas has been refreshed externally via drawAllDrawings
    const cutRect = { x: rectX, y: rectY, width: rectWidth, height: rectHeight };
    let eraseInsideSegmentsNew = [];
    let newCutDrawings = [];
    let updatedDrawings = [];
    let affectedDrawings = [];
    const newCutOriginalIds = new Set(cutOriginalIds);
    const newCutStrokesMap = { ...cutStrokesMap };

    userData.drawings.forEach((drawing) => {
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
      else if (drawing.pathData && drawing.pathData.tool === "shape") {
        const shapeData = drawing.pathData;
        let shapePoints = [];

        // start by checking if this is a pasted‐in polygon
        // since pasted shapes come in as { tool: "shape", type:"polygon", points: […] }
        if (shapeData.points && Array.isArray(shapeData.points)) {
          shapePoints = shapeData.points;
        } else if (shapeData.type === "circle") {
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

        // bounding‐box overlap test to catch any slice through the shape
        const xs = shapePoints.map(p => p.x);
        const ys = shapePoints.map(p => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);

        if (
          maxX < cutRect.x ||
          minX > cutRect.x + cutRect.width ||
          maxY < cutRect.y ||
          minY > cutRect.y + cutRect.height
        ) {
          updatedDrawings.push(drawing);
          return;
        }

        affectedDrawings.push(drawing);
        newCutOriginalIds.add(drawing.drawingId);

        if (shapeData.type !== "line") {
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
          } else {
              const [p1, p2] = shapePoints;
              const inters = computeIntersections(p1, p2, cutRect).map(i => i.point);
              const inside = pt =>
                pt.x >= cutRect.x &&
                pt.x <= cutRect.x + cutRect.width &&
                pt.y >= cutRect.y &&
                pt.y <= cutRect.y + cutRect.height;

              let outsideSegs = [], insideSegs = [];

              if (inside(p1) && inside(p2)) {
                // whole line inside, so the entire segment is a cut piece
                insideSegs.push([p1, p2]);
              } else if (inters.length === 2) {
                // line crosses box boundary twice, so it is inside between those two points
                insideSegs.push([inters[0], inters[1]]);
                outsideSegs.push([p1, inters[0]], [inters[1], p2]);
              } else if (inters.length === 1) {
                // one endpoint inside, so lets split at that intersection
                if (inside(p1)) {
                  insideSegs.push([p1, inters[0]]);
                  outsideSegs.push([inters[0], p2]);
                } else {
                  insideSegs.push([inters[0], p2]);
                  outsideSegs.push([p1, inters[0]]);
                }
              } else {
                updatedDrawings.push(drawing);
                newCutStrokesMap[drawing.drawingId] = [];
                return;
              }

              const replacementSegments = outsideSegs.map(([s, e]) => {
                const seg = new Drawing(
                  generateId(),
                  drawing.color,
                  drawing.lineWidth,
                  { tool: "shape", type: "line", start: s, end: e },
                  Date.now(),
                  drawing.user
                );
                updatedDrawings.push(seg);
                return seg;
              });
              newCutStrokesMap[drawing.drawingId] = replacementSegments;

              insideSegs.forEach(([s, e]) => {
                const cutSeg = new Drawing(
                  generateId(),
                  drawing.color,
                  drawing.lineWidth,
                  { tool: "shape", type: "line", start: s, end: e },
                  Date.now(),
                  drawing.user
                );
                newCutDrawings.push(cutSeg);

                const eraseSeg = new Drawing(
                  generateId(),
                  "#ffffff",
                  drawing.lineWidth + 4,
                  { tool: "shape", type: "line", start: s, end: e },
                  Date.now(),
                  drawing.user
                );
                eraseInsideSegmentsNew.push(eraseSeg);
              });
            }
      } else {
        updatedDrawings.push(drawing);
      }
    });

    setCutImageData(newCutDrawings);
    setCutOriginalIds(newCutOriginalIds);
    setCutStrokesMap(newCutStrokesMap);

    // Submit the erase strokes
    for (const eraseStroke of eraseInsideSegmentsNew) {
      try {
        await submitToDatabase(eraseStroke, currentUser, { roomId: currentRoomId }, setUndoAvailable, setRedoAvailable);
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
    await submitToDatabase(cutRecord, currentUser, { roomId: currentRoomId }, setUndoAvailable, setRedoAvailable);
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

    return { updatedDrawings, compositeCutAction };
  };

  return {
    selectionStart, setSelectionStart,
    selectionRect, setSelectionRect,
    cutImageData, setCutImageData,
    handleCutSelection,
  };
};
