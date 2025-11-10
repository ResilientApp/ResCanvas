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
        "tool": "shape",
        "type": "rectangle|circle|line|polygon|text",
        // Use one of these geometry encodings (no others):
        // circle/rectangle/line:
        "start": {"x": number, "y": number},
        "end":   {"x": number, "y": number},
        // polygon (including triangles):
        "points": [ {"x": number, "y": number}, ... ],
        // text:
        "text": "string"
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

When CanvasState is provided:
- Avoid obvious overlaps with existing content unless the prompt demands it (e.g., “on top of…”).
- Keep new objects visually distinct (slight offsets are OK when crowded).

Content fidelity:
- Include EVERY explicitly mentioned object; respect counts, colors, sizes, and spatial relations.
- If motion/action is described, suggest simple visual cues (e.g., angled line, small polygon “arrow”, or secondary object) using primitives.
- If ambiguous, choose a common-sense default and continue.

Constraints:
- Output MUST be valid JSON matching the schema above. Do not include IDs (the app assigns them).
- Keep a modest number of objects (clear but not cluttered).
"""

# Few-shot to stabilize canvas-native formatting
FEWSHOT_USER_1 = """
CanvasState: {"drawings":[],"bounds":{"width":3000,"height":2000}}
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
        "end":   {"x": 2940, "y": 100}
      }
    }
  ]
}

FEWSHOT_USER_2 = """
CanvasState:
{"drawings":[],"bounds":{"width":3000,"height":2000}}
UserPrompt:
"draw a red car driving in the woods"
"""

FEWSHOT_ASSISTANT_JSON_2 = {
  "objects": [
    # Trees (two)
    {
      "color": "#228B22",
      "lineWidth": 2,
      "pathData": {
        "tool": "shape",
        "type": "polygon",
        "points": [
          {"x": 600, "y": 1050},
          {"x": 650, "y":  950},
          {"x": 700, "y": 1050}
        ]
      }
    },
    {
      "color": "#8B4513",
      "lineWidth": 2,
      "pathData": {
        "tool": "shape",
        "type": "rectangle",
        "start": {"x": 645, "y": 1050},
        "end":   {"x": 655, "y": 1100}
      }
    },
    {
      "color": "#228B22",
      "lineWidth": 2,
      "pathData": {
        "tool": "shape",
        "type": "polygon",
        "points": [
          {"x": 2300, "y": 1000},
          {"x": 2350, "y":  900},
          {"x": 2400, "y": 1000}
        ]
      }
    },
    {
      "color": "#8B4513",
      "lineWidth": 2,
      "pathData": {
        "tool": "shape",
        "type": "rectangle",
        "start": {"x": 2345, "y": 1000},
        "end":   {"x": 2355, "y": 1050}
      }
    },

    # Road (line with slight angle)
    {
      "color": "#555555",
      "lineWidth": 6,
      "pathData": {
        "tool": "shape",
        "type": "line",
        "start": {"x": 400, "y": 1400},
        "end":   {"x": 2600, "y": 1500}
      }
    },

    # Red car on the road
    {
      "color": "#FF0000",
      "lineWidth": 2,
      "pathData": {
        "tool": "shape",
        "type": "rectangle",
        "start": {"x": 1450, "y": 1380},
        "end":   {"x": 1650, "y": 1450}
      }
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
          {"x": 1550, "y": 1340}
        ]
      }
    },
    # Wheels
    {
      "color": "#000000",
      "lineWidth": 2,
      "pathData": {
        "tool": "shape",
        "type": "circle",
        "start": {"x": 1500, "y": 1450},
        "end":   {"x": 1520, "y": 1450}
      }
    },
    {
      "color": "#000000",
      "lineWidth": 2,
      "pathData": {
        "tool": "shape",
        "type": "circle",
        "start": {"x": 1600, "y": 1450},
        "end":   {"x": 1620, "y": 1450}
      }
    },
    # Motion cue (small angled line “speed line”)
    {
      "color": "#000000",
      "lineWidth": 2,
      "pathData": {
        "tool": "shape",
        "type": "line",
        "start": {"x": 1420, "y": 1415},
        "end":   {"x": 1450, "y": 1400}
      }
    }
  ]
}

