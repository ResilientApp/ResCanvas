import json
from typing import Dict, Any

from config import OPENAI_API_KEY


SYSTEM_PROMPT = """
You are a drawing assistant that outputs ONLY valid JSON.

You must convert user requests into simple drawing instructions.

Rules:
- Output JSON ONLY (no explanation)
- Use this schema:

{
  "items": [
    {
      "type": "line | rectangle | circle | polygon",
      "start": {"x": int, "y": int},
      "end": {"x": int, "y": int},
      "points": [{"x": int, "y": int}]
    }
  ]
}

Constraints:
- Coordinates must be between 0 and 512
- Keep drawings SIMPLE
- Prefer rectangles + lines
- DO NOT include text or comments
"""


def _validate_point(p: Dict[str, Any]) -> None:
    if not isinstance(p, dict):
        raise ValueError("Point must be an object")
    if "x" not in p or "y" not in p:
        raise ValueError("Point must include x and y")
    if not isinstance(p["x"], (int, float)) or not isinstance(p["y"], (int, float)):
        raise ValueError("Point coordinates must be numeric")
    if not (0 <= p["x"] <= 512 and 0 <= p["y"] <= 512):
        raise ValueError(f"Point out of bounds: {p}")


def _validate_output(data: Dict[str, Any]) -> Dict[str, Any]:
    if "items" not in data or not isinstance(data["items"], list):
        raise ValueError("Invalid format: missing 'items' list")

    for item in data["items"]:
        if not isinstance(item, dict):
            raise ValueError("Each item must be an object")

        if "type" not in item:
            raise ValueError("Missing type in item")

        t = item["type"]
        if t not in {"line", "rectangle", "circle", "polygon"}:
            raise ValueError(f"Unsupported type: {t}")

        if t == "polygon":
            if "points" not in item or not isinstance(item["points"], list) or len(item["points"]) < 3:
                raise ValueError("Polygon must have >= 3 points")
            for p in item["points"]:
                _validate_point(p)
        else:
            if "start" not in item or "end" not in item:
                raise ValueError(f"{t} must have start and end")
            _validate_point(item["start"])
            _validate_point(item["end"])

    return data


def _strip_code_fences(content: str) -> str:
    content = content.strip()
    if content.startswith("```"):
        lines = content.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        if lines and lines[0].strip().lower() == "json":
            lines = lines[1:]
        content = "\n".join(lines).strip()
    return content


def generate_stroke_json(prompt: str) -> Dict[str, Any]:
    """
    Convert text prompt -> structured stroke JSON
    """
    if not prompt or not prompt.strip():
        raise ValueError("Prompt cannot be empty")

    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is missing")

    try:
        from openai import OpenAI

        client = OpenAI(api_key=OPENAI_API_KEY, timeout=20.0)

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt.strip()},
            ],
        )

        content = response.choices[0].message.content.strip()
        content = _strip_code_fences(content)

        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            raise RuntimeError(f"Model returned invalid JSON:\n{content}")

        return _validate_output(data)

    except Exception as e:
        raise RuntimeError(f"LLM stroke generation failed: {e}")