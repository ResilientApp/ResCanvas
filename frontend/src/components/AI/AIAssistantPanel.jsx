import React, { useState } from "react";
import '../../styles/ai-assistant.css';
import { Tooltip, IconButton } from "@mui/material";
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ImageIcon from '@mui/icons-material/Image';
import RoundedCornerIcon from '@mui/icons-material/RoundedCorner';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useAIAssistant } from "../../hooks/useAIAssistant";

export default function AIAssistantPanel({
  open,
  showPromptInput,
  onShapeCompletionToggle,
  getBeautifyCanvasState,
  clearCanvas,
  showLocalSnack,
  addAIGeneratedObjects
}) {
  const [activeButton, setActiveButton] = useState("");
  const { aiAssistLoading, beautifySketch } = useAIAssistant();

  const handleBeautify = async () => {
    if (aiAssistLoading) return;

    try {
      const canvasState = getBeautifyCanvasState();
      const result = await beautifySketch(canvasState);

      if (!result || !Array.isArray(result.objects) || result.objects.length === 0) {
        showLocalSnack("Beautify failed. Please try again.");
        return;
      }

      const beautifiedObjects = result.objects;

      // CLear canvas before rendering beatutified version
      clearCanvas();

      // Add beatified version to the canvas
      await addAIGeneratedObjects(beautifiedObjects);

      showLocalSnack("Sketch beautified");
    } catch (err) {
      showLocalSnack("Beautify error");
      console.error(err);
    } 
  };


  const handlePanelItemClick = async (itemTitle) => {
    if (itemTitle === "Beautify sketch") {
      await handleBeautify()
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
    } else {
      showPromptInput(false, {
        type: '',
        placeholder: ""
      });
    }
  };

  const renderStyleClass = (itemTitle) => {
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
