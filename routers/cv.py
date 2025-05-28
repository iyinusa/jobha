from fastapi import APIRouter, UploadFile, HTTPException, File, Form, Path, Body, Query, BackgroundTasks
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Union, AsyncIterator
import os
import uuid
import json
import logging
from pathlib import Path as FilePath
from datetime import datetime
import asyncio
from sse_starlette.sse import EventSourceResponse

# Import schema classes
from schemas.cv import TailoredCVRequest, TailoredCVResponse

# Import database service
from services.database.json_db import db
from services.document_parser.parser import DocumentParser
from services.document_parser.file_converter import FileConverter  # Add import for file converter

# Import CV analyzer
from services.ai.cv_analyzer import CVAnalyzer

# Import the Perplexity API service
from services.ai.perplexity_api import perplexity_api

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(
    prefix="/api/cv",
    tags=["cv"],
    responses={404: {"description": "Not found"}},
)

# Upload directory
UPLOAD_DIR = FilePath("static/uploads") 
# Create upload directory if it doesn't exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Pydantic models
class DocumentResponse(BaseModel):
    id: str
    name: str
    category: str  
    type: str      
    content: Optional[str] = None
    file_path: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    
class DocumentListResponse(BaseModel):
    success: bool
    documents: List[Dict[str, Any]]
    
class DocumentCreateResponse(BaseModel):
    success: bool
    document_id: str
    message: Optional[str] = None
    
class DocumentDeleteResponse(BaseModel):
    success: bool
    message: str
    
class DocumentRenameRequest(BaseModel):
    new_name: str = Field(..., title="New document name")
    
class DocumentRenameResponse(BaseModel):
    success: bool
    document_id: str
    message: Optional[str] = None
    
class FileListResponse(BaseModel):
    success: bool
    files: List[Dict[str, Any]]

class DocumentAnalysisResponse(BaseModel):
    success: bool
    document_id: str
    analysis: Optional[Dict[str, Any]] = None
    message: Optional[str] = None

class JobSearchRequest(BaseModel):
    doc_id: str = Field(..., description="Document ID of the CV to use for search")

class JobListResponse(BaseModel):
    success: bool
    doc_id: str
    jobs_count: int
    jobs: List[Dict[str, Any]]
    keywords_used: Optional[List[str]] = None

class TailoredCVResponse(BaseModel):
    success: bool
    doc_id: str
    job_id: Optional[str] = None
    content: Optional[str] = None
    message: Optional[str] = None

