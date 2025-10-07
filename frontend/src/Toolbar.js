import React from 'react';
import { SketchPicker } from "react-color";
import "./Canvas.css"; // Reuse the same styles
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
import DrawModeMenu from './drawModeMenu';
import ShapeMenu from './shapeMenu';

const actionButtonSX = {
  borderRadius: 1,            // theme.spacing(1) ≈ 8px
  width: 50,                 // same fixed width
  // Conservative shim: re-export the component from components/Toolbar so existing imports keep working
  export { default } from './components/Toolbar';
  '& .MuiTouchRipple-root': {
