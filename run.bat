@echo off
REM Start script for Mock AI Interview - Windows version
REM This script initializes the database and starts the Flask server

cd /d "%~dp0"

REM Initialize database if it doesn't exist
if not exist "backend\interview.db" (
    echo Initializing database...
    cd backend
    python database.py
    cd ..
)

REM Start the Flask server
echo Starting Mock AI Interview server on http://localhost:5000
cd backend
python app.py

pause