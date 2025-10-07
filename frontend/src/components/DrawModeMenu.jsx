import React from 'react';

const DrawModeMenu = ({ drawMode, setDrawMode, color, previousColor, setColor, setPreviousColor, controlsDisabled }) => {
  return (
    <div className="DrawModeMenu">
      {/* Minimal wrapper - original implementation preserved in src/drawModeMenu.js */}
      <select value={drawMode} onChange={(e) => setDrawMode(e.target.value)} disabled={controlsDisabled}>
        <option value="freehand">Freehand</option>
        <option value="shape">Shape</option>
        <option value="eraser">Eraser</option>
        <option value="select">Select</option>
      </select>
    </div>
  );
};

export default DrawModeMenu;
