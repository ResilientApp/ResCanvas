// Re-export the canonical Toolbar component from the new components/ folder.
// This keeps existing imports (import Toolbar from './Toolbar') working while the
// codebase moves to `src/components/Toolbar.jsx` as the canonical source.
export { default } from './components/Toolbar';
import RefreshIcon from '@mui/icons-material/Refresh';
