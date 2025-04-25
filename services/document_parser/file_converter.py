import os
import logging
import tempfile
import shutil
from pathlib import Path
from docx2pdf import convert
import uuid
import subprocess

logger = logging.getLogger(__name__)

class FileConverter:
    """
    Utility class for converting between different file formats
    """
    
    @staticmethod
    async def docx_to_pdf(source_path: str, output_dir: str = None) -> str:
        """
        Convert a DOCX file to PDF format
        
        Args:
            source_path (str): Path to the source DOCX file
            output_dir (str, optional): Directory to save the PDF file. 
                                        If None, uses the same directory as source.
        
        Returns:
            str: Path to the converted PDF file
        """
        try:
            source_path = Path(source_path)
            
            # Validate input file exists and has correct extension
            if not source_path.exists():
                raise FileNotFoundError(f"Source file not found: {source_path}")
                
            if source_path.suffix.lower() not in ['.docx', '.doc']:
                raise ValueError(f"Invalid file format. Expected .docx or .doc, got {source_path.suffix}")
            
            # Determine output path
            if output_dir:
                output_dir = Path(output_dir)
                output_dir.mkdir(parents=True, exist_ok=True)
                # Generate a unique filename for the PDF
                output_path = output_dir / f"{uuid.uuid4()}.pdf"
            else:
                # Use same directory but change extension to .pdf
                output_path = source_path.with_suffix('.pdf')
                
            logger.info(f"Converting {source_path} to PDF: {output_path}")
            
            try:
                # Try using docx2pdf first
                convert(str(source_path), str(output_path))
            except Exception as docx2pdf_error:
                # If docx2pdf fails, try using LibreOffice directly
                logger.warning(f"docx2pdf conversion failed: {str(docx2pdf_error)}. Trying LibreOffice fallback...")
                
                result = FileConverter._convert_with_libreoffice(str(source_path), str(output_path))
                if not result:
                    raise RuntimeError("Both docx2pdf and LibreOffice conversion methods failed")
            
            # Verify the output file was created
            if not output_path.exists():
                raise RuntimeError(f"Conversion failed. Output file not found: {output_path}")
                
            logger.info(f"Conversion successful: {output_path}")
            return str(output_path)
            
        except Exception as e:
            logger.error(f"Error converting DOCX to PDF: {str(e)}", exc_info=True)
            raise
            
    @staticmethod
    def _convert_with_libreoffice(source_path: str, output_path: str) -> bool:
        """
        Convert a document to PDF using LibreOffice command line
        
        Args:
            source_path (str): Path to the source document
            output_path (str): Path where the PDF should be saved
            
        Returns:
            bool: True if conversion was successful, False otherwise
        """
        try:
            source_dir = os.path.dirname(os.path.abspath(source_path))
            output_dir = os.path.dirname(os.path.abspath(output_path))
            
            # Run LibreOffice in headless mode to convert the document
            cmd = [
                'libreoffice', 
                '--headless', 
                '--convert-to', 'pdf', 
                '--outdir', output_dir,
                source_path
            ]
            
            # Execute the command
            process = subprocess.run(
                cmd, 
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            # The output filename from LibreOffice will be the same as input but with .pdf extension
            source_filename = os.path.basename(source_path)
            source_name = os.path.splitext(source_filename)[0]
            libreoffice_output = os.path.join(output_dir, f"{source_name}.pdf")
            
            # If we have a specific target name, rename the file
            if os.path.basename(output_path) != f"{source_name}.pdf" and os.path.exists(libreoffice_output):
                shutil.move(libreoffice_output, output_path)
                
            return os.path.exists(output_path)
        
        except subprocess.SubprocessError as e:
            logger.error(f"LibreOffice conversion failed: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"Error in LibreOffice conversion: {str(e)}")
            return False