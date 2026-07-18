#!/bin/bash
# Start script for Mock AI Interview
# This script initializes the database and starts the Flask server

cd "$(dirname "$0")"

# Initialize database if it doesn't exist
if [ ! -f backend/interview.db ]; then
    echo "Initializing database..."
    cd backend && python database.py && cd ..
fi

# Start the Flask server
cd backend && python app.py