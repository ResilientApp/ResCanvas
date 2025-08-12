import React from 'react';
import { SketchPicker } from "react-color";
import "./Canvas.css"; // Reuse the same styles
import { Slider, Popover, IconButton, Tooltip } from '@mui/material';
import RefreshIcon   from '@mui/icons-material/Refresh';
import ClearAllIcon  from '@mui/icons-material/ClearAll';
import UndoIcon      from '@mui/icons-material/Undo';
import RedoIcon      from '@mui/icons-material/Redo';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import DrawModeMenu from './drawModeMenu';
import ShapeMenu from './shapeMenu';
import HistoryIcon   from '@mui/icons-material/History';
import {Button} from 'react-bootstrap';

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
  color,
  setColor,
  showColorPicker,
  toggleColorPicker,
  closeColorPicker,
  lineWidth,
  setLineWidth,
  previousColor,
  setPreviousColor,
  refreshCanvasButtonHandler,
  undo,
  undoAvailable,
  redo,
  redoAvailable,
  selectionRect,
  handleCutSelection,
  cutImageData,
  setClearDialogOpen,
  historyMode,
  toggleHistoryMode,
  recallStart,
  recallEnd,
  setRecallStart,
  setRecallEnd,
  applyRecallRange,
}) => {
  return (
    <div className="Canvas-toolbar">
      <div className="Canvas-label-group">
        {/* <label className="Canvas-label">Draw Mode:</label>*/}
        <DrawModeMenu 
          drawMode={drawMode} 
          setDrawMode={setDrawMode} 
          color={color}
          previousColor={previousColor} 
          setColor={setColor}
          setPreviousColor={setPreviousColor}/>
      </div>

      {drawMode === "shape" && (
        <div className="Canvas-label-group">
          <ShapeMenu shapeType={shapeType} setShapeType={setShapeType} />
        </div>
      )}

      {['freehand','shape','eraser'].includes(drawMode) && (
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
          
          {drawMode !== 'eraser' &&
          <div className="Canvas-label-group">
            <div style={{ position: 'relative' }}>
              <div
                className="Canvas-color-display"
                style={{ backgroundColor: color }}
                onClick={toggleColorPicker}
              />
              <Popover
                open={showColorPicker}
                onClose={closeColorPicker}
                anchorEl={document.querySelector('.Canvas-color-display')}
                anchorOrigin={{
                  vertical: 'bottom',
                  horizontal: 'left',
                }}
                transformOrigin={{
                  vertical: 'top',
                  horizontal: 'left',
                }}
                PaperProps={{ sx: { p: 2 } }}
              >
                <SketchPicker
                  color={color}
                  onChange={newColor => setColor(newColor.hex)}
                />
              </Popover>
            </div>
          </div>
          }
        </>
      )}

      <Tooltip title={historyMode ? "Exit History" : "History Recall"}>
        <IconButton onClick={toggleHistoryMode} sx={actionButtonSX}>
          <HistoryIcon />
        </IconButton>
      </Tooltip>

      <Tooltip title="Refresh">
        <IconButton
          onClick={refreshCanvasButtonHandler}
          sx={actionButtonSX}
        >
          <RefreshIcon />
        </IconButton>
      </Tooltip>

      {/* When History mode is active, show simple datetime-local inputs for recall range */}
      {historyMode && (
        <div style={{ display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <input
            type="datetime-local"
            value={recallStart || recallStart === "" ? recallStart : ""}
            onChange={(e) => setRecallStart(e.target.value)}
            style={{ height: 40 }}
          />
          <input
            type="datetime-local"
            value={recallEnd || recallEnd === "" ? recallEnd : ""}
            onChange={(e) => setRecallEnd(e.target.value)}
            style={{ height: 40 }}
          />
          <Button variant="contained" size="small" onClick={applyRecallRange}>Apply</Button>
        </div>
      )}
      
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
        <Tooltip title="Cut Selection">
          <IconButton
            onClick={handleCutSelection}
            sx={actionButtonSX}
          >
            <ContentCutIcon />
          </IconButton>
        </Tooltip>
      )}
      {cutImageData && cutImageData.length > 0 && (
        <Tooltip title="Paste">
          <IconButton
            onClick={setDrawMode("paste")}
            sx={actionButtonSX}
          >
            <ContentPasteIcon />
          </IconButton>
        </Tooltip>
      )}
    </div>
  );
};

export default Toolbar;
