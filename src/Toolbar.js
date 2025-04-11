import React from 'react';
import { Slider } from '@mui/material';
import { SketchPicker } from "react-color";
import "./Canvas.css"; // Reuse the same styles

const Toolbar = ({
  drawMode,
  setDrawMode,
  shapeType,
  setShapeType,
  brushStyle,
  setBrushStyle,
  color,
  setColor,
  showColorPicker,
  toggleColorPicker,
  closeColorPicker,
  lineWidth,
  setLineWidth,
  isEraserActive,
  previousColor,
  setPreviousColor,
  setIsEraserActive,
  refreshCanvasButtonHandler,
  undo,
  undoAvailable,
  redo,
  redoAvailable,
  selectionRect,
  handleCutSelection,
  cutImageData,
  setClearDialogOpen
}) => {
  return (
    <div className="Canvas-toolbar">
      <div className="Canvas-label-group">
        <label className="Canvas-label">Draw Mode:</label>
        <select value={drawMode} onChange={(e) => setDrawMode(e.target.value)}>
          <option value="freehand">Freehand</option>
          <option value="shape">Shape</option>
          <option value="select">Select</option>
          <option value="paste">Paste</option>
        </select>
      </div>

      {drawMode === "shape" && (
        <div className="Canvas-label-group">
          <label className="Canvas-label">Shape Type:</label>
          <select value={shapeType} onChange={(e) => setShapeType(e.target.value)}>
            <option value="circle">Circle</option>
            <option value="rectangle">Rectangle</option>
            <option value="hexagon">Hexagon</option>
            <option value="line">Line</option>
          </select>
        </div>
      )}

      <div className="Canvas-label-group">
        <label className="Canvas-label">Brush Style:</label>
        <select value={brushStyle} onChange={(e) => setBrushStyle(e.target.value)}>
          <option value="round">Round</option>
          <option value="square">Square</option>
          <option value="butt">Butt</option>
        </select>
      </div>

      <div className="Canvas-label-group">
        <label className="Canvas-label">Color:</label>
        <div style={{ position: 'relative' }}>
          <div
            className="Canvas-color-display"
            style={{ backgroundColor: color }}
            onClick={toggleColorPicker}
          />
          {showColorPicker && (
            <div className="Canvas-color-picker">
              <SketchPicker color={color} onChange={(newColor) => setColor(newColor.hex)} />
              <button className="Canvas-close-button" onClick={closeColorPicker}>Close</button>
            </div>
          )}
        </div>
      </div>

      <div className="Canvas-label-group" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
        <label className="Canvas-label">Line Width:</label>
        <Slider
          orientation="vertical"
          value={lineWidth}
          onChange={(event, newValue) => setLineWidth(newValue)}
          min={1}
          max={20}
          sx={{
            height: 150,
            '& .MuiSlider-track': { color: '#007bff' },
            '& .MuiSlider-thumb': { backgroundColor: '#007bff' },
            '& .MuiSlider-rail':  { color: '#ccc' },
          }}
        />
      </div>

      <button
        onClick={() => {
          if (!isEraserActive) {
            setPreviousColor(color);
            setColor('#FFFFFF');
            setIsEraserActive(true);
          } else {
            setColor(previousColor);
            setPreviousColor(null);
            setIsEraserActive(false);
          }
        }}
        className={`Canvas-button ${isEraserActive ? 'Canvas-button-active' : ''}`}
      >
        Eraser
      </button>

      <button onClick={refreshCanvasButtonHandler} className="Canvas-button">Refresh Canvas</button>
      <button onClick={() => setClearDialogOpen(true)} className="Canvas-button">Clear Canvas</button>
      <button onClick={undo} disabled={!undoAvailable} className="Canvas-button">Undo</button>
      <button onClick={redo} disabled={!redoAvailable} className="Canvas-button">Redo</button>

      {drawMode === "select" && selectionRect && (
        <button onClick={handleCutSelection} className="Canvas-button">Cut Selection</button>
      )}
      {cutImageData && (
        <button onClick={() => setDrawMode("paste")} className="Canvas-button">Paste</button>
      )}
    </div>
  );
};

export default Toolbar;
