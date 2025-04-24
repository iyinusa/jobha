from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os
from dotenv import load_dotenv
import pathlib

# Import routers
from routers.jobs import router as jobs_router
from routers.cv import router as cv_router

# Load environment variables
load_dotenv()

# Create FastAPI app
app = FastAPI(
    title="Jobha - Job Agent API",
    description="API for Jobha - Your professional job search assistant",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
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
app.include_router(jobs_router, tags=["Jobs"])
app.include_router(cv_router, tags=["CV & Cover Letter"])

# Define base directory
BASE_DIR = pathlib.Path(__file__).resolve().parent

# Create directories for static files and templates if they don't exist
os.makedirs(os.path.join(BASE_DIR, "static"), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "templates"), exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

# Setup templates
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

@app.get("/", response_class=HTMLResponse, tags=["Pages"])
async def home_page(request: Request):
    """Render the landing page"""
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/editor", response_class=HTMLResponse, tags=["Pages"])
async def document_editor(request: Request):
    """Render the CV and Cover Letter editor page"""
    return templates.TemplateResponse("editor.html", {"request": request})

@app.get("/api", tags=["Health Check"])
async def root():
    """Health check endpoint to verify the API is running properly"""
    return {
        "status": "healthy",
        "service": "Jobha - Job Hunt Agent API",
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