# File upload handler
@router.post("/upload", response_model=DocumentCreateResponse)
async def upload_cv(
    file: UploadFile = File(...),
    skip_parsing: bool = Form(False)
):
    try:
        # Generate a unique filename
        file_ext = os.path.splitext(file.filename)[1].lower()
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = UPLOAD_DIR / unique_filename
        pdf_path = None
        original_doc_path = None
        
        # Validate file type
        allowed_extensions = ['.pdf', '.doc', '.docx', '.txt']
        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported file type. Please upload one of: {', '.join(allowed_extensions)}"
            )
        
        # Save file to disk
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Empty file")
            
        with open(file_path, "wb") as f:
            f.write(content)
            
        logger.info(f"File saved to {file_path}")
        
        # Convert DOCX/DOC files to PDF
        if file_ext in ['.doc', '.docx']:
            try:
                # Store the original path for cleanup later
                original_doc_path = file_path
                
                # Convert to PDF
                pdf_path = await FileConverter.docx_to_pdf(str(file_path), str(UPLOAD_DIR))
                
                # Update variables for further processing
                file_path = FilePath(pdf_path)
                file_ext = ".pdf"
                unique_filename = os.path.basename(pdf_path)
                
                logger.info(f"File converted to PDF: {pdf_path}")
            except Exception as conv_err:
                # Clean up original file if conversion fails
                if os.path.exists(file_path):
                    os.remove(file_path)
                logger.error(f"PDF conversion error: {str(conv_err)}")
                raise HTTPException(status_code=500, detail=f"Failed to convert document to PDF: {str(conv_err)}")
        
        # Determine document category (CV or Cover Letter)
        doc_category = "cv"  # Default is CV
        if "cover" in file.filename.lower():
            doc_category = "cover-letter"
        
        # Determine file format type based on extension
        file_format = ""
        if file_ext == ".pdf":
            file_format = "pdf"
        elif file_ext in [".doc", ".docx"]:
            file_format = "word"
        elif file_ext == ".txt":
            file_format = "text"
        
        # Create relative path for database storage
        relative_path = f"uploads/{unique_filename}"
        
        # If skip_parsing is True, just save file metadata
        if skip_parsing:
            document = {
                "id": str(uuid.uuid4()),
                "name": os.path.splitext(file.filename)[0],
                "category": doc_category,  
                "type": file_format if file_ext != ".pdf" else "pdf",  # Ensure type is correct if converted
                "file_path": relative_path,
                "content": None,
                "modified": datetime.now().isoformat(),
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
            
            # Save to database
            document = db.add_document(document)
            
            # Clean up original doc/docx file if it was converted
            if original_doc_path and os.path.exists(original_doc_path):
                os.remove(original_doc_path)
                logger.info(f"Cleaned up original document: {original_doc_path}")
            
            # Return success response with document ID
            return {
                "success": True, 
                "document_id": document["id"],
                "message": "File uploaded successfully"
            }
            
        # Parse document content
        parser = DocumentParser()
        result_coroutine = parser.parse_document(str(file_path))
        
        if not result_coroutine:
            # Delete the file if parsing setup failed
            os.remove(file_path)
            # Also delete original file if it exists
            if original_doc_path and os.path.exists(original_doc_path):
                os.remove(original_doc_path)
            raise HTTPException(status_code=400, detail="Could not initialize document parsing")
        
        # Await the coroutine to get the actual content
        content = await result_coroutine
        
        if not content:
            # Delete the file if parsing failed
            os.remove(file_path)
            # Also delete original file if it exists
            if original_doc_path and os.path.exists(original_doc_path):
                os.remove(original_doc_path)
            raise HTTPException(status_code=400, detail="Could not parse document content")
            
        # Create document object
        document = {
            "id": str(uuid.uuid4()),
            "name": os.path.splitext(file.filename)[0],
            "category": doc_category,  
            "type": file_format if file_ext != ".pdf" else "pdf",  # Ensure type is correct if converted
            "content": content,
            "file_path": relative_path,
            "modified": datetime.now().isoformat(),
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
        
        # Save to database
        document = db.add_document(document)
        
        # Clean up original doc/docx file if it was converted
        if original_doc_path and os.path.exists(original_doc_path):
            os.remove(original_doc_path)
            logger.info(f"Cleaned up original document: {original_doc_path}")
        
        return {
            "success": True, 
            "document_id": document["id"],
            "message": "Document uploaded and parsed successfully"
        }
    
    except HTTPException as e:
        logger.error(f"HTTP Exception: {str(e.detail)}")
        return JSONResponse(
            status_code=e.status_code,
            content={"success": False, "message": str(e.detail)}
        )
    except Exception as e:
        logger.error(f"Error uploading CV: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Error processing file: {str(e)}"}
        )

# Get all documents
@router.get("/documents", response_model=DocumentListResponse)
async def list_documents():
    try:
        documents = db.list_documents()
        # Return all documents
        return {"success": True, "documents": documents}
    except Exception as e:
        logger.error(f"Error listing documents: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error listing documents: {str(e)}")

# Get a document by ID
@router.get("/documents/{doc_id}", response_model=Dict[str, Any])
async def get_document(doc_id: str = Path(..., title="Document ID")):
    try:
        document = db.get_document(doc_id)
        if document is None:
            raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
        return document
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error getting document {doc_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving document: {str(e)}")

# Rename a document
@router.put("/documents/{doc_id}/rename", response_model=DocumentRenameResponse)
async def rename_document(
    doc_id: str = Path(..., title="Document ID"), 
    request: DocumentRenameRequest = Body(...)
):
    try:
        updated_doc = db.rename_document(doc_id, request.new_name)
        if not updated_doc:
            raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
            
        return {
            "success": True,
            "document_id": updated_doc["id"],
            "message": "Document renamed successfully"
        }
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error renaming document {doc_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error renaming document: {str(e)}")

# Delete a document
@router.delete("/documents/{doc_id}", response_model=DocumentDeleteResponse)
async def delete_document(doc_id: str = Path(..., title="Document ID")):
    try:
        # Get document before deleting to check if it has a file path
        document = db.get_document(doc_id)
        if not document:
            raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
            
        # Check if document has a file to delete
        if document.get("file_path"):
            # Handle the file path - it's stored as "uploads/filename" but we need the absolute path
            file_path = FilePath("static") / document["file_path"]
            # Delete file if it exists
            if file_path.exists():
                try:
                    os.remove(file_path)
                    logger.info(f"Deleted file: {file_path}")
                except Exception as file_e:
                    logger.error(f"Error deleting file {file_path}: {str(file_e)}")
        
        # Delete from database
        result = db.delete_document(doc_id)
        if not result:
            raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
            
        return {
            "success": True,
            "message": "Document deleted successfully"
        }
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error deleting document {doc_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting document: {str(e)}")

# Analyze a document with Perplexity API
@router.post("/documents/{doc_id}/analyze", response_model=DocumentAnalysisResponse)
async def analyze_document(doc_id: str = Path(..., title="Document ID")):
    """
    Analyze a CV document to extract information using the Perplexity API
    """
    try:
        # Get the document from the database
        document = db.get_document(doc_id)
        if not document:
            raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
        
        # Check if document has content
        if not document.get("content"):
            # If no content, try to parse it from the file
            file_path = document.get("file_path")
            if not file_path:
                raise HTTPException(status_code=400, detail="Document has no content or file path")
                
            # Get the absolute path
            full_path = os.path.join("static", file_path)
            if not os.path.exists(full_path):
                raise HTTPException(status_code=404, detail=f"Document file not found: {full_path}")
                
            # Parse the document
            parser = DocumentParser()
            result_coroutine = parser.parse_document(full_path)
            
            if not result_coroutine:
                raise HTTPException(status_code=400, detail="Could not initialize document parsing")
                
            # Await the coroutine to get the actual content
            content = await result_coroutine
            
            if not content:
                raise HTTPException(status_code=400, detail="Could not extract content from document")
                
            # Update document with content
            document = db.update_document(doc_id, {"content": content})
        
        # Use Perplexity API to analyze the CV
        analysis_result = perplexity_api.analyze_cv(document["content"])
        
        if not analysis_result:
            raise HTTPException(status_code=500, detail="Failed to analyze document with Perplexity API")
        
        # Save the analysis results to the database
        saved_keywords = db.save_document_keywords(doc_id, analysis_result)
        
        # Return the analysis results
        return {
            "success": True,
            "document_id": doc_id,
            "analysis": saved_keywords,
            "message": "Document analyzed successfully"
        }
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error analyzing document {doc_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error analyzing document: {str(e)}")

# Get analysis for a document
@router.get("/documents/{doc_id}/keywords", response_model=DocumentAnalysisResponse)
async def get_document_keywords(doc_id: str = Path(..., title="Document ID")):
    """
    Get keywords/information extracted from a document
    """
    try:
        # Verify document exists
        document = db.get_document(doc_id)
        if not document:
            raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
            
        # Get keywords from the database
        keywords = db.get_document_keywords(doc_id)
        
        if not keywords:
            return {
                "success": False,
                "document_id": doc_id,
                "message": "No analysis data found for this document"
            }
            
        return {
            "success": True,
            "document_id": doc_id,
            "analysis": keywords,
            "message": "Analysis data retrieved successfully"
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error getting document keywords {doc_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving document keywords: {str(e)}")

# INTEGRATED JOB SEARCH FUNCTIONALITY
@router.post("/documents/{doc_id}/search-jobs", response_model=JobListResponse)
async def search_jobs_with_document(doc_id: str = Path(..., title="Document ID")):
    """
    Search for jobs based on document keywords extracted from a CV.
    Uses Perplexity API to search job websites.
    """
    try:
        # Get the document from the database
        doc = db.get_document(doc_id)
        if not doc:
            raise HTTPException(status_code=404, detail=f"Document with ID {doc_id} not found")
            
        # Get document analysis if available
        doc_analysis = db.get_document_keywords(doc_id)
        
        # If no analysis is found, we can't proceed
        if not doc_analysis:
            raise HTTPException(
                status_code=400, 
                detail="Document hasn't been analyzed yet. Please try again later."
            )
            
        # Extract keywords for job search
        keywords = []
        
        # First try to get job search keywords specifically
        if doc_analysis.get("job_search_keywords"):
            keywords.extend(doc_analysis.get("job_search_keywords"))
        
        # Add skills as keywords
        if doc_analysis.get("skills"):
            keywords.extend(doc_analysis.get("skills"))
            
        # Add job titles
        if doc_analysis.get("job_titles"):
            keywords.extend(doc_analysis.get("job_titles"))
            
        # Remove duplicates and limit to 20 keywords
        unique_keywords = list(dict.fromkeys([k for k in keywords if k]))[:20]
        
        if not unique_keywords:
            raise HTTPException(
                status_code=400,
                detail="Could not extract keywords from document for job search"
            )
            
        # Call Perplexity API to search for jobs
        search_results = perplexity_api.search_jobs(unique_keywords, doc_id, None)
        
        if not search_results:
            return {
                "success": False,
                "doc_id": doc_id,
                "jobs_count": 0,
                "jobs": [],
                "message": "No job matches found. Please try again later."
            }
            
        # Get all jobs associated with this document from database
        jobs = db.get_document_jobs(doc_id)
        
        return {
            "success": True,
            "doc_id": doc_id,
            "jobs_count": len(jobs),
            "jobs": jobs,
            "keywords_used": unique_keywords
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Job search failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Job search failed: {str(e)}")
        
@router.get("/documents/{doc_id}/jobs", response_model=JobListResponse)
async def get_document_jobs(
    doc_id: str = Path(..., title="Document ID"),
    limit: int = Query(50, description="Number of results to return")
):
    """
    Get jobs associated with a specific document ID
    """
    try:
        # Verify document exists
        document = db.get_document(doc_id)
        if not document:
            raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
            
        # Get all jobs for this document
        jobs = db.get_document_jobs(doc_id)
        
        # Sort by match score descending
        sorted_jobs = sorted(jobs, key=lambda x: x.get("match_score", 0), reverse=True)
        
        return {
            "success": True,
            "doc_id": doc_id,
            "jobs_count": len(sorted_jobs),
            "jobs": sorted_jobs[:limit]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Could not retrieve jobs: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Could not retrieve jobs: {str(e)}")

# Stream job search results
@router.get("/documents/{doc_id}/search-jobs/stream")
async def stream_jobs_search(
    background_tasks: BackgroundTasks,
    doc_id: str = Path(..., title="Document ID")
):
    """
    Stream job search results as server-sent events.
    This endpoint performs background job searching and streams results in real-time.
    Clients can use the EventSource API to receive updates as they happen.
    """
    async def job_search_generator() -> AsyncIterator[str]:
        """Generate server-sent events with job data"""
        try:
            # First, verify the document exists
            doc = db.get_document(doc_id)
            if not doc:
                yield f"data: {json.dumps({'error': f'Document with ID {doc_id} not found'})}\n\n"
                return
                
            # Get document analysis
            doc_analysis = db.get_document_keywords(doc_id)
            if not doc_analysis:
                yield f"data: {json.dumps({'error': 'Document not analyzed yet. Please click on AI Analysis first.'})}\n\n"
                return
            
            # Get the primary search keyword (first item from job_search_keywords)
            primary_search_keyword = None
            if doc_analysis.get("job_search_keywords") and doc_analysis.get("job_search_keywords")[0]:
                primary_search_keyword = doc_analysis.get("job_search_keywords")[0]
                logger.info(f"Using primary search keyword: {primary_search_keyword}")
            
            # If no primary keyword found, use fallback approach with combined keywords
            if not primary_search_keyword:
                # Extract keywords for job search the traditional way
                keywords = []
                
                if doc_analysis.get("job_search_keywords"):
                    keywords.extend(doc_analysis.get("job_search_keywords"))
                
                if doc_analysis.get("skills"):
                    keywords.extend(doc_analysis.get("skills"))
                    
                if doc_analysis.get("job_titles"):
                    keywords.extend(doc_analysis.get("job_titles"))
                    
                # Remove duplicates and limit keywords
                keywords = list(dict.fromkeys([k for k in keywords if k]))[:20]
                
                if not keywords:
                    yield f"data: {json.dumps({'error': 'Could not extract keywords from document'})}\n\n"
                    return
            else:
                # Use all keywords for match scoring but primary one for search
                keywords = [primary_search_keyword]
                if doc_analysis.get("job_search_keywords") and len(doc_analysis.get("job_search_keywords")) > 1:
                    keywords.extend(doc_analysis.get("job_search_keywords")[1:])
            
            # Setup queue for jobs found
            job_queue = asyncio.Queue()
            search_complete = asyncio.Event()
            search_error = None
            
            # Load websites from the JSON file for display in UI
            # Load websites from the JSON file - adjust path for data folder location
            data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
            websites_path = os.path.join(data_dir, "websites.json")
            
            websites = []
            try:
                with open(websites_path, 'r') as f:
                    websites = json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load websites.json: {str(e)}")
                websites = ["indeed.com", "glassdoor.com", "simplyhired.com", "dice.com"]
            
            # Simplified callback function for async communication
            def job_callback(jobs, is_complete=False, error=None):
                nonlocal search_error
                logger.info(f"Job callback received {len(jobs)} jobs, is_complete={is_complete}, error={error}")
                
                try:
                    # Add jobs to queue (thread-safe)
                    for job in jobs:
                        try:
                            loop = asyncio.get_running_loop()
                            asyncio.run_coroutine_threadsafe(job_queue.put(job), loop)
                        except RuntimeError:
                            # Fallback if no running loop
                            asyncio.create_task(job_queue.put(job))
                    
                    # Mark search as complete if indicated
                    if is_complete or error:
                        if error:
                            search_error = error
                        # Signal completion (thread-safe)
                        try:
                            loop = asyncio.get_running_loop()
                            asyncio.run_coroutine_threadsafe(search_complete.set(), loop)
                        except RuntimeError:
                            # Fallback if no running loop
                            asyncio.create_task(search_complete.set())
                
                except Exception as e:
                    logger.error(f"Error in job callback: {str(e)}")
                    # Try to signal completion even if there's an error
                    try:
                        search_error = f"Callback error: {str(e)}"
                        try:
                            loop = asyncio.get_running_loop()
                            asyncio.run_coroutine_threadsafe(search_complete.set(), loop)
                        except RuntimeError:
                            asyncio.create_task(search_complete.set())
                    except Exception as cb_e:
                        logger.error(f"Failed to signal completion from callback: {str(cb_e)}")
            
            # Start job search async
            asyncio.create_task(
                perplexity_api.search_jobs_async(keywords, doc_id, job_callback)
            )
            
            # Send initial message with search information for UI display
            if primary_search_keyword:
                logger.info(f"Starting job search with primary keyword: {primary_search_keyword}")
                yield f"data: {json.dumps({'status': 'started', 'message': 'Starting job search...', 'primary_keyword': primary_search_keyword, 'keywords': keywords})}\n\n"
            else:
                logger.info(f"Starting job search with keywords: {keywords}")
                yield f"data: {json.dumps({'status': 'started', 'message': 'Starting job search...', 'keywords': keywords})}\n\n"
            
            # Send websites information for UI display
            yield f"data: {json.dumps({'status': 'searching', 'message': 'Initializing job search...', 'websites': websites[:10]})}\n\n"
            
            # Counter for progress updates and timeout handling
            jobs_found = 0
            last_job_time = datetime.now()
            overall_timeout = 60  # Maximum time to wait for the entire search (seconds)
            
            # Track start time for overall timeout
            start_time = datetime.now()
            
            # Wait for jobs to arrive and send them to client
            while not search_complete.is_set():
                try:
                    # Check if we've exceeded the maximum overall wait time
                    elapsed_time = (datetime.now() - start_time).total_seconds()
                    if elapsed_time > overall_timeout:
                        logger.warning(f"Maximum overall wait time of {overall_timeout}s exceeded for job search")
                        # Send a timing out message to the client
                        try:
                            yield f"data: {json.dumps({'status': 'timeout', 'message': 'The job search is taking longer than expected. We may have partial results.'})}\n\n"
                        except Exception as e:
                            logger.error(f"Error sending timeout notification: {str(e)}")
                        break
                    
                    # Try to get a job from the queue with timeout
                    try:
                        job = await asyncio.wait_for(job_queue.get(), timeout=3.0)
                        jobs_found += 1
                        last_job_time = datetime.now()
                        
                        # Add job source information for UI display
                        job_source = "Unknown source"
                        if job.get("url"):
                            url = job.get("url")
                            for site in websites:
                                if isinstance(site, str) and site.lower() in url.lower():
                                    job_source = site
                                    break
                        
                        # Include AI match information in the response
                        match_score = job.get('match_score', 0)
                        if match_score is None:  # Ensure match_score is not None
                            match_score = 0
                            
                        # Sanitize job data to ensure it can be serialized to JSON
                        sanitized_job = {}
                        for k, v in job.items():
                            # Only include serializable data types
                            if isinstance(v, (str, int, float, bool, list, dict)) or v is None:
                                sanitized_job[k] = v
                            else:
                                # Convert non-serializable types to string representation
                                sanitized_job[k] = str(v)
                            
                        # Send job data
                        yield f"data: {json.dumps({'job': sanitized_job, 'jobs_count': jobs_found, 'source': job_source, 'match_score': match_score, 'match_quality': get_match_quality_label(match_score)})}\n\n"
                        
                        # Log job count
                        logger.info(f"Job count: {jobs_found}")
                        
                        # If we've found enough jobs, we can consider it a success
                        if jobs_found == 25:  # Use exact comparison to prevent multiple notifications
                            logger.info(f"Found {jobs_found} jobs, which is sufficient")
                            try:
                                yield f"data: {json.dumps({'status': 'sufficient', 'message': f'Found {jobs_found} jobs matching your profile'})}\n\n"
                            except Exception as e:
                                logger.error(f"Error sending sufficient notification: {str(e)}")
                    except asyncio.TimeoutError:
                        # Check time since last job was found
                        time_since_last_job = (datetime.now() - last_job_time).total_seconds()
                        
                        # Send a keepalive ping with progress updates
                        if time_since_last_job > 30:
                            # Still searching but taking a while
                            yield f"data: {json.dumps({'status': 'searching', 'message': f'Still searching for jobs matching your profile (found {jobs_found} so far)...', 'progress': 'Deep scanning job websites for optimal matches...', 'primary_keyword': primary_search_keyword if primary_search_keyword else None})}\n\n"
                        else:
                            # Normal progress update with rotating messages
                            progress_messages = [
                                "Scanning job listings...",
                                "Analyzing job requirements...",
                                "Matching skills to openings...",
                                "Evaluating job compatibility...",
                                "Filtering for best matches...",
                                "Calculating AI match scores...",
                                "Finding ideal career opportunities..."
                            ]
                            # Pick a progress message based on time
                            progress_idx = int(time_since_last_job) % len(progress_messages)
                            progress_message = progress_messages[progress_idx]
                            
                            yield f"data: {json.dumps({'status': 'searching', 'message': f'Found {jobs_found} jobs so far...', 'progress': progress_message, 'primary_keyword': primary_search_keyword if primary_search_keyword else None})}\n\n"
                except Exception as e:
                    logger.error(f"Error while waiting for jobs: {str(e)}")
                    break
            
            # Send completion message based on results
            if search_error:
                logger.error(f"Job search completed with error: {search_error}")
                yield f"data: {json.dumps({'status': 'error', 'message': f'Search encountered an error: {search_error}',  'total': jobs_found})}\n\n"
            else:
                if jobs_found > 0:
                    logger.info(f"Job search completed successfully with {jobs_found} jobs")
                    yield f"data: {json.dumps({'status': 'completed', 'message': 'Job search completed successfully', 'total': jobs_found, 'primary_keyword': primary_search_keyword if primary_search_keyword else None})}\n\n"
                else:
                    logger.info("Job search completed but found no jobs")
                    yield f"data: {json.dumps({'status': 'completed', 'message': 'Job search completed but no matches found', 'total': 0,'primary_keyword': primary_search_keyword if primary_search_keyword else None})}\n\n"
        
        except Exception as e:
            logger.error(f"Error in job search generator: {str(e)}")
            try:
                yield f"data: {json.dumps({'error': f'Job search error: {str(e)}'})}\n\n"
            except Exception as yield_error:
                logger.error(f"Failed to yield error message: {str(yield_error)}")
                # If we can't even yield the error, just return to avoid further ASGI issues
                return
    
    # Return the generator as a streaming response
    return EventSourceResponse(job_search_generator())

def get_match_quality_label(score: int) -> str:
    """Helper function to get a label for the match quality"""
    try:
        score_int = int(score)  # Convert to integer safely
        if score_int >= 90:
            return "excellent"
        elif score_int >= 75:
            return "good"
        elif score_int >= 60:
            return "moderate"
        else:
            return "low"
    except (ValueError, TypeError):
        return "unknown"  # Handle cases where score can't be converted to int

# Create a tailored CV for a job
@router.post("/documents/tailored-cv", response_model=TailoredCVResponse)
async def create_tailored_cv(request: TailoredCVRequest):
    """
    Create a tailored CV for a specific job, optimizing it based on the job requirements.
    """
    try:
        doc_id = request.doc_id
        job_id = request.job_id
        
        logger.info(f"Creating tailored CV for document {doc_id} and job {job_id}")
        
        # First check if tailored CV already exists
        existing_cv = db.get_tailored_cv(doc_id, job_id)
        if existing_cv:
            logger.info(f"Found existing tailored CV for document {doc_id} and job {job_id}")
            return {
                "success": True,
                "doc_id": doc_id,
                "job_id": job_id,
                "job_title": existing_cv.get("job_title"),
                "company": existing_cv.get("company"),
                "content": existing_cv.get("content")
            }
        
        # Get the document from the database
        document = db.get_document(doc_id)
        if not document:
            raise HTTPException(status_code=404, detail=f"Document with ID {doc_id} not found")
            
        # Get document analysis (keywords)
        doc_analysis = db.get_document_keywords(doc_id)
        if not doc_analysis:
            raise HTTPException(
                status_code=400, 
                detail="Document hasn't been analyzed yet. Please analyze it first."
            )
            
        # Get job details
        job = None
        jobs = db.get_document_jobs(doc_id)
        for j in jobs:
            if j.get("id") == job_id or j.get("job_id") == job_id:
                job = j
                break
                
        if not job:
            raise HTTPException(
                status_code=404,
                detail=f"Job with ID {job_id} not found for document {doc_id}"
            )
        
        # Get document content
        cv_content = document.get("content", "")
        
        # If document is a file, try to get content from file_path
        if not cv_content and document.get("file_path"):
            # Get document content from file
            file_path = FilePath("static") / document.get("file_path")
            if not file_path.exists():
                raise HTTPException(
                    status_code=404, 
                    detail=f"Document file not found"
                )
                
            # Get text content from file using DocumentParser
            try:
                parser = DocumentParser()
                cv_content = parser.parse_document(str(file_path))
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to parse document content: {str(e)}"
                )
        
        # Use Perplexity API to create a tailored CV
        result = perplexity_api.create_tailored_cv(cv_content, doc_analysis, job, doc_id)
        
        if not result:
            raise HTTPException(
                status_code=500,
                detail="Failed to create tailored CV"
            )
            
        return {
            "success": True,
            "doc_id": doc_id,
            "job_id": job_id,
            "job_title": result.get("job_title"),
            "company": result.get("company"),
            "content": result.get("content")
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating tailored CV: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating tailored CV: {str(e)}")

# Get tailored CV for a specific job
@router.get("/documents/{doc_id}/tailored-cv/{job_id}", response_model=TailoredCVResponse)
async def get_tailored_cv(doc_id: str = Path(..., title="Document ID"), job_id: str = Path(..., title="Job ID")):
    """
    Get a tailored CV for a specific document and job
    """
    try:
        logger.info(f"Getting tailored CV for document {doc_id} and job {job_id}")
        
        # Check if document exists
        document = db.get_document(doc_id)
        if not document:
            raise HTTPException(status_code=404, detail=f"Document with ID {doc_id} not found")
        
        # Get tailored CV
        cv = db.get_tailored_cv(doc_id, job_id)
        
        if not cv:
            return {
                "success": False,
                "doc_id": doc_id,
                "job_id": job_id,
                "message": "No tailored CV found for this job"
            }
            
        return {
            "success": True,
            "doc_id": doc_id,
            "job_id": job_id,
            "job_title": cv.get("job_title"),
            "company": cv.get("company"),
            "content": cv.get("content")
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting tailored CV: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting tailored CV: {str(e)}")

# Create tailored CV for a specific job - additional endpoint to match the frontend URL
@router.post("/documents/{doc_id}/jobs/{job_id}/create-cv", response_model=TailoredCVResponse)
async def create_cv_for_job(doc_id: str = Path(..., title="Document ID"), job_id: str = Path(..., title="Job ID")):
    """
    Create a tailored CV for a specific job, optimizing it based on the job requirements.
    This endpoint is an alternative to /documents/tailored-cv to match the frontend URL pattern.
    """
    # Create a request object to reuse existing functionality
    request = TailoredCVRequest(doc_id=doc_id, job_id=job_id)
    
    # Call the existing function to create a tailored CV
    return await create_tailored_cv(request)