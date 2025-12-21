import React, { useState } from "react";
import '../../styles/ai-assistant.css';
import { Tooltip, IconButton } from "@mui/material";
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ImageIcon from '@mui/icons-material/Image';
import RoundedCornerIcon from '@mui/icons-material/RoundedCorner';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import FormatPaintIcon from '@mui/icons-material/FormatPaint';
import SearchIcon from '@mui/icons-material/Search';

export default function AIAssistantPanel({
  open,
  onClose,
  isBusy,
  error,
  showPromptInput,
  onShapeCompletionToggle,
  onBeautify,
  onRecognizeToggle,
}) {
  const [activeButton, setActiveButton] = useState("");

  const handlePanelItemClick = (itemTitle) => {
    // If it's the beautify button, do NOT toggle
    if (itemTitle === "Beautify sketch") {
      if (typeof onBeautify === "function" && !isBusy) {
        onBeautify();
      }
      return;
    }

    const next = activeButton === itemTitle ? "" : itemTitle;
    setActiveButton(next);

    if (itemTitle === "Shape auto completion") {
      if (typeof onShapeCompletionToggle === "function") {
        onShapeCompletionToggle(next === "Shape auto completion");
      }
      return;
    }

    if (itemTitle === "Recognize selection") {
      if (typeof onRecognizeToggle === "function") {
        onRecognizeToggle(next === "Recognize selection");
      }
      return;
    }

    if (next === "Generate sketch") {
      showPromptInput(true, {
        type: 'drawing',
        placeholder: "Describe what to draw…"
      });
    } else if (next === "Generate image") {
      showPromptInput(true, {
        type: 'image',
        placeholder: "Describe the image to generate…"
      });
    } else if (next === "Style transfer") {
      showPromptInput(true, {
        type: 'style',
        placeholder: "Describe the style (e.g. 'Van Gogh oil painting')…"
      });
    } else {
      showPromptInput(false, {
        type: '',
        placeholder: ""
      });
    }
  };

  const renderStyleClass = (itemTitle) => {
    // Beautify sketch should never be active
    if (itemTitle === "Beautify sketch") {
      return "ai-asisstant-panel-item"; 
    }

    return itemTitle === activeButton
      ? "ai-asisstant-panel-item ai-asisstant-panel-item-active"
      : "ai-asisstant-panel-item";
  };

  return (
    <div className={`ai-assistant-panel-container ai-assistant-panel-container-${open ? "open" : "close"}`}>
      
      <div
        className={renderStyleClass("Generate sketch")}
        onClick={() => handlePanelItemClick("Generate sketch")}
        aria-pressed={activeButton === "Generate sketch"}
      >
        <Tooltip title="Generate sketch">
          <IconButton disableRipple>
            <AutoAwesomeIcon />
          </IconButton>
        </Tooltip>
      </div>

      <div
        className={renderStyleClass("Generate image")}
        onClick={() => handlePanelItemClick("Generate image")}
        aria-pressed={activeButton === "Generate image"}
      >
        <Tooltip title="Generate image">
          <IconButton disableRipple>
            <ImageIcon />
          </IconButton>
        </Tooltip>
      </div>

      <div
        className={renderStyleClass("Style transfer")}
        onClick={() => handlePanelItemClick("Style transfer")}
        aria-pressed={activeButton === "Style transfer"}
      >
        <Tooltip title="Style transfer">
          <IconButton disableRipple>
            <FormatPaintIcon />
          </IconButton>
        </Tooltip>
      </div>

      <div
        className={renderStyleClass("Recognize selection")}
        onClick={() => handlePanelItemClick("Recognize selection")}
        aria-pressed={activeButton === "Recognize selection"}
      >
        <Tooltip title="Recognize selection">
          <IconButton disableRipple>
            <SearchIcon />
          </IconButton>
        </Tooltip>
      </div>

      <div
        className={renderStyleClass("Shape auto completion")}
        onClick={() => handlePanelItemClick("Shape auto completion")}
        aria-pressed={activeButton === "Shape auto completion"}
      >
        <Tooltip title="Shape auto completion">
          <IconButton disableRipple>
            <RoundedCornerIcon />
          </IconButton>
        </Tooltip>
      </div>

      <div
        className={renderStyleClass("Beautify sketch")}
        onClick={() => handlePanelItemClick("Beautify sketch")}
        aria-pressed={false}
      >
        <Tooltip title="Beautify sketch">
          <IconButton disableRipple>
            <AutoFixHighIcon />
          </IconButton>
        </Tooltip>
      </div>

    </div>
  );
}
