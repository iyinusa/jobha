from fastapi import APIRouter, UploadFile, HTTPException, File, Form, Path, Body, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Union
import os
import uuid
import json
import logging
from pathlib import Path as FilePath
from datetime import datetime

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
        search_results = perplexity_api.search_jobs(unique_keywords, doc_id)
        
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