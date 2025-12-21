# pip install openai ollama
import json
import typing

# === text to drawings =========================================================
# System prompt
SYSTEM_PROMPT = """
You are a drawing-command generator for a canvas app.

Inputs you will be given:
- CanvasState: { "drawings": [ ... ], "bounds": { "width": number, "height": number } }
- UserPrompt: a natural-language scene description

Goal:
Return a SINGLE JSON object with an "objects" array. Each item is a canvas-ready drawing command that our app can render directly.

Output (JSON ONLY, no comments, no markdown):
{
  "objects": [
    {
      "color": "#RRGGBB",
      "lineWidth": number,
      "pathData": {
        "tool": "shape|freehand",
        "type": "rectangle|circle|line|polygon|text|stroke",
        // Use one of these geometry encodings (no others):
        // For circle/rectangle/line:
        "start": {"x": number, "y": number},
        "end":   {"x": number, "y": number},
        // For polygon (including triangles):
        "points": [ {"x": number, "y": number}, ... ],
        // For text:
        "text": "string"
        // For freehand strokes (preferred for smooth lines):
        //   use "tool": "freehand", "type": "stroke",
        //   and provide "points" as an ordered list along the stroke path.
      }
    }
  ]
}

Rules & Defaults (match our canvas code):
- Use ABSOLUTE pixel coordinates with (0,0) at top-left; all points MUST lie within [0, bounds.width] × [0, bounds.height].
- Color words → hex (e.g., "red"→"#FF0000", "blue"→"#0000FF").
- Sizes: tiny=20, small=40, medium=80, large=140, huge=220. For circles, represent size by the distance between start and end (radius as line length).
- Relative positions from the prompt (e.g., "center", "top-right") must be converted to absolute:
  center=(W/2,H/2), top-left=(0,0), top=(W/2,0), top-right=(W,0),
  left=(0,H/2), right=(W,H/2), bottom-left=(0,H), bottom=(W/2,H), bottom-right=(W,H).

Style & tool selection:
- Prefer smooth, natural drawings using the freehand brush by default:
  - Use "tool": "freehand" and "type": "stroke" with a "points" array that traces the stroke.
- Match the existing canvas style from CanvasState.drawings:
  - If drawings are mostly geometric shapes (rectangles, circles, polygons, straight lines),
    then also use mostly "shape" commands.
  - If drawings are mostly strokes (drawingType === "stroke" or freehand-like paths),
    then use mostly freehand strokes.
  - If both are present, combine both:
    - Use shapes for rigid objects (buildings, cars, roads, UI panels, etc.).
    - Use freehand strokes for organic forms (trees, people, animals, clouds) and fine details.
- When following the user’s style, keep lineWidth and overall complexity visually consistent
  with the existing drawings.

Detail & realism:
- Treat each named object as something that should look like it was drawn by an expert.
- Avoid simple, undetailed blocks. Examples:
  - A "city" must not just be a few plain rectangles. Use multiple buildings and add windows,
    doors, and varied roof lines.
  - A "building" should have at least windows and a door, plus simple roof or edge details.
  - A "car" should at least show body, wheels, windows, and a hint of lights or motion.
- For complex or important objects (cities, buildings, cars, trees, faces,
  people):
  - Break them into several shapes and/or strokes (roughly 3–8 primitives per main object).
  - Add visible details using either small shapes or short freehand strokes.
- Keep the total number of objects modest: enough to look like a clean expert sketch,
  not hundreds of tiny primitives.

When CanvasState is provided:
- Avoid obvious overlaps with existing content unless the prompt demands it (e.g., “on top of…”).
- Keep new objects visually distinct (slight offsets are OK when crowded).
- Respect the existing composition: do not cover up important existing drawings unless
  the prompt says to replace or draw over something.

Content fidelity:
- Include EVERY explicitly mentioned object; respect counts, colors, sizes, and spatial relations.
- If motion/action is described, suggest simple visual cues (e.g., angled line, small polygon “arrow”, or secondary object) using primitives or strokes.
- If ambiguous, choose a common-sense default and continue.

Constraints:
- Output MUST be valid JSON matching the schema above. Do not include IDs (the app assigns them).
- Keep a modest number of objects (clear but not cluttered).
"""

# Few-shot to stabilize canvas-native formatting
FEWSHOT_USER_1 = """
CanvasState: {"drawings":[],"bounds":{"width":1800,"height":800}}
UserPrompt: draw a small blue circle at the top-right
"""

FEWSHOT_ASSISTANT_JSON_1 = {
    "objects": [
        {
            "color": "#0000FF",
            "lineWidth": 2,
            "pathData": {
                "tool": "shape",
                "type": "circle",
                "start": {"x": 2900, "y": 100},
                "end": {"x": 2940, "y": 100},
            },
        }
    ]
}

FEWSHOT_USER_2 = """
CanvasState:
{"drawings":[],"bounds":{"width":1800,"height":800}}
UserPrompt:
"draw a red car driving in the woods"
"""

FEWSHOT_ASSISTANT_JSON_2 = {
    "objects": [
        {
            "color": "#228B22",
            "lineWidth": 2,
            "pathData": {
                "tool": "shape",
                "type": "polygon",
                "points": [
                    {"x": 600, "y": 1050},
                    {"x": 650, "y": 950},
                    {"x": 700, "y": 1050},
                ],
            },
        },
        {
            "color": "#8B4513",
            "lineWidth": 2,
            "pathData": {
                "tool": "shape",
                "type": "rectangle",
                "start": {"x": 645, "y": 1050},
                "end": {"x": 655, "y": 1100},
            },
        },
        {
            "color": "#228B22",
            "lineWidth": 2,
            "pathData": {
                "tool": "shape",
                "type": "polygon",
                "points": [
                    {"x": 2300, "y": 1000},
                    {"x": 2350, "y": 900},
                    {"x": 2400, "y": 1000},
                ],
            },
        },
        {
            "color": "#8B4513",
            "lineWidth": 2,
            "pathData": {
                "tool": "shape",
                "type": "rectangle",
                "start": {"x": 2345, "y": 1000},
                "end": {"x": 2355, "y": 1050},
            },
        },
        {
            "color": "#555555",
            "lineWidth": 6,
            "pathData": {
                "tool": "shape",
                "type": "line",
                "start": {"x": 400, "y": 1400},
                "end": {"x": 2600, "y": 1500},
            },
        },
        {
            "color": "#FF0000",
            "lineWidth": 2,
            "pathData": {
                "tool": "shape",
                "type": "rectangle",
                "start": {"x": 1450, "y": 1380},
                "end": {"x": 1650, "y": 1450},
            },
        },
        {
            "color": "#FF0000",
            "lineWidth": 2,
            "pathData": {
                "tool": "shape",
                "type": "polygon",
                "points": [
                    {"x": 1500, "y": 1380},
                    {"x": 1600, "y": 1380},
                    {"x": 1550, "y": 1340},
                ],
            },
        },
        {
            "color": "#000000",
            "lineWidth": 2,
            "pathData": {
                "tool": "shape",
                "type": "circle",
                "start": {"x": 1500, "y": 1450},
                "end": {"x": 1520, "y": 1450},
            },
        },
        {
            "color": "#000000",
            "lineWidth": 2,
            "pathData": {
                "tool": "shape",
                "type": "circle",
                "start": {"x": 1600, "y": 1450},
                "end": {"x": 1620, "y": 1450},
            },
        },
        {
            "color": "#000000",
            "lineWidth": 2,
            "pathData": {
                "tool": "shape",
                "type": "line",
                "start": {"x": 1420, "y": 1415},
                "end": {"x": 1450, "y": 1400},
            },
        },
        # Example freehand stroke for grass/detail under the car
        {
            "color": "#006400",
            "lineWidth": 3,
            "pathData": {
                "tool": "freehand",
                "type": "stroke",
                "points": [
                    {"x": 1400, "y": 1505},
                    {"x": 1450, "y": 1498},
                    {"x": 1500, "y": 1502},
                    {"x": 1550, "y": 1496},
                    {"x": 1600, "y": 1500},
                ],
            },
        },
    ]
}

