# Contributing to ResCanvas

Thank you for your interest in contributing to ResCanvas! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

1. [How to Contribute](#how-to-contribute)
2. [Development Setup](#development-setup)
3. [Project Structure](#project-structure)
4. [Coding Standards](#coding-standards)
5. [Testing Requirements](#testing-requirements)
6. [API Development Guidelines](#api-development-guidelines)
7. [Pull Request Process](#pull-request-process)
8. [Commit Message Guidelines](#commit-message-guidelines)
10. [Getting Help](#getting-help)

---

## Code of Conduct

ResCanvas is committed to providing a welcoming and inclusive environment for all contributors. We expect all participants to:

- Be respectful and considerate in communication
- Welcome diverse perspectives and experiences
- Accept constructive criticism gracefully
- Focus on what is best for the community
- Show empathy towards other community members

Unacceptable behavior includes harassment, trolling, personal attacks, or any conduct that creates an intimidating or hostile environment.

---

## How to Contribute

There are many ways to contribute to ResCanvas:

### Reporting Bugs

- Check existing issues to avoid duplicates
- Use the bug report template
- Include detailed steps to reproduce
- Provide system information (OS, browser, Node/Python versions)
- Include relevant error messages and logs

### Suggesting Features

- Check existing feature requests
- Clearly describe the feature and its use case
- Explain why this feature would benefit users
- Consider backward compatibility and API versioning

### Code Contributions

- Fix bugs or implement features from the issue tracker
- Improve documentation
- Add or improve tests
- Optimize performance
- Enhance security

### Documentation

- Fix typos or unclear explanations
- Add examples and tutorials
- Improve API documentation
- Translate documentation

---

## Development Setup

### Prerequisites

- **Node.js** 14+ and npm
- **Python** 3.8+
- **MongoDB** (local or Atlas cluster)
- **Redis** 6+
- **Git**

### Initial Setup

1. **Fork and Clone**

```bash
git clone https://github.com/YOUR_USERNAME/ResCanvas.git
cd ResCanvas
```

2. **Backend Setup**

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Generate keys for ResilientDB
python gen_keys.py

# Create .env file
cat > .env << EOF
MONGO_ATLAS_URI=mongodb://localhost:27017/rescanvas_dev
SIGNER_PUBLIC_KEY=<from gen_keys.py>
SIGNER_PRIVATE_KEY=<from gen_keys.py>
RESILIENTDB_BASE_URI=https://crow.resilientdb.com
RESILIENTDB_GRAPHQL_URI=https://cloud.resilientdb.com/graphql
JWT_SECRET=your-dev-secret-key
EOF

# Start backend
python app.py
```

3. **Frontend Setup**

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm start
```

4. **Redis Setup**

```bash
# Install Redis (Ubuntu/Debian)
sudo apt install redis-server

# Start Redis
sudo systemctl start redis

# Verify Redis is running
redis-cli ping  # Should return PONG
```

5. **Sync Service Setup** (Optional for full functionality)

```bash
cd backend/incubator-resilientdb-resilient-python-cache

# Install dependencies
pip install resilient-python-cache

# Create .env
cat > .env << EOF
MONGO_URL=mongodb://localhost:27017/
MONGO_DB=canvasCache
MONGO_COLLECTION=strokes
EOF

# Run sync service
python example.py
```

---

## Project Structure

```
ResCanvas/
├── backend/
│   ├── app.py                    # Flask application entry point
│   ├── config.py                 # Configuration and environment variables
│   ├── routes/                   # REST API route handlers
│   │   ├── auth.py              # Authentication endpoints
│   │   ├── rooms.py             # Room management endpoints
│   │   ├── submit_room_line.py  # Stroke submission logic
│   │   └── ...
│   ├── api_v1/                   # Versioned API layer (v1)
│   │   ├── __init__.py          # API v1 blueprint factory
│   │   ├── auth.py              # v1 auth endpoints
│   │   ├── rooms.py             # v1 room endpoints
│   │   └── ...
│   ├── middleware/               # Authentication middleware
│   ├── services/                 # Business logic and utilities
│   │   ├── db.py                # Database connections
│   │   ├── graphql_service.py   # ResilientDB GraphQL client
│   │   ├── socketio_service.py  # Socket.IO helpers
│   │   └── ...
│   └── tests/                    # Backend test suites
│       ├── test_api_v1.py       # API v1 endpoint tests
│       └── ...
├── frontend/
│   ├── src/
│   │   ├── components/          # React components
│   │   ├── pages/               # Page components
│   │   ├── api/                 # API client wrappers
│   │   ├── services/            # Frontend services
│   │   └── utils/               # Utility functions
│   └── tests/                   # Frontend test suites
├── sdk/
│   └── javascript/              # Official JavaScript SDK
│       ├── src/                 # SDK source code
│       └── tests/               # SDK tests
└── docs/                        # Documentation
```

---

## Coding Standards

### Python (Backend)

- **Style**: Follow PEP 8
- **Formatting**: Use 4 spaces for indentation
- **Imports**: Group stdlib, third-party, local imports
- **Docstrings**: Use triple quotes for module/function docs
- **Type Hints**: Use when helpful for clarity

```python
from typing import Dict, List, Optional

def create_room(name: str, room_type: str = "public") -> Dict:
    """
    Create a new collaborative drawing room.
    
    Args:
        name: The room name
        room_type: Room visibility (public, private, secure)
        
    Returns:
        Dict containing room details and ID
    """
    pass
```

### JavaScript (Frontend/SDK)

- **Style**: Use ESLint configuration in project
- **Formatting**: 2 spaces for indentation
- **ES6+**: Use modern JavaScript features (arrow functions, async/await, destructuring)
- **Components**: Use functional components with hooks
- **Naming**: camelCase for variables/functions, PascalCase for components

```javascript
// Good
const MyComponent = ({ userId, onUpdate }) => {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    fetchData();
  }, [userId]);
  
  const handleClick = async () => {
    await onUpdate(data);
  };
  
  return <div onClick={handleClick}>{data}</div>;
};
```

### General Principles

- **Keep functions small and focused** (single responsibility)
- **Write self-documenting code** (clear variable names)
- **Add comments for complex logic** (explain "why", not "what")
- **Handle errors gracefully** (try/catch, proper error messages)
- **Validate input** (never trust client data)
- **Log important operations** (use appropriate log levels)

---

## Testing Requirements

All contributions must include appropriate tests.

### Backend Tests (pytest)

```bash
cd backend

# Run all tests
pytest

# Run specific test file
pytest tests/test_api_v1.py

# Run with coverage
pytest --cov=. --cov-report=html

# Run specific test
pytest tests/test_api_v1.py::TestAPIv1Auth::test_login_success
```

**Test Guidelines:**
- One test file per module or feature area
- Use fixtures for common setup (see `conftest_v1.py`)
- Test success cases, error cases, and edge cases
- Mock external services (ResilientDB, MongoDB when appropriate)
- Clean up test data in teardown

```python
class TestMyFeature:
    def test_success_case(self, client, auth_token):
        """Test the happy path"""
        response = client.post('/api/v1/endpoint', 
                              headers={"Authorization": f"Bearer {auth_token}"},
                              json={"data": "value"})
        assert response.status_code == 200
    
    def test_validation_error(self, client, auth_token):
        """Test input validation"""
        response = client.post('/api/v1/endpoint',
                              headers={"Authorization": f"Bearer {auth_token}"},
                              json={})  # Missing required field
        assert response.status_code == 400
```

### Frontend Tests (Jest)

```bash
cd frontend

# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- Canvas.test.js
```

### Integration Tests

- Test complete workflows (register → login → create room → add stroke)
- Test cross-component interactions
- Test real-time Socket.IO events
- Use test databases, not production data

---

## API Development Guidelines

### Versioning Strategy

ResCanvas uses URL-based versioning for the public API:

- **Current version**: `/api/v1/*`
- **Legacy endpoints**: Continue to work without version prefix
- **Future versions**: Will be `/api/v2/*`, etc.

### Adding New Endpoints

1. **Implement in routes/ first** (core functionality)
2. **Wrap in api_v1/** (versioned API layer)
3. **Write comprehensive tests**
4. **Update documentation** (README.md, SDK docs)
5. **Update SDK client** (if applicable)

Example structure:

```python
# backend/api_v1/my_feature.py
from flask import Blueprint, request, jsonify
from middleware.auth import require_auth
from routes.my_feature import do_something

my_feature_bp = Blueprint('api_v1_my_feature', __name__)

@my_feature_bp.route('/my-endpoint', methods=['POST'])
@require_auth
def v1_my_endpoint():
    """v1 wrapper for my_endpoint functionality"""
    return do_something(request)
```

### Backward Compatibility

- **Never break existing endpoints** without major version bump
- **Deprecate gracefully** (announce, provide migration path)
- **Add optional parameters** (required params → breaking change)
- **Return additional fields** (OK, but document)
- **Change field types/formats** (breaking change)

### Authentication & Authorization

- All protected endpoints MUST use `@require_auth` decorator
- Check room access with `@require_room_access` when applicable
- Return proper HTTP status codes:
  - `401 Unauthorized` — Missing/invalid token
  - `403 Forbidden` — Valid token but insufficient permissions
  - `404 Not Found` — Resource doesn't exist or user has no access

### Error Responses

Return consistent error format:

```json
{
  "error": "Brief error message",
  "details": "More detailed explanation (optional)",
  "code": "ERROR_CODE" // Optional error code
}
```

HTTP Status Codes:
- `200 OK` — Success
- `201 Created` — Resource created
- `204 No Content` — Success with no response body
- `400 Bad Request` — Invalid input
- `401 Unauthorized` — Authentication required
- `403 Forbidden` — Insufficient permissions
- `404 Not Found` — Resource not found
- `409 Conflict` — Resource already exists
- `500 Internal Server Error` — Server error

---

## Pull Request Process

### Before Submitting

1. **Create a feature branch** from `main`
   ```bash
   git checkout -b feature/my-feature
   # or
   git checkout -b fix/bug-description
   ```

2. **Make your changes**
   - Follow coding standards
   - Add tests
   - Update documentation

3. **Test thoroughly**
   ```bash
   # Backend tests
   cd backend && pytest
   
   # Frontend tests
   cd frontend && npm test
   ```

4. **Commit changes** (see commit guidelines below)

5. **Push to your fork**
   ```bash
   git push origin feature/my-feature
   ```

### Submitting the PR

1. Go to the original repository
2. Click "New Pull Request"
3. Select your fork and branch
4. Fill out the PR template:
   - **Title**: Clear, concise description
   - **Description**: What changed and why
   - **Related Issues**: Link to related issues
   - **Testing**: How you tested the changes
   - **Screenshots**: For UI changes

### PR Review Process

- Maintainers will review your PR
- Address feedback and requested changes
- Update your branch if needed
- Once approved, a maintainer will merge

### PR Checklist

- [ ] Code follows project coding standards
- [ ] Tests added/updated and passing
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly documented)
- [ ] Commits follow commit message guidelines
- [ ] PR description is clear and complete

---

## Commit Message Guidelines

Use conventional commit format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, no logic change)
- **refactor**: Code refactoring
- **test**: Adding or updating tests
- **chore**: Maintenance tasks (dependencies, build config)
- **perf**: Performance improvements

### Examples

```
feat(api): add user search endpoint to v1 API

Implement /api/v1/users/search endpoint to allow searching
users by username. Includes fuzzy matching and pagination.

Closes #123
```

```
fix(canvas): prevent stroke duplication on slow networks

Add debouncing to stroke submission to prevent duplicates
when network latency is high.

Fixes #456
```

```
docs(readme): update API documentation with v1 endpoints

Add comprehensive documentation for /api/v1/* endpoints
including authentication, rooms, and SDK usage examples.
```

### Commit Best Practices

- Keep commits atomic (one logical change per commit)
- Write clear, descriptive messages
- Use imperative mood ("add" not "added")
- Limit subject line to 72 characters
- Reference issues and PRs in footer

---

## Getting Help

### Questions and Discussions

- **GitHub Discussions**: For questions, ideas, and general discussion
- **GitHub Issues**: For bug reports and feature requests
- **Documentation**: Check README.md and docs/ folder first

---

## License

By contributing to ResCanvas, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).

---

Thank you for contributing to ResCanvas! Your efforts help make collaborative drawing more accessible, private, and decentralized for everyone.
