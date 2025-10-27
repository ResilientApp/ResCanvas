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
        filterType: this.filterType,
        filterParams: this.filterParams
      };
    }
    
    // Create from backend data
    static fromBackendData(data) {
      return new Drawing(
        data.drawingId,
        data.color,
        data.lineWidth,
        data.pathData,
        data.timestamp,
        data.user,
        data.metadata
      );
    }
  }
