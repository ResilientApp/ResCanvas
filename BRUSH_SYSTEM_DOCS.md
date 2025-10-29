# Advanced Brush System Documentation

## Overview

The ResCanvas Advanced Brush System provides a comprehensive set of creative tools including:
- **Brush Engine**: Multiple brush types with customizable parameters
- **Mixer Tool**: Non-destructive filters with preview and undo
- **Stamp System**: Built-in stamp library with custom stamp support

## Components

### 1. Brush Engine (`useBrushEngine.js`)

The brush engine provides different brush types with unique effects:

#### Available Brushes

| Brush Type | Description | Parameters |
|------------|-------------|------------|
| `normal` | Standard smooth brush | size, opacity |
| `wacky` | Colorful scattered particles | scatter, colors, particles |
| `drip` | Paint dripping effect | droplets, gravity, viscosity |
| `scatter` | Random scattered dots | spread, density, variation |
| `neon` | Glowing neon effect | glow, intensity |
| `chalk` | Textured chalk strokes | texture, opacity, roughness |
| `spray` | Spray paint effect | density, spread, pressure |

#### Usage

```javascript
const brushEngine = useBrushEngine(canvasContext);

// Set brush type
brushEngine.setBrushType('wacky');

// Configure parameters
brushEngine.setBrushParams({
  intensity: 75,
  variation: 50,
  flow: 80
});

// Draw with brush
brushEngine.draw(x, y, lineWidth, color);
```

### 2. Brush Panel (`BrushPanel.jsx`)

Interactive UI for selecting and configuring brushes.

**Props:**
- `selectedBrush`: Currently selected brush type
- `onSelect`: Callback when brush is selected
- `onParamsChange`: Callback when parameters change

**Features:**
- Grid layout of brush options
- Real-time preview canvas
- Parameter sliders for customization
- Responsive design

### 3. Mixer Tool (`MixerPanel.jsx`)

Non-destructive filter system with preview capabilities.

#### Available Filters

| Filter | Description | Parameters |
|--------|-------------|------------|
| `blur` | Soften sharp edges | intensity (0-20) |
| `hueShift` | Change color tones | hue (-180 to 180), saturation (-100 to 100) |
| `chalk` | Chalky texture effect | roughness (0-100), opacity (10-100) |
| `fade` | Reduce opacity gradually | amount (10-90), gradient (0-100) |
| `vintage` | Old photo effect | sepia (0-100), vignette (0-100) |
| `neon` | Electric glow effect | intensity (0-50), color (0-360) |

**Features:**
- Real-time preview before applying
- Non-destructive editing (can undo)
- Parameter adjustment sliders
- Visual filter previews

### 4. Stamp System

#### Stamp Panel (`StampPanel.jsx`)

**Features:**
- Built-in stamp library (emojis and shapes)
- Custom stamp creation
- Category filtering
- Stamp settings (size, rotation, opacity)
- Import/export functionality

#### Stamp Editor (`StampEditor.jsx`)

**Features:**
- Emoji picker with popular options
- Image upload support (PNG, JPG, GIF)
- Category assignment
- Real-time preview
- Custom name assignment

#### Default Stamps

The system includes 12 built-in stamps across categories:
- **Nature**: 🌸, 🍀, ☀️, 🌙, 🌳, 🌈
- **Animals**: 🐠, 🦋, 🐱
- **Shapes**: ⭐, ❤️
- **Objects**: 🚀

### 5. Enhanced Drawing Class

The `Drawing` class has been extended to support metadata for advanced features:

```javascript
const drawing = new Drawing(
  drawingId,
  color,
  lineWidth,
  pathData,
  timestamp,
  user,
  {
    brushType: 'wacky',
    brushParams: { intensity: 75 },
    drawingType: 'stroke', // 'stroke', 'stamp', 'filter'
    stampData: null,
    filterType: null,
    filterParams: {}
  }
);
```

## Backend Integration

### Stamps API (`/api/stamps`)

**Endpoints:**
- `GET /api/stamps` - Get user's custom stamps
- `POST /api/stamps` - Create new stamp
- `PUT /api/stamps/:id` - Update stamp
- `DELETE /api/stamps/:id` - Delete stamp
- `GET /api/stamps/image/:filename` - Serve stamp images
- `POST /api/stamps/import` - Import stamps from JSON
- `GET /api/stamps/export` - Export stamps as JSON

**Database:**
- Collection: `stamps`
- Indexes: `user_id`, `deleted`

## Usage Examples

### Basic Brush Usage

```javascript
// Select wacky brush
handleBrushSelect('wacky');

// Configure brush parameters
handleBrushParamsChange({
  intensity: 80,
  variation: 60,
  flow: 90
});

// Drawing will now use the wacky brush with these parameters
```

### Applying Filters

```javascript
// Preview a blur filter
previewFilter('blur', { intensity: 8 });

// Apply the filter permanently
applyFilter('blur', { intensity: 8 });

// Undo if needed
undoFilter();
```

### Using Stamps

```javascript
// Select a stamp
const stamp = { emoji: '⭐', name: 'Star', category: 'shapes' };
const settings = { size: 75, rotation: 45, opacity: 100 };

handleStampSelect(stamp, settings);

// Stamps will be placed on canvas clicks
```

### Creating Custom Stamps

```javascript
// Create from emoji
const emojiStamp = {
  name: 'My Star',
  category: 'custom',
  emoji: '⭐'
};

// Create from image
const imageStamp = {
  name: 'My Logo',
  category: 'custom',
  image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'
};
```

## Performance Considerations

### Brush Rendering
- Uses requestAnimationFrame for smooth rendering
- Implements brush-specific optimizations
- Supports canvas tiling for large canvases

### Filter Operations
- Non-destructive workflow preserves original data
- ImageData operations are optimized for performance
- Preview mode uses efficient temporary rendering

### Stamp Management
- Local storage for custom stamps
- Lazy loading of stamp images
- Efficient category filtering

## Styling

The system uses custom CSS classes defined in `brushes.css`:

- `.brush-panel`, `.mixer-panel`, `.stamp-panel` - Panel containers
- `.brush-grid`, `.filter-grid` - Grid layouts
- `.brush-card`, `.filter-card` - Individual tool cards
- `.stamp-grid` - Stamp arrangement
- Responsive design for mobile devices

## Integration with Canvas

The advanced brush system integrates seamlessly with the existing Canvas component:

1. **Brush Engine**: Initialized in Canvas and passed to Toolbar
2. **Drawing Handler**: Modified to use brush engine for rendering
3. **Undo/Redo**: Enhanced to support brush/stamp/filter operations
4. **Persistence**: Drawings include metadata for reconstruction

## Testing

Comprehensive tests cover:
- Brush parameter validation
- Filter application and undo
- Stamp creation and placement
- Performance benchmarks
- UI component interactions

Run tests with:
```bash
npm test brushSystem.test.js
```

## Future Enhancements

- **Custom Brush Creation**: Allow users to create their own brush algorithms
- **Animation Support**: Animated stamps and brush effects
- **Layer System**: Separate layers for different drawing types
- **Collaborative Brushes**: Real-time brush sharing between users
- **Advanced Filters**: More sophisticated image processing filters
- **Brush Presets**: Save and share brush configurations