FEWSHOT_USER_3 = """
CanvasState:
{
  "drawings": [
    {"color":"#8B4513","lineWidth":2,"pathData":{"tool":"shape","type":"rectangle","start":{"x":1400,"y":1200},"end":{"x":1600,"y":1270}}},
    {"color":"#FF0000","lineWidth":2,"pathData":{"tool":"shape","type":"polygon","points":[{"x":1400,"y":1200},{"x":1500,"y":1120},{"x":1600,"y":1200}]}}
  ],
  "bounds":{"width":1800,"height":800}
}
UserPrompt:
"add a blue window to the right of the house"
"""

FEWSHOT_ASSISTANT_JSON_3 = {
    "objects": [
        {
            "color": "#0000FF",
            "lineWidth": 2,
            "pathData": {
                "tool": "shape",
                "type": "rectangle",
                "start": {"x": 1650, "y": 1210},
                "end": {"x": 1690, "y": 1245},
            },
        }
    ]
}


def _get_text_to_drawings_initial_message(
    prompt: str, canvasState: dict[str, typing.Any]
) -> list[dict]:
    """
    Build the minimal, few-shot seeded chat message list for the
    text→drawing JSON parser.

    Args:
        prompt: The end-user natural language description (e.g., "draw a small
                blue circle").
        canvasState (dict[str, Any]):
            A Python dictionary representing the current state of the canvas.

    Returns:
        A list of role/content dicts suitable for OpenAI/Ollama chat APIs:
        [system, user(few-shot), assistant(few-shot), user(actual prompt)].
    """
    canvas_json = json.dumps(canvasState, separators=(",", ":"))

    # Combine into a single message for the model
    user_prompt = (
        f"CanvasState:\n{canvas_json}\n"
        f"UserPrompt:\nDescribe all drawing commands (shapes and freehand strokes) "
        f"needed to draw this scene: {prompt}"
    )

    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": FEWSHOT_USER_1},
        {"role": "assistant", "content": json.dumps(FEWSHOT_ASSISTANT_JSON_1)},
        {"role": "user", "content": FEWSHOT_USER_2},
        {"role": "assistant", "content": json.dumps(FEWSHOT_ASSISTANT_JSON_2)},
        {"role": "user", "content": FEWSHOT_USER_3},
        {"role": "assistant", "content": json.dumps(FEWSHOT_ASSISTANT_JSON_3)},
        {"role": "user", "content": user_prompt},
    ]


def openai_prompt_to_json(prompt: str, canvasState: dict[str, typing.Any]) -> dict:
    """
    Convert a natural-language drawing prompt into structured JSON
    using the OpenAI GPT-4o-mini model.

    Args:
        prompt: The user's text prompt describing the drawing.

    Returns:
        Dict containing parsed drawing attributes or an error payload.
    """
    try:
        from config import OPENAI_API_KEY
        from openai import OpenAI

        if not OPENAI_API_KEY:
            return {"error": "openai_not_configured", "detail": "OPENAI_API_KEY is not set in environment"}

        client = OpenAI(api_key=OPENAI_API_KEY)

        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},  # forces valid JSON
            temperature=0.1,
            messages=_get_text_to_drawings_initial_message(prompt, canvasState),
            max_tokens=5000,
        )
        content = resp.choices[0].message.content
        return json.loads(content)
    except Exception as e:
        return {"error": "openai_failed", "detail": str(e)}


def ollama_prompt_to_json(prompt: str, canvasState: dict[str, typing.Any]) -> dict:
    """
    Convert a natural-language drawing prompt into structured JSON
    using a locally hosted Ollama model as a fallback.

    Args:
        prompt: The user's text prompt describing the drawing.

    Returns:
        Dict containing parsed drawing attributes or an error payload.
    """
    try:
        import ollama

        response = ollama.chat(
            model="llama3:8b",
            messages=_get_text_to_drawings_initial_message(prompt, canvasState),
        )

        return json.loads(response["message"]["content"])
    except Exception as e:
        return {"error": "ollama_failed", "detail": str(e)}


def prompt_to_drawings(prompt: str, canvasState: dict[str, typing.Any]) -> dict:
    """
    Route a drawing prompt to OpenAI first, then fall back to Ollama
    if the cloud model fails. Guarantees a dictionary response.

    Args:
        prompt: The user's text prompt describing the drawing.

    Returns:
        Dict containing parsed drawing attributes or an error payload.
    """
    model_output = openai_prompt_to_json(prompt, canvasState)

    # If user setup openai API's properly and no errors
    # occured, return the model's output
    if "error" not in model_output:
        return model_output

    # Fallback
    fallback_model_output = ollama_prompt_to_json(prompt, canvasState)
    return fallback_model_output


