# src-python/utils.py

from contextlib import contextmanager
from db_setup import SessionLocal

@contextmanager
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

