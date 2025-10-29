"""
LLM-based insights generator. Uses OpenAI if API key is available; otherwise
returns simple rule-based summaries.
"""
import logging
from config import OPENAI_API_KEY
import json

logger = logging.getLogger(__name__)


def _summarize_aggregates(aggregates: dict):
    # Build a concise prompt from aggregates
    try:
        total_strokes = aggregates.get('total_strokes', 0)
        active_users = aggregates.get('active_users', 0)
        top_colors = aggregates.get('top_colors', [])
        collab_pairs = aggregates.get('collaboration_pairs', [])

        summary = (
            f"Total strokes: {total_strokes}. Active users: {active_users}. "
            f"Top colors: {', '.join(top_colors[:5]) if top_colors else 'N/A'}. "
            f"Top collaboration pairs: {', '.join([f'{p[0]}-{p[1]}' for p in collab_pairs[:5]]) if collab_pairs else 'N/A'}."
        )
        return summary
    except Exception:
        return "No summary available"


def generate_insights(aggregates: dict):
    """Generate human-readable insights and recommendations.

    If OpenAI API key is present, attempt a short chat completion. If not,
    return a simple deterministic summary and a few heuristic recommendations.
    """
    try:
        prompt_summary = _summarize_aggregates(aggregates)
        if OPENAI_API_KEY:
            try:
                import openai
                openai.api_key = OPENAI_API_KEY
                system = "You are an analytics assistant for a collaborative drawing app. Provide a short summary and 3 actionable recommendations to improve collaboration and room health."
                response = openai.ChatCompletion.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": f"Here are aggregates: {json.dumps(aggregates)}. Produce a short summary and 3 actionable recommendations."}
                    ],
                    max_tokens=400,
                    temperature=0.6,
                )
                text = response.choices[0].message.content
                return {"summary": text, "source": "openai"}
            except Exception:
                logger.exception('OpenAI call failed, falling back to heuristic summary')

        # Fallback heuristic
        summary = _summarize_aggregates(aggregates)
        recommendations = []
        if aggregates.get('active_users', 0) < 2:
            recommendations.append('Encourage users to invite collaborators or schedule group drawing sessions to improve engagement.')
        if aggregates.get('avg_stroke_rate', 0) < 1:
            recommendations.append('Introduce prompts or templates to encourage drawing activity.')
        if aggregates.get('anomaly_score', 0) > 0.7:
            recommendations.append('Investigate sudden surges in activity — could be bot behavior or an event-driven spike.')
        if not recommendations:
            recommendations = [
                'Highlight active users in the room to promote collaboration.',
                'Surface weekly summary emails with top contributors and trending palettes.'
            ]
        return {"summary": summary, "recommendations": recommendations, "source": "heuristic"}
    except Exception:
        logger.exception('generate_insights error')
        return {"summary": "Unable to generate insights.", "recommendations": []}