# === Shape Completion =========================================================
SHAPE_COMPLETION_SYSTEM = """
You are a drawing intent and completion engine for a canvas app.

You receive a CanvasState JSON object with:
- bounds: { "width": number, "height": number }
- drawings: array of drawing objects; the last one(s) are often the user's most recent strokes.
  Each drawing has fields like:
    - color: "#RRGGBB"
    - lineWidth: number
    - pathData:
        For freehand strokes:
          { "tool": "freehand", "type": "stroke",
            "points": [ { "x": number, "y": number }, ... ] }
        For geometric shapes:
          { "tool": "shape", "type": "line|rectangle|circle|polygon|text",
            "start": { "x": number, "y": number },
            "end":   { "x": number, "y": number },
            "points": [ { "x": number, "y": number }, ... ],
            "text": "optional" }

GOAL
1. First, infer what the user is trying to draw at a higher level:
   - Are they sketching a recognizable object (e.g., tree, house, car, plane, star, person, cloud)?
   - Or are they just drawing an abstract or standalone geometric shape (line, rectangle, circle, polygon)?
2. Then, infer the SINGLE most likely next primitive that would continue or complete that intent,
   matching the user's current drawing style:
   - If their recent drawings are mainly freehand strokes:
       → Predict the next stroke as a freehand stroke (tool = "freehand", type = "stroke").
   - If their recent drawings are mainly shapes:
       → Predict the next geometric shape (tool = "shape").
3. Always output ONE object that can be used as a "ghost" suggestion of what to draw next.

OUTPUT FORMAT (JSON ONLY, no comments, no markdown):
{
  "complete": true|false,
  "confidence": number,                 // 0.0–1.0
  "object": {
    "color": "#RRGGBB",
    "lineWidth": number,
    "pathData": {
      "tool": "shape|freehand",
      "type": "line|circle|rectangle|polygon|stroke|text",
      "start": { "x": number, "y": number },
      "end":   { "x": number, "y": number },
      "points": [ { "x": number, "y": number }, ... ],
      "text": "string"
    }
  }
}

STYLE MATCHING
- Look at the LAST few drawings in CanvasState.drawings.
- If most of them use { "tool": "freehand", "type": "stroke" },
  then your suggestion must also be a freehand stroke with a "points" array.
- If most of them use { "tool": "shape", ... },
  then your suggestion must be a geometric shape (line, rectangle, circle, polygon, or text).
- Preserve the approximate lineWidth and color of the user's most recent drawing.

SCALE & EXTENT (VERY IMPORTANT)
- Your suggestion should be a VISIBLE continuation, not a tiny jitter.
- Estimate the size of the user's most recent stroke or shape (its bounding box or start–end distance).
- For freehand strokes:
    - Make the new stroke span a similar scale (roughly 50%–150% of the last stroke's span).
    - Avoid strokes whose bounding box width AND height are both very small (e.g., less than ~20 pixels)
      unless ALL of the user's recent strokes are that small.
    - Prefer 8–30 points for a typical suggested stroke so it feels like a substantial continuation,
      not just a tiny segment.
- For shapes:
    - Suggested lines, rectangles, circles, or polygons should have a meaningful size as well,
      comparable to the existing elements they are extending.
    - Do NOT suggest micro-lines or tiny shapes unless the entire drawing is made of such tiny elements.

SEMANTIC INTENT
- Try to recognize common objects from the partial sketch: tree, car, house, plane, star, cloud, person, etc.
- If you can infer a likely object:
    - For a tree: you might add more foliage strokes, the trunk, or branches.
    - For a house: you might add the roof, door, or window.
    - For a car: you might add wheels, windows, or body details.
- If the sketch is too ambiguous or looks abstract:
    - Focus on geometric completion: straightening or extending a line,
      closing a polygon, or completing a circle/rectangle.

GEOMETRY AND BOUNDS
- Use ABSOLUTE pixel coordinates within [0, bounds.width] × [0, bounds.height],
  with (0,0) at the top-left.
- For shapes:
    - line/rectangle/circle must include "start" and "end".
    - polygon must include "points".
- For freehand strokes:
    - Provide a "points" array with an ordered path for the stroke.
    - Points should form a smooth, coherent segment that clearly continues the drawing.

CONFIDENCE AND COMPLETENESS
- Use "confidence" to express how sure you are about the user's intent.
- If you are very unsure (confidence < 0.4):
    - Set "complete": false.
    - Still return your best-effort next primitive so the UI can show a light ghost suggestion.
- If the suggestion would clearly complete a part of the object (e.g., final wheel, final edge, roof line):
    - You may set "complete": true for that part, even if the whole scene is not finished.

COLOR AND WIDTH
- Default color: use the color of the user's last drawing if available; otherwise "#000000".
- Default lineWidth: match the user's last drawing's lineWidth, or use 2 if missing.

CONSTRAINTS
- Output MUST be valid JSON and MUST match the schema above.
- Do NOT output explanations, natural language, or multiple objects.
- Always return a single best "object" that predicts the next stroke or shape.
"""


SHAPE_COMPLETION_FEWSHOT_USER_1 = """
CanvasState:
{
  "drawings": [
    {
      "color": "#228B22",
      "lineWidth": 3,
      "pathData": {
        "tool": "freehand",
        "type": "stroke",
        "points": [
          {"x": 300, "y": 200},
          {"x": 340, "y": 180},
          {"x": 380, "y": 210},
          {"x": 360, "y": 240},
          {"x": 320, "y": 230},
          {"x": 300, "y": 200}
        ]
      }
    }
  ],
  "bounds": {"width":1200,"height":800}
}
"""

SHAPE_COMPLETION_FEWSHOT_ASSISTANT_JSON_1 = {
    "complete": False,
    "confidence": 0.78,
    "object": {
        "color": "#228B22",
        "lineWidth": 3,
        "pathData": {
            "tool": "freehand",
            "type": "stroke",
            "points": [
                {"x": 340, "y": 220},
                {"x": 380, "y": 230},
                {"x": 410, "y": 210},
                {"x": 400, "y": 180},
                {"x": 370, "y": 170},
                {"x": 340, "y": 180}
            ]
        },
    },
}


SHAPE_COMPLETION_FEWSHOT_USER_2 = """
CanvasState:
{
  "drawings": [
    {
      "color": "#8B4513",
      "lineWidth": 2,
      "pathData": {
        "tool": "shape",
        "type": "rectangle",
        "start": {"x": 400, "y": 300},
        "end":   {"x": 600, "y": 450}
      }
    },
    {
      "color": "#8B0000",
      "lineWidth": 2,
      "pathData": {
        "tool": "shape",
        "type": "polygon",
        "points": [
          {"x": 400, "y": 300},
          {"x": 500, "y": 220},
          {"x": 600, "y": 300}
        ]
      }
    }
  ],
  "bounds": {"width":1200,"height":800}
}
"""

SHAPE_COMPLETION_FEWSHOT_ASSISTANT_JSON_2 = {
    "complete": False,
    "confidence": 0.85,
    "object": {
        "color": "#654321",
        "lineWidth": 2,
        "pathData": {
            "tool": "shape",
            "type": "rectangle",
            "start": {"x": 470, "y": 360},
            "end":   {"x": 530, "y": 450}
        },
    },
}

SHAPE_COMPLETION_FEWSHOT_USER_3 = """
CanvasState:
{
  "drawings": [
    {
      "color": "#FF0000",
      "lineWidth": 3,
      "pathData": {
        "tool": "freehand",
        "type": "stroke",
        "points": [
          {"x": 600, "y": 500},
          {"x": 650, "y": 480},
          {"x": 720, "y": 460},
          {"x": 800, "y": 460},
          {"x": 880, "y": 480},
          {"x": 930, "y": 510}
        ]
      }
    }
  ],
  "bounds": {"width":1800,"height":800}
}
"""

SHAPE_COMPLETION_FEWSHOT_ASSISTANT_JSON_3 = {
    "complete": False,
    "confidence": 0.70,
    "object": {
        "color": "#000000",
        "lineWidth": 3,
        "pathData": {
            "tool": "freehand",
            "type": "stroke",
            "points": [
                {"x": 680, "y": 510},
                {"x": 700, "y": 540},
                {"x": 730, "y": 550},
                {"x": 760, "y": 540},
                {"x": 780, "y": 510}
            ]
        },
    },
}

