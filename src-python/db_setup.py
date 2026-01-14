# src-python/db_setup.py

import os
from sqlalchemy import create_engine, event, inspect
from sqlalchemy.orm import sessionmaker, attributes
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
    any updated model instance that uses the TimestampDirtyMixin,
    unless 'is_dirty' was explicitly set to False during a merge (pull-sync),
    or if the session is currently marked as performing a pull sync.
    """
    # If a flag is set on the session indicating an active pull sync, bypass auto-dirtying.
    if getattr(session, 'is_pull_sync_active', False):
        return

    for instance in session.dirty:
        # Only act on models that have our mixin
        if not isinstance(instance, TimestampDirtyMixin):
            continue

        # Ignore new objects (is_dirty should be set manually on creation if needed)
        # and deleted objects.
        if instance in session.new or instance in session.deleted:
            continue

        # At this point, 'instance' is an existing object that has been modified.
        insp = inspect(instance)

        # Check if any attribute OTHER THAN 'is_dirty' has changed.
        has_other_changes = False
        for attr in insp.attrs:
            if attr.key == 'is_dirty':
                continue
            if attr.history.has_changes():
                has_other_changes = True
                break

        if not has_other_changes:
            # If no other attributes were changed, then the only possible change
            # is to 'is_dirty' itself. We only want to block the change if
            # 'is_dirty' was explicitly set to False.
            is_dirty_history = insp.attrs.is_dirty.history
            if is_dirty_history.has_changes() and is_dirty_history.added and is_dirty_history.added[0] is False:
                continue # Respect the explicit is_dirty = False setting

        # If other attributes changed, or if is_dirty was not explicitly set to False,
        # we ensure the instance is marked as dirty for the next push.
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
