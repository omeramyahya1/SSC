# serializers.py

from datetime import datetime, date
import base64
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


def user_to_json_serializable(user_obj):
    """
    Converts a SQLAlchemy User object into a dictionary, encoding BLOBs 
    to Base64 strings to make them JSON serializable.
    """
    user_dict = user_obj.__dict__.copy()
    
    # Remove SQLAlchemy internal state key
    user_dict.pop('_sa_instance_state', None)

    # Check and encode the binary fields
    if user_dict.get('business_logo') is not None:
        # 1. Decode the bytes object into a Base64 string
        # 2. Decode the Base64 bytes object into a standard string (utf-8)
        user_dict['business_logo'] = base64.b64encode(user_dict['business_logo']).decode('utf-8')
    
    # Handle other non-JSON serializable types (like datetime objects)
    for key, value in user_dict.items():
        if isinstance(value, datetime):
            user_dict[key] = value.isoformat() # Convert datetime to ISO 8601 string

    return user_dict

# --- Example Usage in your API/Endpoint ---
# fetched_users = session.scalars(select(User)).all() 
# serializable_users = [user_to_json_serializable(user) for user in fetched_users]
# return serializable_users # This list can now be converted to JSON