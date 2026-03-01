import os
import json
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from sqlalchemy.orm import Session

# Import our new DB modules
from db.database import get_db, engine
from db import models, crud, schemas
from services.email_service import email_service
from settings import USERS_PATH, PROJECT_ROOT

# Create tables if not exist
models.Base.metadata.create_all(bind=engine)

# Configuration
DEFAULT_DEV_SECRET = "dev-secret-key-change-in-prod"
PLACEHOLDER_SECRETS = {
    "",
    "change-me-please",
    "changeme",
    DEFAULT_DEV_SECRET,
}

_raw_secret = (os.getenv("JWT_SECRET", "") or "").strip()
SECRET_KEY = _raw_secret or DEFAULT_DEV_SECRET
USING_PLACEHOLDER_SECRET = SECRET_KEY in PLACEHOLDER_SECRETS
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
router = APIRouter()

# --- Helper Functions ---

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    # We allow login by username or email. Token usually holds username.
    user = crud.get_user_by_username(db, username=username)
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(current_user: models.User = Depends(get_current_user)):
    if current_user.disabled:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

class RoleChecker:
    def __init__(self, allowed_roles: list):
        self.allowed_roles = allowed_roles

    def __call__(self, user: models.User = Depends(get_current_active_user)):
        if user.role.value not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation not permitted"
            )
        return user


# Setup default admin user on first run or migrate JSON users
def _migrate_json_users(db: Session):
    # check if any users exist in db
    db_users_count = db.query(models.User).count()
    
    if db_users_count == 0:
        if os.path.exists(USERS_PATH):
            try:
                with open(USERS_PATH, "r") as f:
                    old_users = json.load(f)
                
                for uname, udata in old_users.items():
                    if not crud.get_user_by_username(db, uname):
                        # Create via SQLAlchemy
                        new_user = models.User(
                            email=f"{uname}@example.com", # placeholder email
                            username=uname,
                            hashed_password=udata.get("hashed_password"),
                            role=models.UserRole.owner if uname == "admin" else models.UserRole.manager,
                            disabled=udata.get("disabled", False),
                            must_change_password=udata.get("must_change_password", False),
                            is_email_verified=True
                        )
                        db.add(new_user)
                db.commit()
            except Exception as e:
                print(f"Error migrating users from JSON: {e}")
                
        # If DB still empty after migration attempt, create default admin
        if db.query(models.User).count() == 0:
            default_admin = models.User(
                email="admin@example.com",
                username="admin",
                hashed_password=crud.get_password_hash("admin"),
                role=models.UserRole.owner,
                must_change_password=True,
                is_email_verified=True
            )
            db.add(default_admin)
            db.commit()

# --- Routes ---

@router.post("/login", response_model=schemas.Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    # Ensure standard admin exists or old users migrated
    _migrate_json_users(db)
    
    # allow search by email or username
    user = crud.get_user_by_username(db, username=form_data.username)
    if not user:
        user = crud.get_user_by_email(db, email=form_data.username)
        
    if not user or not crud.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if user.disabled:
        raise HTTPException(status_code=400, detail="Inactive user")

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role}, expires_delta=access_token_expires
    )
    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "must_change_password": user.must_change_password
    }

@router.post("/change-password")
async def change_password(
    request: schemas.ChangePasswordRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not crud.verify_password(request.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect old password")
        
    # Update password
    current_user.hashed_password = crud.get_password_hash(request.new_password)
    current_user.must_change_password = False
    
    db.add(current_user)
    db.commit()
    
    return {"status": "success", "message": "Password updated successfully"}

@router.get("/me", response_model=schemas.User)
async def read_users_me(current_user: models.User = Depends(get_current_active_user)):
    return current_user

@router.post("/register", response_model=schemas.User)
async def register_user(request: schemas.RegisterRequest, db: Session = Depends(get_db)):
    if crud.get_user_by_email(db, email=request.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    if crud.get_user_by_username(db, username=request.username):
        raise HTTPException(status_code=400, detail="Username already registered")
        
    user_create = schemas.UserCreate(
        email=request.email,
        username=request.username,
        password=request.password,
        role=models.UserRole.manager,
        disabled=False
    )
    new_user = crud.create_user(db, user=user_create)
    
    # Generate verification token
    expire = datetime.utcnow() + timedelta(hours=24)
    token = jwt.encode({"sub": new_user.email, "type": "verify", "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)
    
    await email_service.send_verification_email(new_user.email, token)
    
    return new_user

@router.post("/verify-email")
async def verify_email(request: schemas.VerifyEmailRequest, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(request.token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        token_type: str = payload.get("type")
        if not email or token_type != "verify":
            raise HTTPException(status_code=400, detail="Invalid token")
            
        user = crud.get_user_by_email(db, email=email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
            
        user.is_email_verified = True
        db.add(user)
        db.commit()
        return {"status": "success", "message": "Email verified successfully"}
        
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

@router.post("/forgot-password")
async def forgot_password(request: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = crud.get_user_by_email(db, email=request.email)
    if not user:
        # Prevent email enumeration attacks by returning success anyway
        return {"status": "success", "message": "If this email is registered, a recovery link has been sent."}
        
    expire = datetime.utcnow() + timedelta(hours=1)
    token = jwt.encode({"sub": user.email, "type": "reset", "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)
    
    await email_service.send_password_reset_email(user.email, token)
    return {"status": "success", "message": "If this email is registered, a recovery link has been sent."}

@router.post("/reset-password")
async def reset_password(request: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(request.token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        token_type: str = payload.get("type")
        
        if not email or token_type != "reset":
            raise HTTPException(status_code=400, detail="Invalid token")
            
        user = crud.get_user_by_email(db, email=email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
            
        user.hashed_password = crud.get_password_hash(request.new_password)
        user.must_change_password = False
        db.add(user)
        db.commit()
        return {"status": "success", "message": "Password has been reset successfully"}
        
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
