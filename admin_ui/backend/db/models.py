import enum
import uuid
from sqlalchemy import Column, String, Boolean, Enum
from .database import Base

class UserRole(str, enum.Enum):
    owner = "owner"
    manager = "manager"
    operator = "operator"

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(255), unique=True, index=True, nullable=False) # Keep username for backward compatibility
    hashed_password = Column(String(255), nullable=True) # Nullable for OAuth users
    
    role = Column(Enum(UserRole), default=UserRole.manager, nullable=False)
    
    is_email_verified = Column(Boolean, default=False, nullable=False)
    two_factor_enabled = Column(Boolean, default=False, nullable=False)
    two_factor_secret = Column(String(255), nullable=True)
    
    disabled = Column(Boolean, default=False, nullable=False)
    must_change_password = Column(Boolean, default=False, nullable=False)
