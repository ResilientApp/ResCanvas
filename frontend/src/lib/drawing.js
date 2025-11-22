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

    // Pending state for visual confirmation
    this.isPending = metadata.isPending || false;
    this.opacity = metadata.opacity !== undefined ? metadata.opacity : 1.0;

    this._metadataCache = null;
  }

  getMetadata() {
    if (this._metadataCache) {
      return this._metadataCache;
    }

    this._metadataCache = {
      brushStyle: this.brushStyle,
      brushType: this.brushType,
      brushParams: this.brushParams,
      drawingType: this.drawingType,
      stampData: this.stampData,
      stampSettings: this.stampSettings,
      filterType: this.filterType,
      filterParams: this.filterParams,
      isPending: this.isPending,
      opacity: this.opacity
    };

    return this._metadataCache;
  }

  invalidateMetadataCache() {
    this._metadataCache = null;
  }

  static fromBackendData(data) {
    const metadata = data.metadata || {};

    const completeMetadata = {
      brushStyle: data.brushStyle || metadata.brushStyle || "round",
      brushType: data.brushType || data.brush_type || metadata.brushType || "normal",
      brushParams: data.brushParams || data.brush_params || metadata.brushParams || {},
      drawingType: data.drawingType || metadata.drawingType || "stroke",
      stampData: data.stampData || metadata.stampData || null,
      stampSettings: data.stampSettings || metadata.stampSettings || null,
      filterType: data.filterType || metadata.filterType || null,
      filterParams: data.filterParams || metadata.filterParams || {},
      isPending: data.isPending || metadata.isPending || false,
      opacity: data.opacity !== undefined ? data.opacity : (metadata.opacity !== undefined ? metadata.opacity : 1.0)
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
