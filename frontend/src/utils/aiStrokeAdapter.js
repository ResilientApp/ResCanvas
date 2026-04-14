import { Drawing } from "../lib/drawing";

const isValidPoint = (p) =>
  p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y);

const toPoint = (p) => ({
  x: Number(p.x),
  y: Number(p.y),
});

const normalizeColor = (value) => value || "#000000";
const normalizeLineWidth = (value) =>
  Number.isFinite(Number(value)) ? Number(value) : 4;

function itemToPathData(item) {
  const type = item.type;

  if (type === "polygon") {
    const points = Array.isArray(item.points)
      ? item.points.filter(isValidPoint).map(toPoint)
      : [];

    if (points.length < 3) {
      throw new Error("Polygon must have at least 3 valid points");
    }

    return {
      tool: "shape",
      type: "polygon",
      points,
    };
  }

  if (!isValidPoint(item.start) || !isValidPoint(item.end)) {
    throw new Error(`${type} must include valid start and end points`);
  }

  return {
    tool: "shape",
    type,
    start: toPoint(item.start),
    end: toPoint(item.end),
  };
}

export function aiPayloadToDrawings({
  aiPayload,
  currentUser,
  generateId,
}) {
  const items = Array.isArray(aiPayload?.items) ? aiPayload.items : [];

  if (!items.length) {
    throw new Error("AI payload has no items");
  }

  return items.map((item, index) => {
    const drawing = new Drawing(
      generateId(`ai_${index}`),
      normalizeColor(item.color),
      normalizeLineWidth(item.lineWidth),
      itemToPathData(item),
      Date.now() + index,
      currentUser,
      {
        brushStyle: "round",
        brushType: "normal",
        brushParams: {},
        drawingType: "shape",
      }
    );

    return drawing;
  });
}