def _get_shape_completion_initial_message(
    canvas_state: dict[str, typing.Any]
) -> list[dict]:
    """
    Build the few-shot seeded chat messages for shape completion.

    Args:
        canvas_state (dict[str, Any]):
            The current canvas state. Expected keys:
              - "drawings": list of existing drawings (color, lineWidth, pathData, etc.)
              - "bounds": { "width": number, "height": number }

    Returns:
        list[dict]: Chat messages for OpenAI/Ollama APIs:
            [system, user(few-shot), assistant(few-shot), user(few-shot), assistant(few-shot), user(actual)]
    """
    canvas_json = json.dumps(canvas_state, separators=(",", ":"))
    user_msg = f"CanvasState:\n{canvas_json}"

    return [
        {"role": "system", "content": SHAPE_COMPLETION_SYSTEM},
        {"role": "user", "content": SHAPE_COMPLETION_FEWSHOT_USER_1},
        {"role": "assistant", "content": json.dumps(SHAPE_COMPLETION_FEWSHOT_ASSISTANT_JSON_1)},
        {"role": "user", "content": SHAPE_COMPLETION_FEWSHOT_USER_2},
        {"role": "assistant", "content": json.dumps(SHAPE_COMPLETION_FEWSHOT_ASSISTANT_JSON_2)},
        {"role": "user", "content": SHAPE_COMPLETION_FEWSHOT_USER_3},
        {"role": "assistant", "content": json.dumps(SHAPE_COMPLETION_FEWSHOT_ASSISTANT_JSON_3)},
        {"role": "user", "content": user_msg},
    ]


