# src-python/db_setup.py

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
# Import Base from your models file
from models import Base, SQLITE_URL, DB_FILE_PATH 

# --- 1. Database Initialization ---

# Ensure the 'db' subdirectory exists before doing anything else
os.makedirs(os.path.dirname(DB_FILE_PATH), exist_ok=True)

# Create a single, module-level engine. SQLite requires check_same_thread=False
# for multi-threaded applications like Flask.
engine = create_engine(
    SQLITE_URL, 
    connect_args={"check_same_thread": False}, 
    echo=False # Set to True for debugging SQL queries
)

# Create a single, module-level session factory to be used throughout the app
SessionLocal = sessionmaker(
    autocommit=False, 
    autoflush=False, 
    bind=engine
)

def create_db_and_tables():
    """
    Creates the database file and all defined tables if they do not already exist.
    This should be called once on application startup to prevent "no such table" errors.
    """
    try:
        print(f"Ensuring tables are created for database at: {DB_FILE_PATH}")
        # Base.metadata.create_all checks for table existence before creating
        Base.metadata.create_all(bind=engine)
        print("✅ Tables created successfully (if they didn't exist).")
    except Exception as e:
        print(f"❌ Error during table creation: {e}")
        # This is a critical failure for the app, so we re-raise it
        raise RuntimeError(f"Failed to create database tables: {e}")