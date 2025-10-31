import React, { useState } from 'react';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip
} from '@mui/material';
import CreateIcon from '@mui/icons-material/Create';
import EraserIcon from '@mui/icons-material/Delete';
import ShapeIcon from '@mui/icons-material/ShapeLine';
import PanToolIcon from '@mui/icons-material/PanTool';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import StarsIcon from '@mui/icons-material/Stars';

export default function DrawModeMenu({
  drawMode = 'freehand',
  setDrawMode,
  color,
  previousColor,
  setColor,
  setPreviousColor,
  controlsDisabled = false,
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const modes = {
    freehand: { icon: <CreateIcon />, label: 'Freehand' },
    eraser: { icon: <EraserIcon />, label: 'Eraser' },
    shape: { icon: <ShapeIcon />, label: 'Shape' },
    select: { icon: <PanToolIcon />, label: 'Select' },
    paste: { icon: <ContentPasteIcon />, label: 'Paste' },
    stamp: { icon: <StarsIcon />, label: 'Stamp' },
  };

  const safeDrawMode = modes[drawMode] ? drawMode : 'freehand';

  const handleClick = (e) => {
    if (controlsDisabled) return;
    setAnchorEl(e.currentTarget);
  };
  const handleClose = (mode) => {
    setAnchorEl(null);
    if (controlsDisabled) return;
    if (!mode || mode === safeDrawMode) return;

    // if switching *to* eraser, stash your current color
    if (safeDrawMode !== 'eraser' && mode === 'eraser') {
      setPreviousColor(color);
      setColor("#FFFFFF")
    }

    // if switching *off* eraser, restore the stashed color
    if (safeDrawMode === 'eraser' && mode !== 'eraser' && previousColor) {
      setColor(previousColor);
      setPreviousColor(null);
    }

    setDrawMode(mode);
  };

  return (
    <>
      <Tooltip title={modes[safeDrawMode].label}>
        <IconButton
          onClick={handleClick}
          sx={{
            borderRadius: 1,
            width: 40,
            height: 32,
            padding: 0,
            minWidth: 40,
            '& .MuiTouchRipple-root': {
              borderRadius: 1,
            },
          }}
          disabled={controlsDisabled}
        >
          {modes[safeDrawMode].icon}
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => handleClose()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {Object.entries(modes).map(([mode, { icon, label }]) => (
          <MenuItem
            key={mode}
            selected={mode === safeDrawMode}
            onClick={() => handleClose(mode)}
            disabled={controlsDisabled}
          >
            <ListItemIcon>{icon}</ListItemIcon>
            <ListItemText primary={label} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
