> You are an expert developer-assistant. Your task: **produce an improved, accurate, and developer-friendly `README.md` for the repository contained in `ResCanvas.zip`**. Use the repository files as the single source of truth — do not invent behavior or endpoints that are not implemented in the code. If something in the README conflicts with the code, prefer the code and report the mismatch. Work slowly and carefully; return exact commands and copy-pasteable configuration.  
>  
> **Input available:** the full extracted repository tree from `ResCanvas.zip` (root). You must parse and inspect it programmatically (or read it) — at minimum, examine these paths if they exist:
> - `backend/` (look at `app.py`, `config.py`, `routes/`, `services/`, and any `README` or `requirements.txt`)
> - `backend/routes/*.py` and `backend/services/*.py` to determine HTTP endpoints, HTTP methods, and Socket.IO handlers
> - `frontend/` (look at `package.json`, `src/`, `src/pages/`, `src/api/`, and any router files such as `src/index.js`, `src/App.jsx`)
> - Any `.env`, `.env.example`, or `config` files in the repo
> - Any existing `README.md` in the repo — treat it as legacy material to be updated and built from
>  
> **Primary objectives**
> 1. Produce a single, authoritative `README.md` (markdown) that a developer can follow to:
>    - Understand the project purpose and architecture at a glance
>    - Install prerequisites
>    - Configure environment variables (exact names and example values)
>    - Run backend and frontend in development
>    - Run the application with Docker (docker-compose) if possible
>    - Run tests (if test files or scripts exist)
>    - Use and test the core features (register/login, create room, share/invite, accept invite, join room and realtime canvas updates).
> 2. Produce an `.env.example` file that contains every environment variable the code reads (with safe example values).
> 3. Produce a minimal `docker-compose.yml` that can run the app stack for local testing (backend, frontend, mongodb). If the project cannot be containerized sensibly as-is, explain why and provide a best-effort compose file plus manual steps.
> 4. Produce an `API_REFERENCE.md` (or an “API Reference” section in the README) that lists the most important HTTP endpoints and WebSocket events (method, path, auth requirements, request/response examples — curl), citing the source file path and function name for each listed endpoint.
> 5. Produce a short “Inconsistencies found” list describing where the existing README is wrong or outdated (file paths + brief excerpt of mismatch and recommended fix).
>  
> **Constraints & rules (very important)**  
> - **Use the code as source of truth.** If the code implements `POST /auth/login` and not `/login`, list the route exactly as found in the code.  
> - **Do not invent endpoints, environment variables, or behaviors** not present somewhere in the repo. If the README mentions a feature that's not implemented, call that out (file + line or function name if possible) and mark as TODO.  
> - When you present examples (curl, socket.io-client), use the exact parameter names, paths, and expected JSON keys as implemented in the code. If response shapes are not clear, show a conservative example and explicitly label it “inferred — confirm with real response.”  
> - If the project uses a token in localStorage, HTTP-only cookies, or both, document the real mechanism used in the code (and where). If the code supports both but your tests show one is primary, explain that.  
> - If the backend uses a specific port (e.g., `10010`) or the frontend dev server uses `10008` in the code, reflect those exact ports in README commands. If there are multiple possible ports in different files, report them and recommend a single canonical port in examples.  
> - Include precise dev commands (copy/paste). If a start command needs `npm run start` or `python app.py`, give the exact command the code currently expects. If there’s a better command (e.g., `npm run dev`), explain why and include both.  
> - Provide a minimal socket example showing how to connect (socket.io-client) using the exact authentication mechanism the code expects (query param token or auth header — use the code). Include `join_room` and listening for `stroke` and `notification` events.  
> - If any files are incomplete or contain placeholders (e.g., `...` or TODO markers), list them and show their path and a short suggestion for completion.  
> - Make the README follow this structure (strict):  
>   1. Project title and short description (1–3 lines)  
>   2. Badge placeholders (build/test) — optional — show how to add them.  
>   3. Table of Contents (linked)  
>   4. Architecture Overview (diagram ASCII or short bullet points: backend, frontend, DB, sockets)  
>   5. Prerequisites (exact versions to use)  
>   6. Quickstart — **Development** (exact commands for backend + frontend, env setup, fetch DB)  
>   7. Quickstart — **Docker** (docker-compose) or explicit reasons why not possible  
>   8. Environment variables (full `.env.example` content)  
>   9. API Reference (important endpoints + WS events + example curl/socket snippets)  
>   10. Features & Usage (how to register, login, create a room, share, accept invite, open canvas, draw) with step-by-step commands you can run in curl + WebSocket snippets  
>   11. Troubleshooting (common issues and fixes — e.g., “login button does nothing: check proxy or API_BASE”, CORS, port mismatches, token storage)  
>   12. Contributing, tests, and code style/linting instructions  
>   13. Security notes (JWT secret, HTTPS, refresh tokens)  
>   14. Changelog (short) & where to put future release notes  
>   15. Appendix: file/class map (key files and what they do; list the real file paths)  
>  
> **Deliverable format**  
> - Output 1: the complete `README.md` content as markdown. 
> - Output 2: `.env.example` content (exact file content).  
> - Output 3: `docker-compose.yml` content (or a short explanation why a service cannot be dockerized plus best-effort compose).  
> - Output 4: `API_REFERENCE.md` content (or the API Reference section placed into `README.md`) listing endpoints and WS events with file references (e.g., `backend/routes/rooms.py::create_room`).  
> - Output 5: “Inconsistencies found” list (file paths + short notes).  
>  
> **Quality requirements**  
> - Use precise, copy-pasteable shell commands.  
> - If any commands require environment variables, include exact variable names and example values.  
> - Use code blocks for all commands and code samples.  
> - Keep README length reasonable (~1–3 pages). Put very long reference tables into `API_REFERENCE.md` or an Appendix.  
> - Prefer clarity and reproducibility for a new developer who downloads the repo and has basic tools installed.  
>  
> **If the repo is large / has many routes**: prioritize the top 10 most important developer flows for inclusion (auth, room CRUD, share/invite, invite accept/decline, strokes API, websocket join and stroke broadcast). For other routes, produce a summary table with the file path reference.  
>  
> **If you cannot determine something from the code** — e.g., response shape or exact error codes — list it under “Unknowns / TODO” and show the file and the line or function that needs clarification. Ask only one high-value question at the end if absolutely necessary; otherwise produce the README assuming the most conservative option and mark it clearly as “inferred”.  
>  
> **Tone and style**  
> - Keep the README professional and concise. Use actionable headings and bullet lists.  
> - Provide examples that work on macOS and Linux (use bash). Windows users may be noted but not required.  
>  
> **Final instruction to the LLM**  
> - Output **exactly** — and only — the five deliverables (README.md text, `.env.example`, `docker-compose.yml`, `API_REFERENCE.md` or API section, and the Inconsistencies list). Do not add extra commentary outside those outputs. If any output cannot be produced (e.g., docker-compose impossible), output the best-effort artifact and a 2–3 line “explanation” inside the same deliverable file (not as a separate message).  
> - Remember: **code is the source of truth**. Cross-check and cite file paths for verification. Be conservative; do not claim an endpoint exists when it does not.

