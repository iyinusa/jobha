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

// Function to load PDF document with PDF.js
function loadPdfDocument(pdfUrl, container) {
    console.log('Loading PDF with PDF.js:', pdfUrl);
    
    try {
        // Clear any existing content
        container.innerHTML = '';
        
        // Create PDF viewer container
        const viewerContainer = document.createElement('div');
        viewerContainer.className = 'pdf-viewer-container';
        
        // Add toolbar for PDF controls
        const toolbar = document.createElement('div');
        toolbar.className = 'pdf-controls d-flex justify-content-between align-items-center';
        toolbar.innerHTML = `
            <div class="pdf-navigation">
                <button class="btn btn-sm btn-outline-primary me-2" id="prev-page">
                    <i class="fas fa-chevron-left"></i> Previous
                </button>
                <button class="btn btn-sm btn-outline-primary" id="next-page">
                    Next <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            <div class="pdf-page-info">
                Page <span id="page-num">1</span> of <span id="page-count">?</span>
            </div>
            <div class="pdf-zoom">
                <button class="btn btn-sm btn-outline-secondary me-2" id="zoom-out">
                    <i class="fas fa-search-minus"></i>
                </button>
                <button class="btn btn-sm btn-outline-secondary" id="zoom-in">
                    <i class="fas fa-search-plus"></i>
                </button>
            </div>
        `;
        
        // Add container for PDF pages
        const pagesContainer = document.createElement('div');
        pagesContainer.className = 'pdf-pages-container';
        
        // Add elements to the main container
        viewerContainer.appendChild(toolbar);
        viewerContainer.appendChild(pagesContainer);
        container.appendChild(viewerContainer);
        
        // PDF.js setup
        const pdfjsLib = window.pdfjsLib;
        
        // Set worker source path
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/static/js/vendors/pdf.worker.min.js';
        
        // Variables to track state
        let pdfDoc = null;
        let pageNum = 1;
        let pdfScale = 1.0;
        let pdfPages = [];
        
        // Load PDF document
        pdfjsLib.getDocument(pdfUrl).promise.then(pdf => {
            pdfDoc = pdf;
            const numPages = pdf.numPages;
            document.getElementById('page-count').textContent = numPages;
            
            // Initial render of the first page
            renderPage(pageNum);
            
            // Add event listeners to controls
            document.getElementById('prev-page').addEventListener('click', () => {
                if (pageNum <= 1) return;
                pageNum--;
                showPage(pageNum);
            });
            
            document.getElementById('next-page').addEventListener('click', () => {
                if (pageNum >= pdfDoc.numPages) return;
                pageNum++;
                showPage(pageNum);
            });
            
            document.getElementById('zoom-in').addEventListener('click', () => {
                pdfScale = Math.min(pdfScale + 0.2, 3.0);
                renderPage(pageNum, true);
            });
            
            document.getElementById('zoom-out').addEventListener('click', () => {
                pdfScale = Math.max(pdfScale - 0.2, 0.5);
                renderPage(pageNum, true);
            });
            
        }).catch(error => {
            console.error('Error loading PDF with PDF.js:', error);
            container.innerHTML = `
                <div class="alert alert-danger m-3">
                    <i class="fas fa-exclamation-circle me-2"></i> 
                    Failed to load PDF with enhanced viewer: ${error.message}
                </div>
                <div class="text-center mb-3">
                    <button class="btn btn-primary back-to-native" id="back-to-native-view">
                        <i class="fas fa-file-pdf me-2"></i> Switch to Native View
                    </button>
                </div>
            `;
            
            // Add event listener to switch back to native view
            const backButton = document.getElementById('back-to-native-view');
            if (backButton) {
                backButton.addEventListener('click', () => {
                    // Find and click the native view button
                    const nativeViewBtn = document.querySelector('button[data-mode="native"]');
                    if (nativeViewBtn) nativeViewBtn.click();
                });
            }
        });
        
        // Function to show a specific page
        function showPage(num) {
            document.getElementById('page-num').textContent = num;
            
            // Scroll the page into view
            if (pdfPages[num - 1]) {
                pdfPages[num - 1].scrollIntoView({behavior: 'smooth'});
            } else {
                renderPage(num);
            }
        }
        
        // Function to render a PDF page
        function renderPage(num, isZoomChange = false) {
            // Show loading spinner while rendering
            if (!isZoomChange) {
                pagesContainer.innerHTML = `
                    <div class="text-center my-5">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading page ${num}...</span>
                        </div>
                        <p class="mt-2">Loading page ${num}...</p>
                    </div>
                `;
            }
            
            // If we're changing zoom, clear existing pages
            if (isZoomChange) {
                pagesContainer.innerHTML = '';
                pdfPages = [];
                
                // Render all pages with the new scale
                for (let i = 1; i <= pdfDoc.numPages; i++) {
                    renderSinglePage(i);
                }
            } else {
                // Only render the requested page and subsequent pages
                for (let i = num; i <= Math.min(num + 2, pdfDoc.numPages); i++) {
                    if (!pdfPages[i - 1]) {
                        renderSinglePage(i);
                    }
                }
            }
            
            // Update page number display
            document.getElementById('page-num').textContent = num;
        }
        
        // Function to render a single PDF page
        function renderSinglePage(pageNumber) {
            pdfDoc.getPage(pageNumber).then(page => {
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                
                const viewport = page.getViewport({ scale: pdfScale });
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                const pageContainer = document.createElement('div');
                pageContainer.className = 'pdf-page';
                pageContainer.dataset.pageNumber = pageNumber;
                pageContainer.appendChild(canvas);
                
                pagesContainer.appendChild(pageContainer);
                pdfPages[pageNumber - 1] = pageContainer;
                
                // Render the page content
                page.render({
                    canvasContext: context,
                    viewport: viewport
                });
                
                // Add page number
                const pageInfo = document.createElement('div');
                pageInfo.className = 'page-number';
                pageInfo.textContent = pageNumber;
                pageContainer.appendChild(pageInfo);
            });
        }
    } catch (error) {
        console.error('PDF.js loading error:', error);
        container.innerHTML = `
            <div class="alert alert-danger m-3">
                <i class="fas fa-exclamation-circle me-2"></i> 
                Error initializing PDF viewer: ${error.message || 'Unknown error'}
            </div>
        `;
    }
}

// Make the function available globally
window.loadPdfDocument = loadPdfDocument;

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