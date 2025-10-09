from flask import Flask, request, Response, jsonify
import requests
import json

app = Flask(__name__)

# The real upstream GraphQL server:
UPSTREAM = "http://localhost:8000/graphql"

@app.route("/graphql", methods=["POST"])
def graphql_proxy():
    # 1) Read the incoming JSON
    try:
        payload = request.get_json(force=True)
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    if "operationName" not in payload or payload["operationName"] is None:
        # Extract name from the first line of the query: e.g. "mutation PostTransaction"
        first_line = payload.get("query", "").splitlines()[0]
        # assume format "mutation NAME(..."
        parts = first_line.strip().split()
        if len(parts) >= 2:
            payload["operationName"] = parts[1]
        else:
            payload["operationName"] = None

    # 2) Ensure it has the shape we need
    #    If someone sent {"query":..., "variables": {...}} as desired, leave it be.
    #    Otherwise, if they omitted variables.data, you could massage here.
    #
    #    For now we'll trust the client (your Flask app) to send
    #    {"query": "...", "variables": {"data": {...}}}
    #    If you needed to fix it, you'd do something like:
    #
    # if "variables" not in payload or "data" not in payload["variables"]:
    #     # e.g. wrap the entire payload into data:
    #     payload = {
    #         "query": payload.get("query", ""),
    #         "variables": {"data": payload.get("variables", payload)}
    #     }
    
    print("Incoming payload:", json.dumps(payload))

    # 3) Forward to upstream
    headers = {
        "Content-Type": "application/json",
        # copy any auth headers if needed:
        **{k: v for k, v in request.headers.items() if k.startswith("X-") or k == "Authorization"}
    }
    resp = requests.post(UPSTREAM, json=payload, headers=headers, stream=True)

    # 4) Stream the response back
    excluded_headers = {"content-encoding", "transfer-encoding", "connection"}
    response_headers = [
        (name, value) for name, value in resp.raw.headers.items()
        if name.lower() not in excluded_headers
    ]
    return Response(resp.raw, status=resp.status_code, headers=response_headers)

if __name__ == "__main__":
    # Run on port 9000
    app.run(host="0.0.0.0", port=9000, debug=True)
