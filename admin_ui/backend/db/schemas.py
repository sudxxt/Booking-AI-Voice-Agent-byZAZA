import uuid
from typing import Optional
from pydantic import BaseModel, EmailStr
from .models import UserRole

# Shared properties
class UserBase(BaseModel):
    email: EmailStr
    username: str
    role: UserRole = UserRole.manager
    disabled: bool = False

# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str

# Properties to receive via API on update
class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    role: Optional[UserRole] = None
    disabled: Optional[bool] = None
    password: Optional[str] = None
    is_email_verified: Optional[bool] = None
    two_factor_enabled: Optional[bool] = None
    two_factor_secret: Optional[str] = None
    must_change_password: Optional[bool] = None

class UserInDBBase(UserBase):
    id: str
    is_email_verified: bool
    two_factor_enabled: bool
    must_change_password: bool

    class Config:
        from_attributes = True

# Additional properties to return via API
class User(UserInDBBase):
    pass

# Additional properties stored in DB
class UserInDB(UserInDBBase):
    hashed_password: Optional[str] = None
    two_factor_secret: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    must_change_password: bool = False

class TokenData(BaseModel):
    username: Optional[str] = None

class RegisterRequest(BaseModel):
    email: EmailStr
    username: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class VerifyEmailRequest(BaseModel):
    token: str

