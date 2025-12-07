# serializers.py

from datetime import datetime, date
from sqlalchemy.inspection import inspect

def serialize_value(value):
    """Convert Python/SQLAlchemy values into JSON-friendly values."""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value

def model_to_dict(obj, include_relationships=False, backrefs=False):
    """
    Converts a SQLAlchemy model instance into a dictionary.
    
    Args:
        obj: SQLAlchemy model instance
        include_relationships: include related objects
        backrefs: include reverse relationships

    Returns:
        dict representing the model
    """

    if obj is None:
        return None

    mapper = inspect(obj.__class__)
    data = {}

    # Serialize normal columns
    for column in mapper.columns:
        col_name = column.key
        value = getattr(obj, col_name)
        data[col_name] = serialize_value(value)

    # Serialize relationships if needed
    if include_relationships:
        for name, relation in mapper.relationships.items():

            # Skip backrefs unless explicitly allowed
            if not backrefs and relation.back_populates:
                continue

            related_value = getattr(obj, name)

            if related_value is None:
                data[name] = None

            elif relation.uselist:  # one-to-many
                data[name] = [model_to_dict(item, include_relationships=False)
                              for item in related_value]

            else:  # one-to-one or many-to-one
                data[name] = model_to_dict(related_value, include_relationships=False)

    return data
