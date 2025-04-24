import logging
from typing import Dict, List, Any
import aiofiles

logger = logging.getLogger(__name__)

class TextParser:
    """
    Parser for plain text documents
    """
    
    async def extract_text(self, file_path: str) -> str:
        """
        Extract text from a plain text file
        
        Args:
            file_path (str): Path to the text file
            
        Returns:
            str: Extracted text content
        """
        try:
            # Open and read the text file
            async with aiofiles.open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                text = await f.read()
            
            # Basic cleaning
            text = text.replace('\r\n', '\n')
            text = text.replace('\r', '\n')
            
            # Remove excess whitespace
            lines = [line.strip() for line in text.split('\n')]
            cleaned_text = '\n'.join(line for line in lines if line)
            
            return cleaned_text
            
        except Exception as e:
            logger.error(f"Error extracting text from text file: {str(e)}", exc_info=True)
            raise ValueError(f"Failed to parse text file: {str(e)}")