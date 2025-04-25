from fastapi import APIRouter, UploadFile, HTTPException, File, Form, Path, Body
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
    category: str  # Document category (cv or cover-letter)
    type: str      # File format type (pdf, word, text)
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
        content = parser.parse_document(str(file_path))
        
        if not content:
            # Delete the file if parsing failed
            os.remove(file_path)
            # Also delete original file if it exists
            if original_doc_path and os.path.exists(original_doc_path):
                os.remove(original_doc_path)
            raise HTTPException(status_code=400, detail="Could not parse document")
            
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