def openai_complete_shape(canvas_state: dict) -> dict:
    """
    Infer and complete a likely shape from the current partial input using OpenAI.

    Args:
        canvas_state (dict): Current canvas (drawings + bounds).

    Returns:
        dict: { complete, confidence, object{ color, lineWidth, pathData{...} } } or error payload.
    """
    try:
        from config import OPENAI_API_KEY
        from openai import OpenAI

        client = OpenAI(api_key=OPENAI_API_KEY)

        resp = client.chat.completions.create(
            model="gpt-4.1-mini",
            response_format={"type": "json_object"},
            temperature=0.1,
            messages=_get_shape_completion_initial_message(canvas_state),
            max_tokens=220,
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as e:
        return {"error": "openai_completion_failed", "detail": str(e)}


def ollama_complete_shape(canvas_state: dict) -> dict:
    """
    Infer and complete a likely shape from the current partial input using Ollama.

    Args:
        canvas_state (dict): Current canvas (drawings + bounds).

    Returns:
        dict: { complete, confidence, object{ color, lineWidth, pathData{...} } } or error payload.
    """
    try:
        import ollama

        response = ollama.chat(
            model="llama3:8b",
            messages=_get_shape_completion_initial_message(canvas_state),
        )
        return json.loads(response["message"]["content"])
    except Exception as e:
        return {"error": "ollama_completion_failed", "detail": str(e)}


def complete_shape_from_canvas(canvas_state: dict) -> dict:
    """
    Perform AI-based shape completion using OpenAI first, then Ollama.

    Args:
        canvas_state (dict): Current canvas (drawings + bounds).

    Returns:
        dict: Inferred shape completion result.
    """
    model_output = openai_complete_shape(canvas_state)
    if "error" not in model_output:
        return model_output
    return ollama_complete_shape(canvas_state)


# === Canvas Beautification (canvas-state) ======================
BEAUTIFY_SYSTEM_PROMPT = """
You are a sketch beautifier for a canvas drawing app.

You receive a CanvasState JSON object with:
- width: number
- height: number
- objects: array of drawing objects, each with:
    - id: string
    - color: "#RRGGBB"
    - lineWidth: number
    - pathData:
        For freehand strokes:
          {
            "tool": "freehand",
            "type": "stroke",
            "points": [ { "x": number, "y": number }, ... ]
          }
        For geometric shapes:
          {
            "tool": "shape",
            "type": "line|rectangle|circle|polygon|text",
            "start": { "x": number, "y": number },
            "end":   { "x": number, "y": number },
            "points": [ { "x": number, "y": number }, ... ],
            "text": "optional"
          }

GOAL
Transform the input CanvasState into a BEAUTIFIED version of the same drawing.
- Keep the overall composition, layout, and intent the same.
- Make the drawing look smoother, cleaner, and more deliberate.
- Always return your highest-quality beautification.

OUTPUT FORMAT (JSON ONLY, no comments, no markdown):
{
  "objects": [
    {
      "id": "string",
      "color": "#RRGGBB",
      "lineWidth": number,
      "pathData": {
        "tool": "shape|freehand",
        "type": "line|rectangle|circle|polygon|stroke|text",
        "start": { "x": number, "y": number },
        "end":   { "x": number, "y": number },
        "points": [ { "x": number, "y": number }, ... ],
        "text": "string"
      }
    },
    ...
  ]
}

BEAUTIFICATION RULES

PRESERVE INTENT
- Do NOT change what the user is drawing: a tree must remain a tree, a car remains a car, a house remains a house, etc.
- Do NOT radically move objects: positions should remain similar; small adjustments to align or straighten are allowed.
- Keep overall proportions and relative sizes of parts (e.g., door vs house, wheels vs car body).

STROKE SMOOTHING (FREEHAND)
- For freehand strokes (tool = "freehand", type = "stroke"):
    - Remove jitter and noise; smooth the path into more confident curves and lines.
    - Use a reasonable number of points: not too sparse and not excessively dense.
      In general, 16–64 points per long stroke is enough.
    - Ensure the stroke flows smoothly with consistent direction and curvature.
    - Preserve the approximate start and end positions and overall shape of the stroke.

GEOMETRIC CLEANUP (SHAPES)
- For lines, rectangles, circles, and polygons (tool = "shape"):
    - Straighten almost-straight lines.
    - Regularize rectangles so opposite sides are parallel and corners are clean.
    - Regularize circles or ellipses to look smooth and round.
    - Clean polygon vertices so angles look intentional, not wobbly.
- You MAY, when appropriate, upgrade a clearly intended shape drawn as a messy stroke
  into a cleaner geometric shape (e.g., a wobbly "shape" polygon into a neat rectangle),
  as long as the user's intent is obvious and the style of the rest of the drawing is respected.

STYLE PRESERVATION
- Maintain the existing color palette and lineWidth relationships.
- Do NOT randomly change colors.
- Line widths can be slightly adjusted for consistency, but must feel similar to the original.
- If the whole drawing is sketchy and loose, keep a sketchy-but-clean look rather than making it fully technical or CAD-like.

GLOBAL CONSISTENCY
- Objects that belong together (e.g., house and roof, car body and wheels, tree trunk and foliage)
  should remain visually aligned and coherent after beautification.
- You may slightly align related parts (e.g., windows in a row, wheels centered vertically) if it improves cleanliness without changing the composition.

CONSTRAINTS
- You must return a JSON object with an "objects" array using the same schema as above.
- The number of objects should usually be similar to the input; you may split or merge strokes when it clearly improves the visual quality, but do not randomly add or remove important elements.
- Do NOT output explanations, natural language, or extra fields.
- Do NOT leave the drawing partially processed: every object should be beautified as needed.
"""

BEAUTIFY_FEWSHOT_USER_1 = """
CanvasState:
{
  "width": 800,
  "height": 600,
  "objects": [
    {
      "id": "stroke1",
      "color": "#000000",
      "lineWidth": 3,
      "pathData": {
        "tool": "freehand",
        "type": "stroke",
        "points": [
          {"x": 100, "y": 300},
          {"x": 130, "y": 295},
          {"x": 160, "y": 290},
          {"x": 190, "y": 292},
          {"x": 220, "y": 300},
          {"x": 250, "y": 310},
          {"x": 280, "y": 315}
        ]
      }
    }
  ]
}
"""

BEAUTIFY_FEWSHOT_ASSISTANT_JSON_1 = {
    "objects": [
        {
            "id": "stroke1",
            "color": "#000000",
            "lineWidth": 3,
            "pathData": {
                "tool": "freehand",
                "type": "stroke",
                "points": [
                    {"x": 100, "y": 300},
                    {"x": 130, "y": 295},
                    {"x": 160, "y": 292},
                    {"x": 190, "y": 295},
                    {"x": 220, "y": 302},
                    {"x": 250, "y": 310},
                    {"x": 280, "y": 315}
                ]
            }
        }
    ]
}


BEAUTIFY_FEWSHOT_USER_2 = """
CanvasState:
{
  "width": 800,
  "height": 600,
  "objects": [
    {
      "id": "rect1",
      "color": "#333333",
      "lineWidth": 2,
      "pathData": {
        "tool": "shape",
        "type": "rectangle",
        "start": {"x": 200, "y": 200},
        "end":   {"x": 400, "y": 320}
      }
    }
  ]
}
"""

BEAUTIFY_FEWSHOT_ASSISTANT_JSON_2 = {
    "objects": [
        {
            "id": "rect1",
            "color": "#333333",
            "lineWidth": 2,
            "pathData": {
                "tool": "shape",
                "type": "rectangle",
                "start": {"x": 200, "y": 200},
                "end":   {"x": 400, "y": 320}
            }
        }
    ]
}


def _get_beautify_canvas_initial_message(
    canvas_state: dict[str, typing.Any]
) -> list[dict]:
    """
    Build few-shot seeded messages for beautification.
    """
    canvas_json = json.dumps(canvas_state, ensure_ascii=False)
    
    return [
        {"role": "system", "content": BEAUTIFY_SYSTEM_PROMPT},
        {"role": "user", "content": BEAUTIFY_FEWSHOT_USER_1},
        {"role": "assistant", "content": json.dumps(BEAUTIFY_FEWSHOT_ASSISTANT_JSON_1)},
        {"role": "user", "content": BEAUTIFY_FEWSHOT_USER_2},
        {"role": "assistant", "content": json.dumps(BEAUTIFY_FEWSHOT_ASSISTANT_JSON_2)},
        {"role": "user", "content": f"CanvasState:\n{canvas_json}"},
    ]

def openai_beautify_canvas(
    canvas_state: dict[str, typing.Any],
) -> dict:
    """
    Beautify the canvas using OpenAI. Returns either:
      { "objects": [...] }
    or
      { "error": "...", "detail": "..." }
    """
    try:
        from config import OPENAI_API_KEY
        from openai import OpenAI

        client = OpenAI(api_key=OPENAI_API_KEY)

        resp = client.chat.completions.create(
            model="gpt-4.1-mini",
            response_format={"type": "json_object"},  # forces JSON
            temperature=0.1,
            messages=_get_beautify_canvas_initial_message(canvas_state),
            max_tokens=10000,
        )

        content = resp.choices[0].message.content

        print(f"\n\n{content}\n\n")
        parsed = json.loads(content)
        print(f"\n\n{parsed}\n\n")

        return parsed

    except Exception as e:
        return {"error": "openai_beautify_failed", "detail": str(e)}


def ollama_beautify_canvas(
    canvas_state: dict[str, typing.Any]
) -> dict:
    """
    Beautify the canvas using a local Ollama model. Same contract as
    openai_beautify_canvas: either { "objects": [...] } or { "error": ... }.
    """
    try:
        import ollama

        response = ollama.chat(
            model="llama3:8b",
            messages=_get_beautify_canvas_initial_message(canvas_state),
        )

        parsed = json.loads(response["message"]["content"])

        if not isinstance(parsed, dict) or "objects" not in parsed:
            return {
                "error": "ollama_beautify_invalid_output",
                "detail": "Missing 'objects' field in model response.",
            }

        if not isinstance(parsed["objects"], list):
            return {
                "error": "ollama_beautify_invalid_output",
                "detail": "'objects' is not a list in model response.",
            }

        return parsed

    except Exception as e:
        return {"error": "ollama_beautify_failed", "detail": str(e)}


def beautify_canvas_state(
    canvas_state: dict[str, typing.Any]
) -> dict:
    """
    Perform AI-based canvas beautification with rollback, following the
    same pattern as prompt_to_drawings and complete_shape_from_canvas.

    Order:
      1) Try OpenAI.
      2) If that fails or returns invalid output, try Ollama.
      3) If both fail, ROLLBACK to the ORIGINAL drawings and return:
         { "objects": canvas_state.drawings }

    Returns:
        dict with at least:
          { "objects": [...] }
    """
    # Primary: OpenAI
    model_output = openai_beautify_canvas(canvas_state)
    if "error" not in model_output and "objects" in model_output:
        return model_output

    print(f"\n\nFAILED OPENAI API!: {model_output} \n\n")

    # Fallback: Ollama
    fallback_output = ollama_beautify_canvas(canvas_state)
    if "error" not in fallback_output and "objects" in fallback_output:
        return fallback_output

    # Rollback: both failed => return original drawings as objects
    original_drawings = canvas_state.get("objects", [])
    return {"objects": original_drawings}
# === Style Transfer (apply an artistic style to an existing canvas) ==========
STYLE_TRANSFER_SYSTEM = """
You are an artistic style transfer engine for a canvas app.

Inputs:
- CanvasState: { "width": number, "height": number, "objects": [ { id, color, lineWidth, pathData, ... } ] }
- StylePrompt: short natural language description of the style to apply (e.g. "Van Gogh oil painting", "watercolor sketch", "8-bit pixel art").

Goal:
Return a JSON object with an "objects" array representing the same scene but restyled to match the StylePrompt.
You may output rasterized image objects by returning objects with { "drawingType":"image", "imageDataUrl": "data:image/png;base64,...", "x":0, "y":0, "width":W, "height":H }.
Prefer returning vector-like modifications (colors, stroke styles, simplified geometry) when possible.

Output (JSON ONLY):
{
    "objects": [ ... ]
}

Constraints:
- Keep the same composition and relative positions. Do not invent new major scene elements.
- Output valid JSON. The app will accept either vector objects (shape/freehand) or image objects with data URLs.

Renderer-capabilities and metadata guidance for the model:

When producing vector strokes/objects, you SHOULD (when appropriate) include an optional `metadata` object on each returned object describing how the canvas renderer should display the primitive using ResCanvas features. Allowed metadata fields and helper functions:

- `drawingType`: "stroke" | "image" | "stamp"         (default: "stroke")
- `brushType`: string (one of: "normal", "wacky", "drip", "scatter", "neon", "chalk", "spray", "mixed")
- `brushParams`: object (tool-specific parameters, e.g. { "scatterAmount": 0.3, "texture":"thick", "mixColors": ["#FFCC33","#FF9900"] })
- `stampData`: object (for stamps/images: { "imageDataUrl": string, "x": number, "y": number, "width": number, "height": number })

Additionally, you may think in terms of small renderer functions the frontend provides; include which function you would like to use by setting `metadata.brushType` (or `drawingType:"stamp"` + `stampData`). Example functions available to you:

- Brush(brushType, brushParams): draws strokes with the named brush and parameters.
- MixedColor(colors[]): blends several palette colors for richer strokes.
- Stamp(imageDataUrl, x, y, width, height): places a raster/stamp element.

If the model cannot produce a full vector restyling, it may return a single image object with a data URL (drawingType: "image"). Prefer vector output when possible. If you include `brushType` and `brushParams`, the frontend will attempt to render strokes using the project's brush implementations.
"""

# Few-shot example to show how to emit metadata for a Van Gogh oil-painting style
FEWSHOT_STYLE_USER_1 = """
CanvasState:
{
    "objects": [
        {"color":"#FFD700","lineWidth":4,"pathData":{"tool":"shape","type":"circle","start":{"x":1600,"y":80},"end":{"x":1640,"y":80}}}
    ],
    "width":1800,
    "height":800
}
StylePrompt:
Van Gogh oil painting
"""

FEWSHOT_STYLE_ASSISTANT_JSON_1 = {
        "objects": [
                {
                        "color": "#FFCC33",
                        "lineWidth": 5,
                        "pathData": {
                                "tool": "freehand",
                                "type": "stroke",
                                "points": [
                                        {"x":1590, "y":70},
                                        {"x":1605, "y":60},
                                        {"x":1620, "y":70},
                                        {"x":1635, "y":90},
                                        {"x":1645, "y":85}
                                ]
                        },
                        "metadata": {
                                "drawingType": "stroke",
                                "brushType": "wacky",
                                "brushParams": {
                                        "texture": "thick",
                                        "mixColors": ["#FFCC33", "#FF9900", "#FFFF66"],
                                        "opacity": 0.9
                                }
                        }
                }
        ]
}

# Few-shot 2: watercolor / wash example that prefers soft scatter spray brush
FEWSHOT_STYLE_USER_2 = """
CanvasState:
{
  "objects": [
    {"color":"#228B22","lineWidth":3,"pathData":{"tool":"freehand","type":"stroke","points":[{"x":200,"y":300},{"x":260,"y":280}]}}
  ],
  "width":1200,
  "height":800
}
StylePrompt:
watercolor wash
"""

FEWSHOT_STYLE_ASSISTANT_JSON_2 = {
    "objects": [
        {
            "color": "#2E8B57",
            "lineWidth": 4,
            "pathData": {
                "tool": "freehand",
                "type": "stroke",
                "points": [
                    {"x":195, "y":295},
                    {"x":225, "y":285},
                    {"x":255, "y":290}
                ]
            },
            "metadata": {
                "drawingType": "stroke",
                "brushType": "spray",
                "brushParams": {"opacity": 0.55, "scatterAmount": 0.25}
            }
        }
    ]
}

# Few-shot 3: stamp example (rasterized element) demonstrating stampData
FEWSHOT_STYLE_USER_3 = """
CanvasState:
{
  "objects": [
    {"color":"#8B4513","lineWidth":2,"pathData":{"tool":"shape","type":"rectangle","start":{"x":400,"y":300},"end":{"x":600,"y":450}}}
  ],
  "width":1200,
  "height":800
}
StylePrompt:
children sticker stamps
"""

FEWSHOT_STYLE_ASSISTANT_JSON_3 = {
    "objects": [
        {
            "drawingType": "image",
            "imageDataUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA",
            "x": 420,
            "y": 320,
            "width": 80,
            "height": 80,
            "metadata": {
                "drawingType": "stamp",
                "stampData": {
                    "imageDataUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA",
                    "x": 420,
                    "y": 320,
                    "width": 80,
                    "height": 80
                }
            }
        }
    ]
}


def _get_style_transfer_message(canvas_state: dict, style_prompt: str) -> list[dict]:
    canvas_json = json.dumps(canvas_state, ensure_ascii=False)
    user_msg = f"CanvasState:\n{canvas_json}\nStylePrompt:\n{style_prompt}"
    return [
        {"role": "system", "content": STYLE_TRANSFER_SYSTEM},
        {"role": "user", "content": FEWSHOT_STYLE_USER_1},
        {"role": "assistant", "content": json.dumps(FEWSHOT_STYLE_ASSISTANT_JSON_1)},
        {"role": "user", "content": user_msg},
    ]


def openai_style_transfer(canvas_state: dict, style_prompt: str) -> dict:
    try:
        from config import OPENAI_API_KEY
        from openai import OpenAI

        client = OpenAI(api_key=OPENAI_API_KEY)

        resp = client.chat.completions.create(
            model="gpt-4.1-mini",
            response_format={"type": "json_object"},
            temperature=0.2,
            messages=_get_style_transfer_message(canvas_state, style_prompt),
            max_tokens=8000,
        )

        content = resp.choices[0].message.content
        return json.loads(content)
    except Exception as e:
        return {"error": "openai_style_failed", "detail": str(e)}


def ollama_style_transfer(canvas_state: dict, style_prompt: str) -> dict:
    try:
        import ollama

        response = ollama.chat(
            model="llama3:8b",
            messages=_get_style_transfer_message(canvas_state, style_prompt),
        )

        return json.loads(response["message"]["content"])
    except Exception as e:
        return {"error": "ollama_style_failed", "detail": str(e)}


def _map_style_to_brush(style_prompt: str) -> tuple[str, dict]:
    """Map style prompts to brush types and parameters."""
    s = (style_prompt or "").lower()
    brush = "normal"
    params: dict = {}

    if "watercolor" in s or "wash" in s:
        brush = "spray"
        params = {"opacity": 0.6, "scatterAmount": 0.2}
    elif "van gogh" in s or "oil" in s or "impasto" in s:
        # Van Gogh / oil styles benefit from mixed, textured strokes. Use
        # a `mixed` brushType with a base `wacky` texture and a small
        # palette to blend for thicker impasto-like strokes.
        brush = "mixed"
        params = {
            "base": "wacky",
            "texture": "thick",
            "mixColors": ["#FFCC33", "#FF9900", "#FFFF66"],
            "opacity": 0.9,
            "mixAmount": 0.6,
        }
    elif "neon" in s or "glow" in s:
        brush = "neon"
        params = {"glow": True, "intensity": 0.9}
    elif "chalk" in s or "pastel" in s:
        brush = "chalk"
        params = {"grain": 0.6}
    elif "spray" in s or "splatter" in s:
        brush = "spray"
        params = {"scatterAmount": 0.5}
    elif "drip" in s:
        brush = "drip"
        params = {"dripRate": 0.4}
    elif "scatter" in s:
        brush = "scatter"
        params = {"scatterAmount": 0.4}
    elif "mixed" in s:
        brush = "mixed"
        params = {"mixColors": ["#FFFFFF", "#000000"], "mixAmount": 0.5}
    elif "stamp" in s or "sticker" in s or "collage" in s:
        brush = "normal"
        params = {"preferStamp": True}

    return brush, params


def _postprocess_style_objects(objects: list, style_prompt: str) -> list:
    """
    Ensure objects include metadata dict with brushType/brushParams or stampData.
    """
    if not isinstance(objects, list):
        return objects

    default_brush, default_params = _map_style_to_brush(style_prompt)

    processed = []
    had_explicit_metadata = False

    for obj in objects:
        if not isinstance(obj, dict):
            processed.append(obj)
            continue

        had_meta = "metadata" in obj
        meta = obj.get("metadata", {}) or {}

        if obj.get("drawingType") == "image" or obj.get("imageDataUrl"):
            meta.setdefault("drawingType", "image")
            meta.setdefault("stampData", {
                "imageDataUrl": obj.get("imageDataUrl") or obj.get("image"),
                "x": obj.get("x", 0),
                "y": obj.get("y", 0),
                "width": obj.get("width"),
                "height": obj.get("height"),
            })
        else:
            meta.setdefault("drawingType", "stroke")
            meta.setdefault("brushType", meta.get("brushType", default_brush))
            meta.setdefault("brushParams", meta.get("brushParams", default_params))

        obj["metadata"] = meta
        processed.append(obj)

        if had_meta and isinstance(meta, dict) and meta.get("brushType"):
            had_explicit_metadata = True

    s = (style_prompt or "").lower()
    if ("van gogh" in s or "oil" in s or "impasto" in s) and not had_explicit_metadata:
        overlays = []
        for idx, obj in enumerate(processed):
            if not isinstance(obj, dict):
                continue
            if obj.get("metadata", {}).get("drawingType") == "image":
                continue

            bbox = _bbox_from_path(obj.get("pathData", {}))
            if bbox is None:
                continue

            overlay_objs = _create_impasto_overlays(obj, bbox, default_params, idx)
            overlays.extend(overlay_objs)

        processed.extend(overlays)

    return processed


def _bbox_from_path(pathData: dict) -> typing.Optional[dict]:
    """
    Compute a simple bounding box from a pathData dict. Returns None if
    no usable geometry is present.
    """
    if not isinstance(pathData, dict):
        return None

    xs = []
    ys = []

    if "points" in pathData and isinstance(pathData["points"], list):
        for p in pathData["points"]:
            try:
                xs.append(float(p.get("x", 0)))
                ys.append(float(p.get("y", 0)))
            except Exception:
                continue
    else:
        # Try start/end
        start = pathData.get("start")
        end = pathData.get("end")
        if isinstance(start, dict) and isinstance(end, dict):
            try:
                xs.extend([float(start.get("x", 0)), float(end.get("x", 0))])
                ys.extend([float(start.get("y", 0)), float(end.get("y", 0))])
            except Exception:
                pass

    if not xs or not ys:
        return None

    return {"min_x": min(xs), "max_x": max(xs), "min_y": min(ys), "max_y": max(ys)}


def _create_impasto_overlays(obj: dict, bbox: dict, default_params: dict, idx: int) -> list:
    """
    Create overlay freehand strokes to emulate impasto texture.
    """
    overlays = []

    color = obj.get("metadata", {}).get("brushParams", {}).get("mixColors", [])
    if color and isinstance(color, list):
        overlay_color = color[0]
    else:
        overlay_color = obj.get("color", "#000000")

    width = bbox["max_x"] - bbox["min_x"]
    height = bbox["max_y"] - bbox["min_y"]
    cx = (bbox["min_x"] + bbox["max_x"]) / 2
    cy = (bbox["min_y"] + bbox["max_y"]) / 2

    offs = ((idx % 3) - 1) * 4

    def make_stroke(rel_points, lw_mult):
        pts = []
        for rx, ry in rel_points:
            pts.append({"x": cx + rx * width + offs, "y": cy + ry * height + offs})
        return {
            "color": overlay_color,
            "lineWidth": max(2, int(obj.get("lineWidth", 2) * lw_mult)),
            "pathData": {"tool": "freehand", "type": "stroke", "points": pts},
            "metadata": {
                "drawingType": "stroke",
                "brushType": default_params.get("base", "wacky") if isinstance(default_params, dict) else "wacky",
                "brushParams": dict(default_params or {}, **{"opacity": default_params.get("opacity", 0.9)})
            }
        }

    stroke1 = make_stroke([( -0.3, -0.2), ( -0.1, -0.25), (0.1, -0.15)], 1.0)
    stroke2 = make_stroke([( -0.4, 0.1), (0.0, 0.15), (0.35, 0.05)], 1.3)

    overlays.append(stroke1)
    overlays.append(stroke2)

    return overlays


def style_transfer_canvas(canvas_state: dict, style_prompt: str) -> dict:
    """Apply style transfer to canvas using OpenAI or Ollama."""
    model_output = openai_style_transfer(canvas_state, style_prompt)
    if isinstance(model_output, dict) and "error" not in model_output and "objects" in model_output:
        model_output["objects"] = _postprocess_style_objects(model_output.get("objects", []), style_prompt)
        return model_output

    fallback_output = ollama_style_transfer(canvas_state, style_prompt)
    if isinstance(fallback_output, dict) and "error" not in fallback_output and "objects" in fallback_output:
        fallback_output["objects"] = _postprocess_style_objects(fallback_output.get("objects", []), style_prompt)
        return fallback_output

    original_objects = canvas_state.get("objects", [])
    return {"objects": original_objects}


# === Simple Vector-based Object Recognition =================================
RECOGNITION_SYSTEM = """
You are an object recognizer for a vector canvas. IMPORTANT: the inputs you
receive are vector primitives (shapes and freehand strokes) encoded as JSON
geometry (points, start/end for shapes, line widths, and colors). These are
NOT raster images — do not assume photographic textures or pixels. Use the
geometric cues (circle-like points, grouped strokes, polygons, repeated
small circles for wheels, trunk+foliage strokes for trees, etc.) to form your
label.

You will be given a small JSON payload describing the subset of canvas
objects that intersect the user's selection box and the bounding box itself.
Return a single JSON object containing a short `label` describing the primary
object or scene contained in the selection, a `confidence` score between 0.0
and 1.0, and an optional short `explanation` that states which geometric cues
led to the label.

OUTPUT (JSON ONLY):
{
    "label": "string",
    "confidence": number,   // 0.0 - 1.0
    "explanation": "string (optional)"
}

Rules:
- Prefer concise common-sense labels (e.g., "tree", "car", "house", "face",
    "circle", "text: 'Hello'", "unknown"). If unsure, return "unknown" with
    a low confidence (e.g., 0.2).
- Use confidence to reflect certainty; 0.6+ for reasonable guesses, 0.85+ for
    strong matches.
- Do not invent objects not supported by the provided geometry; prefer
    conservative labels when ambiguous.
"""

# Few-shot examples to anchor vector-domain recognition expectations
FEWSHOT_RECO_USER_1 = '''
SelectionBox:
{"x":100,"y":50,"width":60,"height":60}
CanvasObjects:
{"objects":[{"color":"#000000","lineWidth":2,"pathData":{"tool":"shape","type":"circle","start":{"x":130,"y":80},"end":{"x":150,"y":80}}}],"bounds":{"width":400,"height":300}}
'''

FEWSHOT_RECO_ASSISTANT_1 = {"label": "circle", "confidence": 0.95, "explanation": "Single circular shape primitive (start/end) within selection."}

FEWSHOT_RECO_USER_2 = '''
SelectionBox:
{"x":200,"y":200,"width":120,"height":150}
CanvasObjects:
{"objects":[{"color":"#8B4513","lineWidth":3,"pathData":{"tool":"freehand","type":"stroke","points":[{"x":240,"y":230},{"x":245,"y":270},{"x":250,"y":310}]}},{"color":"#228B22","lineWidth":2,"pathData":{"tool":"freehand","type":"stroke","points":[{"x":220,"y":210},{"x":230,"y":190},{"x":250,"y":200},{"x":270,"y":210}]}}],"bounds":{"width":800,"height":600}}
'''

FEWSHOT_RECO_ASSISTANT_2 = {"label": "tree", "confidence": 0.88, "explanation": "Brown trunk stroke plus clustered green freehand strokes resembling foliage."}

FEWSHOT_RECO_USER_3 = '''
SelectionBox:
{"x":140,"y":120,"width":220,"height":120}
CanvasObjects:
{"objects":[{"color":"#FF0000","lineWidth":2,"pathData":{"tool":"shape","type":"rectangle","start":{"x":150,"y":160},"end":{"x":320,"y":210}}},{"color":"#000000","lineWidth":2,"pathData":{"tool":"shape","type":"circle","start":{"x":180,"y":210},"end":{"x":200,"y":210}}},{"color":"#000000","lineWidth":2,"pathData":{"tool":"shape","type":"circle","start":{"x":270,"y":210},"end":{"x":290,"y":210}}}],"bounds":{"width":800,"height":600}}
'''

FEWSHOT_RECO_ASSISTANT_3 = {"label": "car", "confidence": 0.92, "explanation": "Rectangular body plus two circular wheel primitives along its bottom edge."}

FEWSHOT_RECO_USER_4 = '''
SelectionBox:
{"x":100,"y":100,"width":220,"height":200}
CanvasObjects:
{"objects":[{"color":"#8B4513","lineWidth":2,"pathData":{"tool":"shape","type":"rectangle","start":{"x":120,"y":180},"end":{"x":260,"y":260}}},{"color":"#FF0000","lineWidth":2,"pathData":{"tool":"shape","type":"polygon","points":[{"x":120,"y":180},{"x":190,"y":120},{"x":260,"y":180}]}}],"bounds":{"width":800,"height":600}}
'''

FEWSHOT_RECO_ASSISTANT_4 = {"label": "house", "confidence": 0.9, "explanation": "Rectangle base plus triangular roof polygon — typical house geometry."}

FEWSHOT_RECO_USER_5 = '''
SelectionBox:
{"x":50,"y":50,"width":200,"height":80}
CanvasObjects:
{"objects":[{"color":"#000000","lineWidth":2,"pathData":{"tool":"shape","type":"text","text":"Hello"}}],"bounds":{"width":400,"height":200}}
'''

FEWSHOT_RECO_ASSISTANT_5 = {"label": "text: 'Hello'", "confidence": 0.98, "explanation": "A text primitive with the exact string 'Hello' present in the selection."}

def _get_recognition_message(canvas_objects: list, box: dict, bounds: dict) -> list[dict]:
    objs_json = json.dumps({"objects": canvas_objects, "bounds": bounds}, ensure_ascii=False)
    user_msg = f"SelectionBox:\n{json.dumps(box)}\nCanvasObjects:\n{objs_json}\n\nPlease identify the primary object or scene contained within the selection box and return JSON as specified."
    return [
        {"role": "system", "content": RECOGNITION_SYSTEM},
        {"role": "user", "content": user_msg},
    ]


def openai_recognize_objects(canvas_objects: list, box: dict, bounds: dict) -> dict:
    try:
        from config import OPENAI_API_KEY
        from openai import OpenAI

        client = OpenAI(api_key=OPENAI_API_KEY)

        resp = client.chat.completions.create(
            model="gpt-4.1-mini",
            response_format={"type": "json_object"},
            temperature=0.0,
            messages=_get_recognition_message(canvas_objects, box, bounds),
            max_tokens=300,
        )
        content = resp.choices[0].message.content
        return json.loads(content)
    except Exception as e:
        return {"error": "openai_recognition_failed", "detail": str(e)}


def ollama_recognize_objects(canvas_objects: list, box: dict, bounds: dict) -> dict:
    try:
        import ollama

        response = ollama.chat(
            model="llama3:8b",
            messages=_get_recognition_message(canvas_objects, box, bounds),
        )

        return json.loads(response["message"]["content"])
    except Exception as e:
        return {"error": "ollama_recognition_failed", "detail": str(e)}


def _rule_based_recognize(canvas_objects: list, box: dict) -> typing.Optional[dict]:
    """Lightweight rule-based recognizer for obvious geometric cases."""
    try:
        def is_circle(obj):
            pd = obj.get("pathData", {})
            return pd.get("type") == "circle"

        def is_text(obj):
            pd = obj.get("pathData", {})
            return pd.get("type") == "text" and isinstance(pd.get("text"), str)

        def count_type(t):
            return sum(1 for o in canvas_objects if isinstance(o.get("pathData"), dict) and o.get("pathData", {}).get("type") == t)

        circle_count = count_type("circle")
        if circle_count == 1 and len(canvas_objects) == 1:
            return {"label": "circle", "confidence": 0.95, "explanation": "Single circular shape primitive within selection."}

        for o in canvas_objects:
            if is_text(o):
                txt = o.get("pathData", {}).get("text", "")
                return {"label": f"text: '{txt}'", "confidence": 0.98, "explanation": "A text primitive with an explicit string was found."}

        rect_count = count_type("rectangle")
        poly_count = count_type("polygon")
        wheel_count = circle_count
        if (rect_count + poly_count) >= 1 and wheel_count >= 2:
            return {"label": "car", "confidence": 0.9, "explanation": "Rectangular/polygonal body plus multiple circular wheel primitives."}

        def is_triangle(o):
            pd = o.get("pathData", {})
            pts = pd.get("points") if isinstance(pd.get("points"), list) else []
            return pd.get("type") == "polygon" and len(pts) == 3

        tri_count = sum(1 for o in canvas_objects if is_triangle(o))
        if rect_count >= 1 and tri_count >= 1:
            return {"label": "house", "confidence": 0.9, "explanation": "Rectangular base plus triangular roof polygon detected."}

        def hex_to_rgb(h):
            try:
                h = h.lstrip("#")
                return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
            except Exception:
                return (0, 0, 0)

        def color_close(hexcolor, target_rgb, tol=100):
            r, g, b = hex_to_rgb(hexcolor or "#000000")
            tr, tg, tb = target_rgb
            return ((r-tr)**2 + (g-tg)**2 + (b-tb)**2) <= (tol**2)

        brown_rgb = (139, 69, 19)
        green_rgb = (34, 139, 34)
        trunk = any(o for o in canvas_objects if o.get("pathData", {}).get("tool") == "freehand" and color_close(o.get("color", "#000000"), brown_rgb, tol=120))
        foliage = any(o for o in canvas_objects if o.get("pathData", {}).get("tool") == "freehand" and color_close(o.get("color", "#000000"), green_rgb, tol=120))
        if trunk and foliage:
            return {"label": "tree", "confidence": 0.88, "explanation": "Brown trunk-like stroke plus clustered green freehand strokes resembling foliage."}

    except Exception:
        pass

    return None


def recognize_objects_in_box(canvas_objects: list, box: dict, bounds: dict) -> dict:
    """Lightweight recognition using OpenAI with Ollama fallback."""
    try:
        rule_out = _rule_based_recognize(canvas_objects, box)
        if isinstance(rule_out, dict):
            return rule_out
    except Exception:
        pass

    model_output = openai_recognize_objects(canvas_objects, box, bounds)
    if isinstance(model_output, dict) and "error" not in model_output:
        return model_output
    return ollama_recognize_objects(canvas_objects, box, bounds)
