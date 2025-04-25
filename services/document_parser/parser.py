import os
import logging
from pathlib import Path
from fastapi import UploadFile
import tempfile
import shutil
from typing import Dict, Any, Optional
import traceback

from services.document_parser.pdf_parser import PDFParser
from services.document_parser.docx_parser import DocxParser
from services.document_parser.text_parser import TextParser
from services.document_parser.section_extractor import extract_sections, generate_html
from services.document_parser.section_extractor import SECTION_PATTERNS

logger = logging.getLogger(__name__)

class DocumentParser:
    """
    Main document parser that handles different file types and delegates to specific parsers
    """
    
    def __init__(self):
        self.pdf_parser = PDFParser()
        self.docx_parser = DocxParser()
        self.text_parser = TextParser()
    
    async def parse_file(self, file: UploadFile) -> Dict[str, Any]:
        """
        Parse an uploaded file and extract structured content
        
        Args:
            file (UploadFile): The uploaded file object
            
        Returns:
            Dict[str, Any]: Structured content with sections
        """
        temp_path = None
        try:
            # Get file extension
            if file is None:
                return {'success': False, 'error': 'No file provided'}
                
            if not file.filename:
                return {'success': False, 'error': 'File has no name'}
                
            filename = file.filename
            file_ext = Path(filename).suffix.lower()
            
            logger.info(f"Processing file upload: {filename} (type: {file_ext})")
            
            # Create a temporary file to store the upload
            with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as temp_file:
                # Reset file position to beginning just in case
                await file.seek(0)
                
                # Copy uploaded file to temporary file
                content = await file.read()
                if not content or len(content) == 0:
                    return {'success': False, 'error': 'Uploaded file is empty'}
                    
                logger.info(f"File size: {len(content)} bytes")
                temp_file.write(content)
                temp_path = temp_file.name
                
                # Reset uploaded file position for potential future use
                await file.seek(0)
            
            try:
                # Extract text based on file type
                logger.info(f"Starting text extraction for {file_ext} file")
                
                if file_ext in ['.pdf']:
                    text = await self.pdf_parser.extract_text(temp_path)
                elif file_ext in ['.doc', '.docx']:
                    text = await self.docx_parser.extract_text(temp_path)
                elif file_ext in ['.txt']:
                    text = await self.text_parser.extract_text(temp_path)
                else:
                    raise ValueError(f"Unsupported file type: {file_ext}")
                
                if not text or text.isspace():
                    return {
                        'success': False, 
                        'error': 'Could not extract text from the document. It may be empty, password protected, or contains only images.'
                    }
                    
                logger.info(f"Successfully extracted {len(text)} characters of text")
                
                # Extract sections from text
                logger.info("Extracting document sections")
                sections = extract_sections(text)
                
                # Generate HTML from sections
                html_content = generate_html(filename, sections, text)
                
                # Check if name exists in sections
                name = Path(filename).stem.replace('_', ' ').replace('-', ' ')
                if sections.get('contact') and len(sections['contact']) > 0:
                    name = sections['contact'][0]
                
                # Create response with all data
                result = {
                    'success': True,
                    'filename': filename,
                    'name': name,
                    'sections': sections,
                    'raw_text': text,
                    'html_content': html_content
                }
                
                return result
                
            finally:
                # Clean up the temporary file
                if temp_path and os.path.exists(temp_path):
                    try:
                        os.unlink(temp_path)
                    except Exception as cleanup_error:
                        logger.warning(f"Failed to remove temp file {temp_path}: {cleanup_error}")
                
        except Exception as e:
            error_details = traceback.format_exc()
            logger.error(f"Error parsing document: {str(e)}\n{error_details}")
            
            # Clean up in case of exception too
            if temp_path and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except:
                    pass
                    
            return {
                'success': False,
                'error': f"Failed to process document: {str(e)}"
            }
    
    def parse_document(self, file_path: str) -> str:
        """
        Parse a document from file path and extract plain text content
        
        Args:
            file_path (str): Path to the document file
            
        Returns:
            str: Extracted text content or empty string if parsing fails
        """
        try:
            file_ext = Path(file_path).suffix.lower()
            
            logger.info(f"Processing document from path: {file_path} (type: {file_ext})")
            
            # Extract text based on file type
            if file_ext in ['.pdf']:
                # Use asyncio to run the async method in a synchronous context
                import asyncio
                text = asyncio.run(self.pdf_parser.extract_text(file_path))
            elif file_ext in ['.doc', '.docx']:
                text = asyncio.run(self.docx_parser.extract_text(file_path))
            elif file_ext in ['.txt']:
                text = asyncio.run(self.text_parser.extract_text(file_path))
            else:
                logger.error(f"Unsupported file type: {file_ext}")
                return ""
            
            if not text or text.isspace():
                logger.error("Extracted text is empty or contains only whitespace")
                return ""
                
            logger.info(f"Successfully extracted {len(text)} characters of text")
            return text
            
        except Exception as e:
            error_details = traceback.format_exc()
            logger.error(f"Error parsing document from path: {str(e)}\n{error_details}")
            return ""
    
    def get_section_patterns(self) -> Dict[str, list]:
        """
        Get the patterns used to identify sections
        
        Returns:
            Dict[str, list]: Dictionary mapping section names to their patterns
        """
        return SECTION_PATTERNS