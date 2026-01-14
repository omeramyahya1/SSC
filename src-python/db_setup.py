# src-python/db_setup.py

import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.orm.attributes import get_history
# Import Base from your models file
from models import Base, SQLITE_URL, DB_FILE_PATH, TimestampDirtyMixin

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

# --- 2. SQLAlchemy Event Listeners ---

@event.listens_for(SessionLocal, 'before_flush')
def before_flush_listener(session, flush_context, instances):
    """
    Listen for objects being flushed and automatically set is_dirty=True on
    any updated model instance that uses the TimestampDirtyMixin.
    """
    for instance in session.dirty:
        # Only act on models that have our mixin
        if not isinstance(instance, TimestampDirtyMixin):
            continue

        # Ignore new objects (is_dirty should be set manually on creation)
        # and deleted objects.
        if instance in session.new or instance in session.deleted:
            continue

        # This instance is being updated. Check the history of the 'is_dirty' flag.
        history = get_history(instance, 'is_dirty')

        # If is_dirty was explicitly set to False (like in our pull-sync),
        # the history will show this change. We must respect it and not override.
        if history.has_changes() and history.added and history.added[0] is False:
            continue

        # For any other modification, mark the instance as dirty.
        instance.is_dirty = True


# --- 3. Database and Table Creation Function ---

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
