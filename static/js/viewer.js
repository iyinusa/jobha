// Document Viewer JavaScript
// This file handles document viewing operations

// Initialize viewer once DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Attach event listeners for document viewing
    initializeViewer();
    
    // Attach download button handler
    attachDownloadHandler();
});

// Function to load files from the uploads directory
async function loadUploadedFiles() {
    try {
        console.log('Loading files from uploads directory...');
        
        // Fetch the files from the server using the CV parser
        const files = await window.CVParser.listFiles();
        
        if (files && files.length > 0) {
            console.log(`Found ${files.length} files in uploads directory`);
            
            // Add them to the document list using the DB module
            window.DB.appendFileDocuments(files);
        } else {
            console.log('No files found in uploads directory');
        }
    } catch (error) {
        console.error('Error loading uploaded files:', error);
    }
}

// Make function available globally
window.loadUploadedFiles = loadUploadedFiles;

// Initialize viewer
function initializeViewer() {
    // Add any viewer-specific initialization here
    console.log('Document viewer initialized');
}

// Helper function to get file extension based on doc type
function getFileExtension(type) {
    switch (type) {
        case 'pdf':
            return '.pdf';
        case 'word':
            return '.docx';
        case 'text':
            return '.txt';
        default:
            return '';
    }
}

// Download document based on type
function downloadDocument(doc) {
    try {
        window.DB.showLoadingState('Preparing download...');
        
        // Check if document has a file path (direct file download)
        if (doc.file_path) {
            // For files stored on server, create a link to download it
            const filePath = doc.file_path.startsWith('uploads/') ? doc.file_path : `uploads/${doc.file_path}`;
            const fileUrl = `/static/${filePath}`;
            
            // Create download link
            const a = document.createElement('a');
            a.href = fileUrl;
            a.download = `${doc.name}${getFileExtension(doc.type)}`;
            
            // Trigger download
            document.body.appendChild(a);
            
            setTimeout(() => {
                a.click();
                document.body.removeChild(a);
                window.DB.hideLoadingState();
                window.DB.showToast('Success', 'Download started');
            }, 300);
            
            return;
        }
        
        // For documents with content but no file_path (HTML content)
        if (doc.content) {
            // Create download link
            const a = document.createElement('a');
            const blob = new Blob([doc.content], {type: 'text/html'});
            a.href = URL.createObjectURL(blob);
            a.download = `${doc.name || 'document'}${getFileExtension(doc.type)}`;
            
            // Trigger download
            document.body.appendChild(a);
            
            setTimeout(() => {
                a.click();
                document.body.removeChild(a);
                
                // Clean up
                URL.revokeObjectURL(a.href);
                
                window.DB.hideLoadingState();
                window.DB.showToast('Success', 'Document downloaded successfully');
            }, 300);
            
            return;
        }
        
        // If document has no content and no file_path
        window.DB.hideLoadingState();
        window.DB.showToast('Error', 'No downloadable content available');
    } catch (error) {
        console.error('Error downloading document:', error);
        window.DB.hideLoadingState();
        window.DB.showToast('Error', 'Failed to download file: ' + error.message);
    }
}

// Attach download button handler
function attachDownloadHandler() {
    const downloadBtn = document.getElementById('download-document-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async function() {
            // Get current document ID from viewer
            const viewerElement = document.querySelector('.viewer-wrapper');
            if (!viewerElement) return;
            
            // Check if we have a document ID or file path
            const docId = viewerElement.getAttribute('data-current-doc-id');
            const filePath = viewerElement.getAttribute('data-file-path');
            
            if (docId) {
                // Get document from database
                try {
                    const doc = await window.DB.getDocumentById(docId);
                    if (doc) {
                        // Use downloadDocument function
                        downloadDocument(doc);
                    } else {
                        window.DB.showToast('Error', 'Could not locate document for download');
                    }
                } catch (error) {
                    console.error('Error downloading document:', error);
                    window.DB.showToast('Error', `Download failed: ${error.message}`);
                }
            } else if (filePath) {
                // Direct file download
                const fileUrl = `/static/${filePath}`;
                
                // Create a temporary link for download
                const a = document.createElement('a');
                a.href = fileUrl;
                a.download = fileUrl.split('/').pop(); // Extract filename
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                
                window.DB.showToast('Success', 'Download started');
            } else {
                window.DB.showToast('Error', 'No document is currently selected');
            }
        });
    }
}