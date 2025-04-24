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
import CropSquareIcon from '@mui/icons-material/CropSquare';
import PanToolIcon from '@mui/icons-material/PanTool';

export default function DrawModeMenu({ drawMode, setDrawMode }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const modes = {
    freehand: { icon: <BrushIcon />,     label: 'Freehand' },
    shape:    { icon: <CropSquareIcon />, label: 'Shape'    },
    select:   { icon: <PanToolIcon />,    label: 'Select'   },
  };

  const handleClick = (e) => {
    setAnchorEl(e.currentTarget);
  };
  const handleClose = (mode) => {
    setAnchorEl(null);
    if (mode && mode !== drawMode) {
      setDrawMode(mode);
    }
  };

  return (
    <>
      <Tooltip title={modes[drawMode].label}>
        <IconButton
          onClick={handleClick}
          sx={{
            borderRadius: 1,            // theme.spacing(1) ≈ 8px
            width: 160,                  // fixed width
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
