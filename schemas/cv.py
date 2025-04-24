from pydantic import BaseModel, Field
from typing import List, Dict, Optional
from datetime import datetime


class OptimizationRequest(BaseModel):
    """Request schema for CV optimization endpoint"""
    cv_text: str
    job_description: str
    skills_to_highlight: Optional[List[str]] = None


class CoverLetterRequest(BaseModel):
    """Request schema for cover letter generation endpoint"""
    job_title: str
    company_name: str
    job_description: str
    candidate_experience: str
    tone: Optional[str] = "professional"


class CVSection(BaseModel):
    """Base schema for a section in a CV"""
    content: List[str]


class ParsedCV(BaseModel):
    """Schema for a parsed CV document"""
    name: str
    contact: Optional[List[str]] = Field(default_factory=list)
    summary: Optional[List[str]] = Field(default_factory=list)
    experience: Optional[List[str]] = Field(default_factory=list)
    education: Optional[List[str]] = Field(default_factory=list)
    skills: Optional[List[str]] = Field(default_factory=list)
    certifications: Optional[List[str]] = Field(default_factory=list)
    languages: Optional[List[str]] = Field(default_factory=list)
    projects: Optional[List[str]] = Field(default_factory=list)
    awards: Optional[List[str]] = Field(default_factory=list)
    references: Optional[List[str]] = Field(default_factory=list)
    other: Optional[List[str]] = Field(default_factory=list)
    raw_text: str


class CVDocument(BaseModel):
    """Schema for storing CV document metadata and content"""
    id: Optional[str] = None  # Changed from int to str to support UUID strings
    name: str
    type: str = "cv"
    content: str
    structured_data: Optional[Dict] = None  # Changed from ParsedCV to Dict for flexibility
    created: datetime = Field(default_factory=datetime.now)
    modified: datetime = Field(default_factory=datetime.now)
    file_path: Optional[str] = None  # Path to the original file
    original_filename: Optional[str] = None  # Original uploaded filename


class CVUploadResponse(BaseModel):
    """Response schema for CV upload endpoint"""
    success: bool
    message: str
    document_id: Optional[str] = None  # Changed from int to str to support UUID strings
    filename: Optional[str] = None
    content: Optional[str] = None
    ai_analysis: Optional[Dict] = None  # Added to match the response structure


class CVAnalysisResult(BaseModel):
    """Schema for AI analysis of a CV"""
    key_skills: List[str]
    experience_years: Optional[str] = None
    education_level: Optional[str] = None
    suggested_improvements: List[str]
    match_score: Optional[int] = None