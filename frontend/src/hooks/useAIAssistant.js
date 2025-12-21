import { useState } from "react";

export function useAIAssistant() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const callAIAssistant = async (endpoint, body) => {
    setLoading(true);
    setError(null);

    try {
      // During local development the React dev server serves the UI on a
      // different port (usually 3000) which will return 404 for backend
      // API routes. Use an explicit backend base URL when running locally.
      const isLocalhost = typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      );
      const BACKEND_BASE = process.env.REACT_APP_API_URL || (isLocalhost ? 'http://localhost:10010' : '');

      const res = await fetch(`${BACKEND_BASE}/api/ai_assistant/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const err = data || new Error(`Request failed: ${res.status}`);
        throw err;
      }

      setResult(data);
      return data;
    } catch (err) {
      setError(err?.message || err);
      console.error("AI assistant error:", err);
      return { error: err };
    } finally {
      setLoading(false);
    }
  };

  // Wrapper methods for each route
  const textToDrawing = (prompt, canvasState) => callAIAssistant("drawing", { prompt, canvasState });
  const shapeCompletion = (canvasState) => callAIAssistant("complete", { canvasState });
  const generateImage = (prompt, width = 512, height = 512, style = 'default') => callAIAssistant("image", { prompt, width, height, style });
  const beautifySketch = (canvasState) => callAIAssistant("beautify", { canvasState });
  const styleTransfer = (canvasState, stylePrompt) => callAIAssistant("style", { canvasState, stylePrompt });
  const recognizeObject = (canvasObjects, box, bounds) => callAIAssistant("recognize", { canvasObjects, box, bounds });

  return {
    aiAssistLoading: loading,
    aiAssistError: error,
    aiAssistResult: result,
    textToDrawing,
    shapeCompletion,
    generateImage,
    beautifySketch,
    styleTransfer,
    recognizeObject,
  };
}
