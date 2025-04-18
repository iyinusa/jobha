from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os
from dotenv import load_dotenv

# Import routers
from routers.jobs import router as jobs_router
from routers.users import router as users_router
from routers.cv import router as cv_router

# Load environment variables
load_dotenv()

# Create FastAPI app
app = FastAPI(
    title="Jobha - Job Agent API",
    description="API for Jobha - Your professional job search assistant",
    version="1.0.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(jobs_router, prefix="/api/jobs", tags=["Jobs"])
app.include_router(users_router, prefix="/api/users", tags=["Users"])
app.include_router(cv_router, prefix="/api/cv", tags=["CV & Cover Letter"])

# Create a directory for static files if it doesn't exist
os.makedirs("static", exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", tags=["Health Check"])
async def root():
    """Health check endpoint to verify the API is running properly"""
    return {
        "status": "healthy",
        "service": "Jobha Job Agent API",
        "version": "1.0.0"
    }

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    return JSONResponse(
        status_code=500,
        content={"message": "Internal server error", "detail": str(exc)}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)