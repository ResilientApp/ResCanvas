import React from 'react';
import { SketchPicker } from "react-color";
import "./Canvas.css"; // Reuse the same styles
import { Slider, Popover, IconButton, Tooltip } from '@mui/material';
import RefreshIcon   from '@mui/icons-material/Refresh';
import HistoryIcon from '@mui/icons-material/History';
import CloseIcon from '@mui/icons-material/Close';
import ClearAllIcon  from '@mui/icons-material/ClearAll';
import UndoIcon      from '@mui/icons-material/Undo';
import RedoIcon      from '@mui/icons-material/Redo';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
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
  openHistoryDialog,
  exitHistoryMode,
  historyMode,
  controlsDisabled,
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
              disabled={controlsDisabled}
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
                disabled={controlsDisabled}
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
      <Tooltip title="Refresh">
        <IconButton
          onClick={refreshCanvasButtonHandler}
          sx={actionButtonSX}
        >
          <RefreshIcon />
        </IconButton>
      </Tooltip>

      {historyMode ? (
        <>
          <Tooltip title="Change History Range">
            <IconButton onClick={openHistoryDialog} sx={actionButtonSX}>
              <HistoryIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Exit History Recall Mode">
            <IconButton onClick={exitHistoryMode} sx={actionButtonSX}>
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </>
      ) : (
        <Tooltip title="History Recall">
          <IconButton onClick={openHistoryDialog} sx={actionButtonSX}>
            <HistoryIcon />
          </IconButton>
        </Tooltip>
      )}
      
      <Tooltip title="Clear Canvas">
        <IconButton
          onClick={() => setClearDialogOpen(true)}
          disabled={controlsDisabled}
          sx={actionButtonSX}
        >
          <ClearAllIcon />
        </IconButton>
      </Tooltip>

      <Tooltip title="Undo">
        <IconButton
          onClick={undo}
          disabled={controlsDisabled || !undoAvailable}
          sx={actionButtonSX}
        >
          <UndoIcon />
        </IconButton>
      </Tooltip>
      
      <Tooltip title="Redo">
        <IconButton
          onClick={redo}
          disabled={controlsDisabled || !redoAvailable}
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
            disabled={controlsDisabled}
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
            disabled={controlsDisabled}
          >
            <ContentPasteIcon />
          </IconButton>
        </Tooltip>
      )}
    </div>
  );
};

export default Toolbar;
