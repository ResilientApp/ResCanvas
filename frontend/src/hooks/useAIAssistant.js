import { useState } from "react";

export function useAIAssistant() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const callAIAssistant = async (endpoint, body) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`http://127.0.0.1:10010/api/ai_assistant/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
      return data;
    } catch (err) {
      setError(err.message);
      console.error("AI assistant error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Wrapper methods for each route
  const textToDrawing = (prompt, canvasState) => callAIAssistant("drawing", { prompt, canvasState });
  const shapeCompletion = (canvasState) => callAIAssistant("complete", { canvasState });
  const textToImage = (prompt) => callAIAssistant("image", { prompt });
  const beautifySketch = (canvasState) => callAIAssistant("beautify", { canvasState });

  return {
    aiAssistLoading: loading,
    aiAssistError: error,
    aiAssistResult: result,
    textToDrawing,
    shapeCompletion,
    textToImage,
    beautifySketch,
  };
}
