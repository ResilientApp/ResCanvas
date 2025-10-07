import React from 'react';

const ShapeMenu = ({ shapeType, setShapeType, controlsDisabled }) => {
  return (
    <div className="ShapeMenu">
      <select value={shapeType} onChange={(e) => setShapeType(e.target.value)} disabled={controlsDisabled}>
        <option value="circle">Circle</option>
        <option value="rect">Rectangle</option>
        <option value="line">Line</option>
      </select>
    </div>
  );
};

export default ShapeMenu;
