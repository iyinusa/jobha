import logging
from typing import Dict, List, Any
from pdfminer.high_level import extract_text as pdfminer_extract_text
from pdfminer.layout import LAParams
import traceback
import os

logger = logging.getLogger(__name__)

class PDFParser:
    """
    Parser for PDF documents using pdfminer.six
    """
    
    async def extract_text(self, file_path: str) -> str:
        """
        Extract text from a PDF file
        
        Args:
            file_path (str): Path to the PDF file
            
        Returns:
            str: Extracted text content
        """
        try:
            # Check if file exists and is readable
            if not os.path.exists(file_path):
                raise ValueError(f"PDF file not found at path: {file_path}")
            
            if os.path.getsize(file_path) == 0:
                raise ValueError("PDF file is empty (0 bytes)")
                
            logger.info(f"Starting PDF extraction for file: {file_path}")
            
            # Configure PDF extraction parameters for better text extraction
            laparams = LAParams(
                line_margin=0.5,
                word_margin=0.1,
                char_margin=2.0,
                boxes_flow=0.5
            )
            
            # Extract text from PDF file
            text = pdfminer_extract_text(
                file_path,
                laparams=laparams
            )
            
            if not text or text.isspace():
                logger.warning(f"Extracted empty text from PDF file: {file_path}")
                return "No extractable text found in the PDF document. The PDF might be scanned or image-based."
            
            # Clean up extracted text
            cleaned_text = self._clean_text(text)
            
            logger.info(f"Successfully extracted {len(cleaned_text)} characters from PDF")
            return cleaned_text
            
        except Exception as e:
            error_details = traceback.format_exc()
            logger.error(f"Error extracting text from PDF: {str(e)}\n{error_details}")
            raise ValueError(f"Failed to parse PDF file: {str(e)}")
            
    def _clean_text(self, text: str) -> str:
        """
        Clean up extracted text from PDF
        
        Args:
            text (str): Raw text extracted from PDF
            
        Returns:
            str: Cleaned text
        """
        # Replace multiple newlines with a single newline
        import re
        text = re.sub(r'\n{3,}', '\n\n', text)
        
        # Remove odd characters that might appear from PDF extraction
        text = re.sub(r'[^\x00-\x7F]+', ' ', text)
        
        # Remove extra spaces
        text = re.sub(r'\s+', ' ', text)
        
        # Fix line breaks
        text = text.replace(' \n', '\n')
        text = re.sub(r'(\S)\n(\S)', r'\1 \2', text)
        
        return text.strip()