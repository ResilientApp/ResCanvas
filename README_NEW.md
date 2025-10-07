# ResCanvas

**A decentralized collaborative drawing application with room-scoped access control, end-to-end encryption, and wallet-signed strokes backed by ResilientDB.**

See full comprehensive README in README_NEW.md - This file documents all features, API endpoints, wallet integration, setup instructions, and production deployment guidelines.

For API Reference, see: [API_REFERENCE.md](./API_REFERENCE.md)
For Wallet Integration Status, see: [TASK3_WALLET_INTEGRATION_STATUS.md](./TASK3_WALLET_INTEGRATION_STATUS.md)

## Quick Start

### Backend
\`\`\`bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Edit with your settings
python app.py  # Starts on :10010
\`\`\`

### Frontend
\`\`\`bash
cd frontend
npm install
npm start  # Starts on :10008
\`\`\`

Access: http://localhost:10008
