from fastapi import APIRouter, HTTPException, Depends, Body
from typing import Optional
from pydantic import BaseModel, EmailStr

router = APIRouter()

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserProfile(BaseModel):
    email: EmailStr
    name: str
    bio: Optional[str] = None
    skills: list[str] = []
    experience: list[dict] = []
    education: list[dict] = []
    profile_complete: bool = False

@router.post("/register")
async def register_user(user: UserCreate):
    """
    Register a new user
    """
    # In a real app, you would hash the password and save to database
    return {
        "success": True,
        "message": "User registered successfully",
        "user_id": "user-123456"
    }

@router.post("/login")
async def login_user(user: UserLogin):
    """
    Authenticate a user and return token
    """
    # In a real app, you would verify credentials and generate a JWT token
    return {
        "success": True,
        "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "token_type": "bearer",
        "user": {
            "id": "user-123456",
            "name": "John Doe",
            "email": user.email
        }
    }

@router.get("/profile")
async def get_profile():
    """
    Get the current user's profile
    """
    # In a real app, this would be retrieved from the database
    return {
        "success": True,
        "profile": {
            "name": "John Doe",
            "email": "john@example.com",
            "bio": "Senior Developer with 5 years of experience",
            "skills": ["Python", "FastAPI", "React", "Docker"],
            "experience": [
                {
                    "title": "Senior Developer",
                    "company": "Tech Corp",
                    "start_date": "2020-01",
                    "end_date": None,
                    "current": True,
                    "description": "Leading development of microservices"
                }
            ],
            "education": [
                {
                    "degree": "Master of Computer Science",
                    "institution": "Tech University",
                    "year": "2019"
                }
            ],
            "profile_complete": True
        }
    }

@router.put("/profile")
async def update_profile(profile: UserProfile):
    """
    Update the user's profile
    """
    return {
        "success": True,
        "message": "Profile updated successfully",
        "profile": profile.dict()
    }

@router.post("/upload-cv")
async def upload_cv():
    """
    Upload a CV for the user
    """
    return {
        "success": True,
        "message": "CV uploaded successfully",
        "cv_id": "cv-123456"
    }