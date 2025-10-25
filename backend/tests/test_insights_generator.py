import importlib.util
import os


def load_insights_module():
    path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'backend', 'services', 'insights_generator.py'))
    spec = importlib.util.spec_from_file_location('insights_generator', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_generate_insights_heuristic():
    ig = load_insights_module()
    # Force heuristic path by ensuring OPENAI API key is unset on the module
    setattr(ig, 'OPENAI_API_KEY', None)

    aggregates = {
        'total_strokes': 42,
        'active_users': 1,
        'top_colors': ['#ff0000', '#00ff00'],
        'collaboration_pairs': [] ,
        'avg_stroke_rate': 0.2,
        'anomaly_score': 0.1
    }

    out = ig.generate_insights(aggregates)
    assert isinstance(out, dict)
    assert 'summary' in out
    # recommendations should be present when activity is low
    assert 'recommendations' in out and isinstance(out['recommendations'], list)
