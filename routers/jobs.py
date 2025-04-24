from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime

router = APIRouter(
    prefix="/api/jobs",
    tags=["jobs"],
    responses={404: {"description": "Not found"}}
)

@router.get("/search")
async def search_jobs(
    keyword: str = Query(..., description="Job title, skill or keyword"),
    location: Optional[str] = Query(None, description="Location for job search"),
    page: int = Query(1, description="Page number for pagination"),
    limit: int = Query(10, description="Number of results per page")
):
    """
    Search for jobs based on keywords and location
    """
    # This would connect to actual job search APIs in production
    # For now we return mock data
    return {
        "success": True,
        "page": page,
        "limit": limit,
        "total": 120,
        "jobs": [
            {
                "id": "job-1",
                "title": "Senior Python Developer",
                "company": "Tech Solutions Inc.",
                "location": location or "Remote",
                "description": f"Looking for expertise in {keyword}. We offer competitive salary and benefits.",
                "salary": "$110K - $150K",
                "posted_date": datetime.now().isoformat(),
                "url": "https://example.com/job1"
            },
            {
                "id": "job-2",
                "title": f"{keyword.title()} Engineer",
                "company": "Innovative Systems",
                "location": location or "San Francisco, CA",
                "description": f"Join our team of experts in {keyword}.",
                "salary": "$95K - $130K",
                "posted_date": datetime.now().isoformat(),
                "url": "https://example.com/job2"
            }
        ]
    }

@router.get("/trending-skills")
async def get_trending_skills():
    """
    Get trending skills in the job market
    """
    return {
        "success": True,
        "skills": [
            {"name": "Python", "growth": 15, "demand": "Very High"},
            {"name": "React", "growth": 12, "demand": "High"},
            {"name": "Machine Learning", "growth": 22, "demand": "Very High"},
            {"name": "Docker", "growth": 18, "demand": "High"},
            {"name": "AWS", "growth": 14, "demand": "High"}
        ]
    }

@router.post("/save")
async def save_job(job_id: str):
    """
    Save a job for later viewing
    """
    return {
        "success": True,
        "message": f"Job {job_id} saved successfully"
    }

@router.post("/notifications/setup")
async def setup_job_notifications(
    keywords: List[str],
    locations: Optional[List[str]] = None,
    frequency: str = "daily"
):
    """
    Set up automated job notifications based on keywords and locations
    """
    return {
        "success": True,
        "message": f"Notifications set up successfully for keywords: {keywords}",
        "frequency": frequency,
        "locations": locations or ["Remote", "Anywhere"]
    }