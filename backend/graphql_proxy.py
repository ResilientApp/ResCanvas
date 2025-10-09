from flask import Flask, request, Response, jsonify
import requests
import json

app = Flask(__name__)

# The real upstream GraphQL server:
UPSTREAM = "http://localhost:8000/graphql"

@app.route("/graphql", methods=["POST"])
def graphql_proxy():
    try:
        payload = request.get_json(force=True)
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    if "operationName" not in payload or payload["operationName"] is None:
        first_line = payload.get("query", "").splitlines()[0]
        parts = first_line.strip().split()
        if len(parts) >= 2:
            payload["operationName"] = parts[1]
        else:
            payload["operationName"] = None

    print("Incoming payload:", json.dumps(payload))

    headers = {
        "Content-Type": "application/json",
        # copy any auth headers if needed:
        **{k: v for k, v in request.headers.items() if k.startswith("X-") or k == "Authorization"}
    }
    resp = requests.post(UPSTREAM, json=payload, headers=headers, stream=True)

    excluded_headers = {"content-encoding", "transfer-encoding", "connection"}
    response_headers = [
        (name, value) for name, value in resp.raw.headers.items()
        if name.lower() not in excluded_headers
    ]
    return Response(resp.raw, status=resp.status_code, headers=response_headers)

if __name__ == "__main__":
    # Run on port 9000
    app.run(host="0.0.0.0", port=9000, debug=True)