FEWSHOT_USER_3 = """
CanvasState:
{
  "drawings": [
    {"color":"#8B4513","lineWidth":2,"pathData":{"tool":"shape","type":"rectangle","start":{"x":1400,"y":1200},"end":{"x":1600,"y":1270}}},
    {"color":"#FF0000","lineWidth":2,"pathData":{"tool":"shape","type":"polygon","points":[{"x":1400,"y":1200},{"x":1500,"y":1120},{"x":1600,"y":1200}]}}
  ],
  "bounds":{"width":3000,"height":2000}
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
        "end":   {"x": 1690, "y": 1245}
      }
    }
  ]
}

def _get_text_to_drawings_initial_message(prompt: str, canvasState: dict[str, typing.Any]) -> list[dict]:
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
        f"UserPrompt:\nDescribe all shapes needed to draw this scene: {prompt}"
    )

    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": FEWSHOT_USER_1},
        {"role": "assistant", "content": json.dumps(FEWSHOT_ASSISTANT_JSON_1)},
        {"role": "user", "content": FEWSHOT_USER_2},
        {"role": "assistant", "content": json.dumps(FEWSHOT_ASSISTANT_JSON_2)},
        {"role": "user", "content": user_prompt},
    ]

def openai_prompt_to_json(prompt: str, canvasState: dict[str, typing.Any]) -> dict:
    """
    Convert a natural-language drawing prompt into structured JSON 
    using the OpenAI GPT-4.1-mini model.
    
    Args:
        prompt: The user's text prompt describing the drawing.
    
    Returns:
        Dict containing parsed drawing attributes or an error payload.
    """
    try:
        from config import OPENAI_API_KEY
        from openai import OpenAI

        client = OpenAI(api_key=OPENAI_API_KEY)
        
        resp = client.chat.completions.create(
            model="gpt-4.1-mini",
            response_format={"type": "json_object"},  # forces valid JSON
            temperature=0.1,
            messages=_get_text_to_drawings_initial_message(prompt, canvasState),
            max_tokens=1000,
        )
        content = resp.choices[0].message.content
        # print("\nAPI response: ", content, "\n")
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
            messages=_get_text_to_drawings_initial_message(prompt, canvasState)
        )

        return json.loads(response['message']['content'])
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
You are a shape-completion engine for a canvas app.

Inputs you will be given:
- CanvasState: the current canvas (existing drawings + bounds)

Goal:
Infer the single most likely primitive shape that best fits canvasState, and return it in a canvas-ready format.

Output (JSON ONLY, no comments, no markdown):
{
  "complete": true|false,
  "confidence": number,                 // 0.0–1.0
  "object": {
    "color": "#RRGGBB",
    "lineWidth": number,
    "pathData": {
      "tool": "shape",
      "type": "circle|rectangle|line|polygon|text",
      // circle/rectangle/line:
      "start": {"x": number, "y": number},
      "end":   {"x": number, "y": number},
      // polygon (including triangle):
      "points": [ {"x": number, "y": number}, ... ],
      // text (rare for completion; omit unless clearly indicated):
      "text": "string"
    }
  }
}

Rules:
- Use ABSOLUTE coordinates within CanvasState.bounds (0,0 = top-left).
- Infer a single primitive that best fits the partial strokes/points. Prefer simpler fits that preserve user intent.
- If uncertainty is high (confidence < 0.4), set "complete": false and return a best-effort "object" anyway (so the UI can show a ghost preview).
- Color default: use the majority/last stroke color if available; otherwise "#000000".
- Snap centers/edges to nearby anchors (guides, bounding-box centers/edges) if within ~6px.
- Output MUST be valid JSON matching the schema above exactly.
"""

# Few-shots (2 strong, compact)

SHAPE_COMPLETION_FEWSHOT_USER_1 = """
CanvasState:
{"drawings":[],"bounds":{"width":1200,"height":800}}
"""

SHAPE_COMPLETION_FEWSHOT_ASSISTANT_JSON_1 = {
  "complete": True,
  "confidence": 0.86,
  "object": {
    "color": "#0000FF",
    "lineWidth": 2,
    "pathData": {
      "tool": "shape",
      "type": "circle",
      "start": {"x": 360, "y": 420},
      "end":   {"x": 400, "y": 420}
    }
  }
}

SHAPE_COMPLETION_FEWSHOT_USER_2 = """
CanvasState:
{"drawings":[{}],"bounds":{"width":1200,"height":800}}
"""

SHAPE_COMPLETION_FEWSHOT_ASSISTANT_JSON_2 = {
  "complete": True,
  "confidence": 0.78,
  "object": {
    "color": "#333333",
    "lineWidth": 2,
    "pathData": {
      "tool": "shape",
      "type": "rectangle",
      "start": {"x": 500, "y": 300},
      "end":   {"x": 700, "y": 420}
    }
  }
}

def _get_shape_completion_initial_message(
    canvas_state: dict[str, typing.Any]) -> list[dict]:
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
            messages=_get_shape_completion_initial_message(canvas_state)
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
