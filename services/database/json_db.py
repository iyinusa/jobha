import json
import os
import uuid
from datetime import datetime
from pathlib import Path
import logging
from typing import Dict, List, Optional, Any, Union

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Path to the db.json file - using the correct path at project root
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DB_FILE = BASE_DIR / "data" / "db.json"

# Ensure data directory exists
os.makedirs(BASE_DIR / "data", exist_ok=True)

class JsonDatabase:
    """Simple JSON file-based database for document management"""
    
    def __init__(self):
        self.db_file = DB_FILE
        logger.info(f"Database file path: {self.db_file}")
        self.ensure_db_exists()
    
    def ensure_db_exists(self):
        """Make sure the database file exists with proper structure"""
        if not self.db_file.exists():
            # Create parent directories if they don't exist
            self.db_file.parent.mkdir(parents=True, exist_ok=True)
            
            # Create initial DB structure
            with open(self.db_file, 'w') as f:
                json.dump({"documents": [], "documents_keywords": []}, f)
            
            logger.info(f"Created new database file at {self.db_file}")
        else:
            # Check if existing DB has documents_keywords array, add if not
            try:
                with open(self.db_file, 'r') as f:
                    db_content = json.load(f)
                    
                if "documents_keywords" not in db_content:
                    db_content["documents_keywords"] = []
                    with open(self.db_file, 'w') as f:
                        json.dump(db_content, f, indent=2)
                    logger.info(f"Added documents_keywords array to existing database")
            except Exception as e:
                logger.error(f"Error checking or updating database structure: {str(e)}")
                
            logger.info(f"Using existing database file at {self.db_file}")
    
    def read_db(self) -> Dict:
        """Read the full database contents"""
        try:
            with open(self.db_file, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            logger.error(f"JSON decode error in {self.db_file}. Creating fresh database.")
            # If file is corrupted, create a new one
            with open(self.db_file, 'w') as f:
                empty_db = {"documents": [], "documents_keywords": []}
                json.dump(empty_db, f)
            return empty_db
        except Exception as e:
            logger.error(f"Error reading database: {str(e)}")
            return {"documents": [], "documents_keywords": []}
    
    def write_db(self, data: Dict) -> bool:
        """Write data to the database file"""
        try:
            # Create temp file first to avoid corruption
            temp_file = self.db_file.with_suffix('.tmp')
            with open(temp_file, 'w') as f:
                json.dump(data, f, indent=2)
                
            # Replace the original file with the temp file
            if temp_file.exists():
                if self.db_file.exists():
                    self.db_file.unlink()  # Remove original file
                temp_file.rename(self.db_file)
            return True
        except Exception as e:
            logger.error(f"Error writing to database: {str(e)}")
            return False
    
    # Document management methods
    def list_documents(self) -> List[Dict]:
        """Get all documents from the database, sorted by updated_at timestamp (newest first)"""
        db = self.read_db()
        documents = db.get("documents", [])
        
        # Sort documents by updated_at timestamp in descending order (newest first)
        try:
            sorted_documents = sorted(
                documents,
                key=lambda x: datetime.fromisoformat(x.get('updated_at', '1970-01-01T00:00:00')),
                reverse=True
            )
            return sorted_documents
        except Exception as e:
            logger.error(f"Error sorting documents: {str(e)}")
            # Fall back to unsorted documents if sorting fails
            return documents
    
    def get_document(self, doc_id: Union[str, int]) -> Optional[Dict]:
        """Get a document by ID"""
        doc_id = str(doc_id)  # Ensure ID is a string for comparison
        documents = self.list_documents()
        for doc in documents:
            if str(doc.get("id")) == doc_id:
                return doc
        return None
    
    def add_document(self, document: Dict) -> Dict:
        """Add a new document to the database"""
        db = self.read_db()
        documents = db.get("documents", [])
        
        # If no ID provided, generate one
        if "id" not in document:
            document["id"] = str(uuid.uuid4())
            
        # Add creation/update timestamps
        now = datetime.now().isoformat()
        document["created_at"] = now
        document["updated_at"] = now
        
        documents.append(document)
        db["documents"] = documents
        self.write_db(db)
        
        return document
    
    def update_document(self, doc_id: Union[str, int], updates: Dict) -> Optional[Dict]:
        """Update an existing document"""
        doc_id = str(doc_id)
        db = self.read_db()
        documents = db.get("documents", [])
        
        for i, doc in enumerate(documents):
            if str(doc.get("id")) == doc_id:
                # Update the document
                documents[i].update(updates)
                
                # Update the timestamp
                documents[i]["updated_at"] = datetime.now().isoformat()
                
                # Write changes
                db["documents"] = documents
                self.write_db(db)
                
                return documents[i]
        
        return None  # Document not found
    
    def rename_document(self, doc_id: Union[str, int], new_name: str) -> Optional[Dict]:
        """Rename a document"""
        return self.update_document(doc_id, {"name": new_name})
    
    def delete_document(self, doc_id: Union[str, int]) -> bool:
        """Delete a document by ID"""
        doc_id = str(doc_id)
        db = self.read_db()
        documents = db.get("documents", [])
        
        initial_length = len(documents)
        documents = [doc for doc in documents if str(doc.get("id")) != doc_id]
        
        if len(documents) < initial_length:
            db["documents"] = documents
            # Also delete any associated keywords for this document
            self.delete_document_keywords(doc_id)
            self.write_db(db)
            return True
        
        return False  # Document not found
    
    # Document keywords management methods
    def save_document_keywords(self, doc_id: str, keywords_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Save extracted keywords/information for a document.
        If keywords already exist for this document, update them.
        """
        doc_id = str(doc_id)
        db = self.read_db()
        keywords_list = db.get("documents_keywords", [])
        
        # Check if keywords already exist for this document
        existing_index = None
        for i, item in enumerate(keywords_list):
            if str(item.get("document_id")) == doc_id:
                existing_index = i
                break
        
        # Add document ID and timestamp to the data
        keywords_data["document_id"] = doc_id
        keywords_data["updated_at"] = datetime.now().isoformat()
        
        # Update or append
        if existing_index is not None:
            keywords_list[existing_index] = keywords_data
        else:
            keywords_data["created_at"] = datetime.now().isoformat()
            keywords_list.append(keywords_data)
        
        # Save changes
        db["documents_keywords"] = keywords_list
        self.write_db(db)
        
        return keywords_data
    
    def get_document_keywords(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """
        Get keywords/information extracted from a document.
        """
        doc_id = str(doc_id)
        db = self.read_db()
        keywords_list = db.get("documents_keywords", [])
        
        for item in keywords_list:
            if str(item.get("document_id")) == doc_id:
                return item
        
        return None  # No keywords found for this document
    
    def delete_document_keywords(self, doc_id: str) -> bool:
        """
        Delete keywords associated with a document.
        """
        doc_id = str(doc_id)
        db = self.read_db()
        keywords_list = db.get("documents_keywords", [])
        
        initial_length = len(keywords_list)
        keywords_list = [item for item in keywords_list if str(item.get("document_id")) != doc_id]
        
        if len(keywords_list) < initial_length:
            db["documents_keywords"] = keywords_list
            self.write_db(db)
            return True
        
        return False  # No keywords found for this document

# Create a singleton instance of the database
db = JsonDatabase()