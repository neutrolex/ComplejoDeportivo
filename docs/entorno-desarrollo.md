# Entorno de desarrollo

Notas para levantar el proyecto en una máquina nueva (o para tu yo del futuro).

## Requisitos

- Python 3.12+
- Node.js 20+ (para el frontend)
- PostgreSQL instalado localmente (servicio corriendo en el puerto 5432)
  - Ver decisión y alternativa Docker en [decisiones-tecnicas.md](decisiones-tecnicas.md)

## Backend (Django)

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Copia `.env.example` a `.env` y completa `SECRET_KEY` y las credenciales de base de datos:

```powershell
copy .env.example .env
```

Crea el usuario y la base de datos en PostgreSQL (una sola vez, ver detalle en decisiones-tecnicas.md), luego:

```powershell
python manage.py migrate
python manage.py runserver
```

La API queda disponible en `http://localhost:8000`.

## Frontend (React + Vite)

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

La web queda disponible en `http://localhost:5173`.

## Variables de entorno

Ningún archivo `.env` se sube al repositorio (es público). Cada carpeta (`backend/`, `frontend/`) tiene su propio `.env.example` como plantilla de lo que hace falta configurar.
