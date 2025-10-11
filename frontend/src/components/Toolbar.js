import React from 'react';
import { SketchPicker } from "react-color";
import "../styles/Canvas.css";
import { Slider, Popover, IconButton, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import HistoryIcon from '@mui/icons-material/History';
import CloseIcon from '@mui/icons-material/Close';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import SettingsIcon from '@mui/icons-material/Settings';
import DrawModeMenu from '../lib/drawModeMenu';
import ShapeMenu from '../lib/shapeMenu';

const actionButtonSX = {
  borderRadius: 1,
  width: 50,
  height: 32,
  padding: 0,
  '& .MuiTouchRipple-root': {
    borderRadius: 1,
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
  onOpenSettings,
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
          setPreviousColor={setPreviousColor}
          controlsDisabled={controlsDisabled}
        />
      </div>

      {drawMode === "shape" && (
        <div className="Canvas-label-group">
          <ShapeMenu shapeType={shapeType} setShapeType={setShapeType} controlsDisabled={controlsDisabled} />
        </div>
      )}

      {['freehand', 'shape', 'eraser'].includes(drawMode) && (
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
                '& .MuiSlider-rail': { color: '#ccc' },
              }}
            />
          </div>

          {drawMode !== 'eraser' &&
            <div className="Canvas-label-group">
              <div style={{ position: 'relative' }}>
                <div
                  className="Canvas-color-display"
                  style={{ backgroundColor: color, cursor: controlsDisabled ? 'not-allowed' : 'pointer' }}
                  onClick={controlsDisabled ? undefined : toggleColorPicker}
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
                    disableAlpha={false}
                  />
                </Popover>
              </div>
            </div>
          }
        </>
      )}
      <Tooltip title="Refresh">
        <span>
          <IconButton
            onClick={controlsDisabled ? undefined : refreshCanvasButtonHandler}
            sx={actionButtonSX}
            disabled={controlsDisabled}
          >
            <RefreshIcon />
          </IconButton>
        </span>
      </Tooltip>

      {/* Room Settings in the left toolbar - shown when a handler is provided */}
      {typeof onOpenSettings === 'function' && (
        <Tooltip title="Room settings">
          <span>
            <IconButton
              onClick={onOpenSettings}
              sx={actionButtonSX}
              disabled={controlsDisabled}
            >
              <SettingsIcon />
            </IconButton>
          </span>
        </Tooltip>
      )}

      {historyMode ? (
        <>
          <Tooltip title="Change History Range">
            <span>
              <IconButton onClick={openHistoryDialog} sx={actionButtonSX} disabled={false}>
                <HistoryIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Exit History Recall Mode">
            <span>
              <IconButton onClick={exitHistoryMode} sx={actionButtonSX} disabled={false}>
                <CloseIcon />
              </IconButton>
            </span>
          </Tooltip>
        </>
      ) : (
        <Tooltip title="History Recall">
          <span>
            <IconButton onClick={controlsDisabled ? undefined : openHistoryDialog} sx={actionButtonSX} disabled={controlsDisabled}>
              <HistoryIcon />
            </IconButton>
          </span>
        </Tooltip>
      )}

      <Tooltip title="Clear Canvas">
        <span>
          <IconButton
            onClick={() => setClearDialogOpen(true)}
            disabled={controlsDisabled}
            sx={actionButtonSX}
          >
            <ClearAllIcon />
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip title="Undo">
        <span>
          <IconButton
            onClick={undo}
            disabled={controlsDisabled || !undoAvailable}
            sx={actionButtonSX}
          >
            <UndoIcon />
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip title="Redo">
        <span>
          <IconButton
            onClick={redo}
            disabled={controlsDisabled || !redoAvailable}
            sx={actionButtonSX}
          >
            <RedoIcon />
          </IconButton>
        </span>
      </Tooltip>


      {drawMode === "select" && selectionRect && (
        <Tooltip title="Cut Selection">
          <span>
            <IconButton
              onClick={handleCutSelection}
              sx={actionButtonSX}
              disabled={controlsDisabled}
            >
              <ContentCutIcon />
            </IconButton>
          </span>
        </Tooltip>
      )}
      {cutImageData && cutImageData.length > 0 && (
        <Tooltip title="Paste">
          <span>
            <IconButton
              onClick={() => setDrawMode("paste")}
              sx={actionButtonSX}
              disabled={controlsDisabled}
            >
              <ContentPasteIcon />
            </IconButton>
          </span>
        </Tooltip>
      )}
    </div>
  );
};

export default Toolbar;
