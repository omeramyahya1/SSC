# src-python/db_setup.py

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
# Import Base and your models (like User) from your models file
from models import Base, SQLITE_URL, DB_FILE_PATH 

# --- 1. Database Initialization ---

def initialize_database():
    """
    Creates the SQLAlchemy Engine, ensures the directory exists, and 
    generates all defined tables if they do not already exist.
    """
    try:
        # Create the 'db' subdirectory if it doesn't exist
        os.makedirs(os.path.dirname(DB_FILE_PATH), exist_ok=True)
        
        # 1. Create the engine. SQLite requires check_same_thread=False for Flask 
        # (as Flask serves requests in different threads).
        engine = create_engine(
            SQLITE_URL, 
            connect_args={"check_same_thread": False}, 
            echo=False # Set to True for debugging SQL queries
        )
        
        # 2. Define the session factory
        SessionLocal = sessionmaker(
            autocommit=False, 
            autoflush=False, 
            bind=engine
        )
        
        print(f"✅ Database session factory created for: {DB_FILE_PATH}")
        return SessionLocal
        
    except Exception as e:
        print(f"❌ Error initializing database: {e}")
        # In a production sidecar, you might want to raise an error 
        # or log this and terminate the app.
        raise RuntimeError(f"Failed to initialize database: {e}")

# Global Session factory, called once at application startup
SessionLocal = initialize_database()