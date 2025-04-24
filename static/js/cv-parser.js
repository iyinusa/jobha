// CV Parser Module
// This module handles CV/Resume files upload and displays the server-parsed content

// Main CV Parser object
const CVParser = {
    // Process an uploaded file
    async parseFile(file, skipParsing = true) {
        try {
            // Validate file before uploading
            if (!file) {
                throw new Error('Please select a file to upload');
            }
            
            // Check file size (max 10MB)
            const maxSize = 10 * 1024 * 1024; // 10MB
            if (file.size > maxSize) {
                throw new Error('File size exceeds the maximum allowed (10MB)');
            }
            
            // Check file type
            const allowedTypes = ['.pdf', '.doc', '.docx', '.txt'];
            const fileExt = '.' + file.name.split('.').pop().toLowerCase();
            if (!allowedTypes.includes(fileExt)) {
                throw new Error('Unsupported file type. Please upload PDF, DOC, DOCX, or TXT files.');
            }
            
            // Show loading state
            window.DB.showLoadingState('Uploading your document...');
            
            // Create form data for file upload
            const formData = new FormData();
            formData.append('file', file);
            formData.append('skip_parsing', skipParsing);
            
            // Send file to server for processing
            const response = await fetch('/api/cv/upload', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            // Handle error
            if (!result.success) {
                // Show specific error from server or default message
                let errorMessage = result.message || 'Failed to upload document';
                
                // Make error messages more user-friendly
                if (errorMessage.includes('PDF file not found')) {
                    errorMessage = 'There was a problem reading your PDF file.';
                } else if (errorMessage.includes('empty') || errorMessage.includes('0 bytes')) {
                    errorMessage = 'The uploaded file appears to be empty.';
                } else if (errorMessage.includes('password protected')) {
                    errorMessage = 'The PDF file is password protected. Please remove the password and try again.';
                } else if (errorMessage.includes('contains only images')) {
                    errorMessage = 'This PDF contains only images and no text that can be extracted.';
                }
                
                throw new Error(errorMessage);
            }
            
            // Return success result
            return result;
            
        } catch (error) {
            console.error('Error parsing file:', error);
            throw error;
        }
    },
    
    // Get document by ID
    async getDocument(docId) {
        try {
            // Ensure docId is a string
            docId = String(docId);
            console.log(`Fetching document with ID: ${docId}`);
            
            const response = await fetch(`/api/cv/documents/${docId}`);
            if (!response.ok) {
                const errorText = await response.text();
                let errorMsg = 'Failed to fetch document';
                
                try {
                    // Try to parse as JSON
                    const errorData = JSON.parse(errorText);
                    errorMsg = errorData.detail || errorData.message || errorMsg;
                } catch (e) {
                    // If not JSON, use text as is or default message
                    errorMsg = errorText || `Server error: ${response.status}`;
                }
                
                console.error('Document fetch failed:', errorMsg);
                throw new Error(errorMsg);
            }
            
            const document = await response.json();
            console.log('Document fetched successfully:', document.id);
            return document;
        } catch (error) {
            console.error('Error fetching document:', error);
            throw error;
        }
    },
    
    // List all documents
    async listDocuments() {
        try {
            console.log('Fetching documents list from server...');
            const response = await fetch('/api/cv/documents');
            
            if (!response.ok) {
                const errorText = await response.text();
                let errorMsg = 'Failed to fetch documents';
                
                try {
                    // Try to parse as JSON
                    const errorData = JSON.parse(errorText);
                    errorMsg = errorData.detail || errorData.message || errorMsg;
                } catch (e) {
                    // If not JSON, use text as is or default message
                    errorMsg = errorText || `Server error: ${response.status}`;
                }
                
                console.error('Document list fetch failed:', errorMsg);
                throw new Error(errorMsg);
            }
            
            const result = await response.json();
            console.log(`Successfully fetched ${result.documents?.length || 0} documents`);
            
            // Handle the response format
            if (result.success) {
                return result.documents || [];
            }
            return [];
        } catch (error) {
            console.error('Error fetching documents:', error);
            throw error;
        }
    },
    
    // Delete a document
    async deleteDocument(docId) {
        try {
            const response = await fetch(`/api/cv/documents/${docId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to delete document');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error deleting document:', error);
            throw error;
        }
    },
    
    // Rename a document
    async renameDocument(docId, newName) {
        try {
            const response = await fetch(`/api/cv/documents/${docId}/rename`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ new_name: newName })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to rename document');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error renaming document:', error);
            throw error;
        }
    },
    
    // List all files
    async listFiles() {
        try {
            const response = await fetch('/api/cv/documents/all-files');
            if (!response.ok) {
                throw new Error('Failed to fetch files');
            }
            const result = await response.json();
            
            // Handle the response format
            if (result.success) {
                return result.files || [];
            }
            return [];
        } catch (error) {
            console.error('Error fetching files:', error);
            throw error;
        }
    }
};

// Make the parser available globally
window.CVParser = CVParser;