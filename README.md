# UNILIA E-Commerce
A student marketplace MVP inspired by marketplace layouts such as Alibaba, without online payments.

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MySQL
- Real-time chat: WebSocket (`ws`)
- Auth: JWT + bcryptjs
- Images: local uploads

## Run
### 1. Database
Create a MySQL database and run `backend/schema.sql`.

### 2. Backend
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

Update `frontend/.env` if the backend is not at `http://localhost:5000`.

## Important
Do not commit `.env` or uploaded images containing private information. For production, use a proper object-storage service for images and HTTPS/WSS.
