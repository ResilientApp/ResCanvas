import React, { useState } from 'react';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip
} from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import SquareIcon from '@mui/icons-material/Square';
import HexagonIcon from '@mui/icons-material/Hexagon';
import TimelineIcon from '@mui/icons-material/Timeline';

export default function ShapeMenu({ shapeType, setShapeType }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const shapes = {
    circle:    { icon: <CircleIcon />,     label: 'Circle'    },
    rectangle: { icon: <SquareIcon />, label: 'Rectangle' },
    hexagon:   { icon: <HexagonIcon />,     label: 'Hexagon'   },
    line:      { icon: <TimelineIcon />,  label: 'Line'      },
  };

  const handleClick = e => setAnchorEl(e.currentTarget);
  const handleClose = (type) => {
    setAnchorEl(null);
    if (type && type !== shapeType) {
      setShapeType(type);
    }
  };

  // reuse the same sizing/style you used for DrawModeMenu
  const buttonSX = {
    borderRadius: 1,
    width: 50,
    height: 32,
    padding: 0,
    '& .MuiTouchRipple-root': { borderRadius: 1 },
  };

  return (
    <>
      <Tooltip title={shapes[shapeType].label}>
        <IconButton onClick={handleClick} sx={buttonSX}>
          {shapes[shapeType].icon}
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => handleClose()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top',    horizontal: 'left' }}
      >
        {Object.entries(shapes).map(([type, { icon, label }]) => (
          <MenuItem
            key={type}
            selected={type === shapeType}
            onClick={() => handleClose(type)}
          >
            <ListItemIcon>{icon}</ListItemIcon>
            <ListItemText primary={label} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
