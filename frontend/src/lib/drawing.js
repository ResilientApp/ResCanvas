export class Drawing {
  constructor(drawingId, color, lineWidth, pathData, timestamp, user, metadata = {}) {
    this.drawingId = drawingId;
    this.color = color;
    this.lineWidth = lineWidth;
    this.pathData = pathData;
    this.timestamp = timestamp;
    this.user = user;
    this.brushStyle = metadata.brushStyle || "round";
    this.order = timestamp;

    // Enhanced metadata for advanced brushes
    this.brushType = metadata.brushType || "normal";
    this.brushParams = metadata.brushParams || {};
    this.drawingType = metadata.drawingType || "stroke"; // stroke, stamp, filter
    this.stampData = metadata.stampData || null;
    this.stampSettings = metadata.stampSettings || null;
    this.filterType = metadata.filterType || null;
    this.filterParams = metadata.filterParams || {};
  }

  // Serialize metadata for backend storage
  getMetadata() {
    return {
      brushStyle: this.brushStyle,
      brushType: this.brushType,
      brushParams: this.brushParams,
      drawingType: this.drawingType,
      stampData: this.stampData,
      stampSettings: this.stampSettings,
      filterType: this.filterType,
      filterParams: this.filterParams
    };
  }

  // Create from backend data
  static fromBackendData(data) {
    // Extract complete metadata from multiple possible locations
    const metadata = data.metadata || {};

    const completeMetadata = {
      brushStyle: metadata.brushStyle || data.brushStyle || "round",
      brushType: metadata.brushType || data.brushType || data.brush_type || "normal",
      brushParams: metadata.brushParams || data.brushParams || data.brush_params || {},
      drawingType: metadata.drawingType || data.drawingType || "stroke",
      stampData: metadata.stampData || data.stampData || null,
      stampSettings: metadata.stampSettings || data.stampSettings || null,
      filterType: metadata.filterType || data.filterType || null,
      filterParams: metadata.filterParams || data.filterParams || {},
    };

    return new Drawing(
      data.drawingId || data.id,
      data.color,
      data.lineWidth,
      data.pathData,
      data.timestamp || data.ts,
      data.user,
      completeMetadata
    );
  }
}
