from flask import Blueprint, request, jsonify
from services.llm_service import prompt_to_drawings, complete_shape_from_canvas
import logging

ai_assistant_bp = Blueprint('ai_assistant', __name__)
logger = logging.getLogger(__name__)


@ai_assistant_bp.route('/api/ai_assistant/drawing', methods=['POST'])
def text_to_drawings():
    """
    Body: { "prompt": "<natural language description>", canvasState: {json object} }
    Returns: parsed drawing JSON (shape/color/size/position/...) or an error payload.
    """
    try:
        payload = request.get_json(silent=True) or {}
        prompt = payload.get("prompt")
        canvasState = payload.get("canvasState") or {}

        if not isinstance(prompt, str) or not prompt.strip():
            return jsonify({"error": "bad_request", "detail": "Missing or invalid 'prompt' (string)."}), 400

        logger.info("AI drawing requested")
        result = prompt_to_drawings(prompt.strip(), canvasState)

        # print(f"Model result: {result}")

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
    pass


@ai_assistant_bp.route('/api/ai_assistant/beautify', methods=['POST'])
def beautify_sketch():
    pass

# @ai_assistant_bp.route('/api/ai_assistant/inpainting', methods=['POST'])
# def apply_inpainting():
#     pass
