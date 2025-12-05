from flask import Blueprint, request, jsonify
from services.llm_service import prompt_to_drawings, complete_shape_from_canvas, beautify_canvas_state
# from services.image_generation_service import (
#     text_to_image as img_text_to_image,
# )
import logging
import base64
import io

ai_assistant_bp = Blueprint('ai_assistant', __name__)
logger = logging.getLogger(__name__)


@ai_assistant_bp.route('/api/ai_assistant/drawing', methods=['POST'])
def text_to_drawings():
    """
    Body: { "prompt": "<natural language description>", canvasState: {json object} }
    Returns: Parsed drawing JSON (shape/color/size/position/...) or an error payload.
    """
    try:
        payload = request.get_json(silent=True) or {}
        prompt = payload.get("prompt")
        canvasState = payload.get("canvasState") or {}

        if not isinstance(prompt, str) or not prompt.strip():
            return jsonify({"error": "bad_request", "detail": "Missing or invalid 'prompt' (string)."}), 400

        logger.info("AI drawing requested")
        result = prompt_to_drawings(prompt.strip(), canvasState)

        print(f"\n\nModel result: {result}\n\n")

        # If services returned an error, surface it with 502 (bad upstream)
        if isinstance(result, dict) and "error" in result:
            logger.warning("AI drawing failed: %s", result)
            return jsonify({"error": "upstream_model_error", "detail": result}), 502

        return jsonify(result), 200
    except Exception as e:
        logger.exception("Unhandled error in /drawing")
        return jsonify({"error": "server_error", "detail": str(e)}), 500


@ai_assistant_bp.route('/api/ai_assistant/complete', methods=['POST'])
def shape_completion():
    """
    Body: { "canvasState": { ... } }
    Returns: { complete, confidence, object{ color, lineWidth, pathData{...} } } or an error payload.
    """
    try:
        payload = request.get_json(silent=True) or {}
        canvas_state = payload.get("canvasState")
        if not isinstance(canvas_state, dict):
            return jsonify({"error": "bad_request", "detail": "Missing or invalid 'canvas_state' (object)."}), 400

        logger.info("AI shape completion requested")
        suggestion = complete_shape_from_canvas(canvas_state)

        if not isinstance(canvas_state, dict):
            return jsonify({
                "error": "bad_request",
                "detail": "Missing or invalid 'canvasState' (object)."
            }), 400

        return jsonify(suggestion), 200
    except Exception as e:
        logger.exception("Unhandled error in /complete")
        return jsonify({"error": "server_error", "detail": str(e)}), 500


@ai_assistant_bp.route('/api/ai_assistant/image', methods=['POST'])
def text_to_image():
    """
    TODO: To be implemented
    Body: { "prompt": "<string>", "width"?: int, "height"?: int, "style"?: str }
    Returns: { "imageDataUrl": "data:image/png;base64,..." }
    """
    try:
        payload = request.get_json(silent=True) or {}
        prompt = payload.get("prompt", "")
        width = payload.get("width") or 512
        height = payload.get("height") or 512
        style = payload.get("style") or "default"

        if not isinstance(prompt, str) or not prompt.strip():
            return jsonify({
                "error": "bad_request",
                "detail": "Missing or invalid 'prompt' (string)."
            }), 400

        logger.info("AI text-to-image requested")

        pil_image = []      # img_text_to_image(prompt.strip(), width=width, height=height, style=style) 

        buf = io.BytesIO()
        pil_image.save(buf, format="PNG")
        buf.seek(0)
        encoded = base64.b64encode(buf.read()).decode("utf-8")
        data_url = f"data:image/png;base64,{encoded}"

        return jsonify({"imageDataUrl": data_url}), 200

    except Exception as e:
        logger.exception("Unhandled error in /image")
        return jsonify({"error": "server_error", "detail": str(e)}), 500


@ai_assistant_bp.route("/api/ai_assistant/beautify", methods=["POST"])
def beautify_sketch():
    try:
        payload = request.get_json(silent=True) or {}
        canvas_state = payload.get("canvasState")

        if not isinstance(canvas_state, dict):
            return jsonify({
                "error": "bad_request",
                "detail": "Missing or invalid 'canvasState' (object)."
            }), 400

        result = beautify_canvas_state(canvas_state)
        # print("\n\ncanvas_state!!!", canvas_state, "\n\n")
        # print("\n\nResult!!!", result, "\n\n")

        if not isinstance(result, dict) or "objects" not in result:
            logger.warning("Beautify returned invalid payload: %r", result)
            return jsonify({
                "error": "upstream_model_error",
                "detail": "Beautify model returned invalid payload."
            }), 502

        return jsonify(result), 200

    except Exception as e:
        logger.exception("Unhandled error in /beautify")
        return jsonify({"error": "server_error", "detail": str(e)}), 500