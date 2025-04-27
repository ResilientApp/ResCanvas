import React from 'react';
import { Slider } from '@mui/material';
import { SketchPicker } from "react-color";
import "./Canvas.css"; // Reuse the same styles
import { IconButton, Tooltip } from '@mui/material';
import EraserIcon   from '@mui/icons-material/Delete';
import RefreshIcon   from '@mui/icons-material/Refresh';
import ClearAllIcon  from '@mui/icons-material/ClearAll';
import UndoIcon      from '@mui/icons-material/Undo';
import RedoIcon      from '@mui/icons-material/Redo';
import DrawModeMenu from './drawModeMenu';
import ShapeMenu from './shapeMenu';

const actionButtonSX = {
  borderRadius: 1,            // theme.spacing(1) ≈ 8px
  width: 50,                 // same fixed width
  height: 32,                 // same fixed height
  padding: 0,                 // remove extra padding
  '& .MuiTouchRipple-root': {
    borderRadius: 1,          // clip ripple to box
  },
};

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
  setClearDialogOpen,
}) => {
  return (
    <div className="Canvas-toolbar">
      <div className="Canvas-label-group">
        {/* <label className="Canvas-label">Draw Mode:</label>*/}
        <DrawModeMenu drawMode={drawMode} setDrawMode={setDrawMode} />
      </div>

      {drawMode === "shape" && (
        <div className="Canvas-label-group">
          <ShapeMenu shapeType={shapeType} setShapeType={setShapeType} />
        </div>
      )}

      {['freehand','shape'].includes(drawMode) && (
        <>
          <div
            className="Canvas-label-group"
            style={{ flexDirection: 'column', alignItems: 'flex-start' }}
          >
            {/*<label className="Canvas-label">Line Width:</label>*/}
            <Slider
              orientation="vertical"
              value={lineWidth}
              onChange={(e, v) => setLineWidth(v)}
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

          <div className="Canvas-label-group">
            {/*<label className="Canvas-label">Color:</label>*/}
            <div style={{ position: 'relative' }}>
              <div
                className="Canvas-color-display"
                style={{ backgroundColor: color }}
                onClick={toggleColorPicker}
              />
              {showColorPicker && (
                <div className="Canvas-color-picker">
                  <SketchPicker
                    color={color}
                    onChange={newColor => setColor(newColor.hex)}
                  />
                  <button
                    className="Canvas-close-button"
                    onClick={closeColorPicker}
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>

          <Tooltip title="Eraser">
            <IconButton
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
              className={`Canvas-button ${
                isEraserActive ? 'Canvas-button-active' : ''
              }`}
              sx={actionButtonSX}
            >
              <EraserIcon />
            </IconButton>
          </Tooltip>
        </>
      )}
      <Tooltip title="Refresh">
        <IconButton
          onClick={refreshCanvasButtonHandler}
          sx={actionButtonSX}
        >
          <RefreshIcon />
        </IconButton>
      </Tooltip>
      
      <Tooltip title="Clear Canvas">
        <IconButton
          onClick={() => setClearDialogOpen(true)}
          sx={actionButtonSX}
        >
          <ClearAllIcon />
        </IconButton>
      </Tooltip>

      <Tooltip title="Undo">
        <IconButton
          onClick={undo}
          disabled={!undoAvailable}
          sx={actionButtonSX}
        >
          <UndoIcon />
        </IconButton>
      </Tooltip>
      
      <Tooltip title="Redo">
        <IconButton
          onClick={redo}
          disabled={!redoAvailable}
          sx={actionButtonSX}
        >
          <RedoIcon />
        </IconButton>
      </Tooltip>
     

      {drawMode === "select" && selectionRect && (
        <button onClick={handleCutSelection} className="Canvas-button">Cut Selection</button>
      )}
      {cutImageData && cutImageData.length > 0 && (
        <button onClick={() => setDrawMode("paste")} className="Canvas-button">Paste</button>
      )}
    </div>
  );
};

export default Toolbar;
