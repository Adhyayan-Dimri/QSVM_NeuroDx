@echo off
REM ============================================================
REM QSVM-NeuroDx — Start Script
REM Launches backend (FastAPI) and frontend (React) together.
REM Assumes venv + node_modules are already installed.
REM If you haven't installed dependencies yet, see SETUP NOTES
REM at the bottom of this file.
REM ============================================================

set PROJECT_ROOT=%~dp0

echo Starting QSVM-NeuroDx...
echo.

REM ---- Start backend in a new window ----
echo [1/2] Launching backend (FastAPI) on port 8001...
start "QSVM-NeuroDx Backend" cmd /k "cd /d %PROJECT_ROOT%backend && venv\Scripts\activate && uvicorn server:app --host 0.0.0.0 --port 8001 --reload"

REM Give the backend a moment to start before launching frontend
timeout /t 3 /nobreak >nul

REM ---- Start frontend in a new window ----
echo [2/2] Launching frontend (React) ...
start "QSVM-NeuroDx Frontend" cmd /k "cd /d %PROJECT_ROOT%frontend && yarn start"

echo.
echo Both servers are starting in separate windows.
echo   Backend:  http://localhost:8001
echo   Frontend: http://localhost:3000
echo.
echo Close those windows (or Ctrl+C inside them) to stop the servers.
pause

REM ============================================================
REM SETUP NOTES (only needed ONCE, or after changing dependencies)
REM ============================================================
REM Backend:
REM   cd backend
REM   py -3.11 -m venv venv          (MUST be 3.11 — TensorFlow doesn't support 3.14+)
REM   venv\Scripts\activate
REM   python -m pip install --upgrade pip
REM   pip install -r requirements.txt
REM   pip install tensorflow opencv-python-headless pennylane pennylane-lightning scikit-learn uvicorn fastapi
REM
REM   After installing, run this once to lock in all installed packages:
REM     pip freeze > requirements.txt
REM
REM Frontend:
REM   cd frontend
REM   yarn install
REM ============================================================