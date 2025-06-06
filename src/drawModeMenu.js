import React, { useState } from 'react';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip
} from '@mui/material';
import BrushIcon from '@mui/icons-material/Brush';
import EraserIcon   from '@mui/icons-material/Delete';
import ShapeIcon from '@mui/icons-material/ShapeLine';
import PanToolIcon from '@mui/icons-material/PanTool';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';

export default function DrawModeMenu({ 
  drawMode, 
  setDrawMode, 
  color,            // current brush color
  previousColor,    // stored old color
  setColor,
  setPreviousColor 
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const modes = {
    freehand: { icon: <BrushIcon />,     label: 'Freehand' },
    eraser:   { icon: <EraserIcon />, label: 'Eraser'},
    shape:    { icon: <ShapeIcon />, label: 'Shape'    },
    select:   { icon: <PanToolIcon />,    label: 'Select'   },
    paste:    { icon: <ContentPasteIcon />, label: 'Paste'    },
  };

  const handleClick = (e) => {
    setAnchorEl(e.currentTarget);
  };
  const handleClose = (mode) => {
    setAnchorEl(null);
    if (!mode || mode === drawMode) return;
  
    // if switching *to* eraser, stash your current color
    if (drawMode !== 'eraser' && mode === 'eraser') {
      setPreviousColor(color);
      setColor("#FFFFFF")
    }
  
    // if switching *off* eraser, restore the stashed color
    if (drawMode === 'eraser' && mode !== 'eraser' && previousColor) {
      setColor(previousColor);
      setPreviousColor(null);
    }
  
    setDrawMode(mode);
  };

  return (
    <>
      <Tooltip title={modes[drawMode].label}>
        <IconButton
          onClick={handleClick}
          sx={{
            borderRadius: 1,            // theme.spacing(1) ≈ 8px
            width: 50,                  // fixed width
            height: 32,                 // fixed height
            padding: 0,                 // remove extra padding
            '& .MuiTouchRipple-root': {
              borderRadius: 1,          // keep ripple clipped to box
            },
          }}
        >
          {modes[drawMode].icon}
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => handleClose()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top',    horizontal: 'left' }}
      >
        {Object.entries(modes).map(([mode, { icon, label }]) => (
          <MenuItem
            key={mode}
            selected={mode === drawMode}
            onClick={() => handleClose(mode)}
          >
            <ListItemIcon>{icon}</ListItemIcon>
            <ListItemText primary={label} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
