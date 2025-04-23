// Document Database Module
// This file handles all database operations using Dexie.js for the document editor

// Initialize database module
const DB = {
    db: null,
    documentContainer: null,
    
    // Initialize the database and document container
    initializeDatabase() {
        // Create database
        this.db = new Dexie('JobhaDB');
        
        // Define schema
        this.db.version(1).stores({
            documents: '++id,name,type,content,created,modified'
        });
        
        // Set document container
        this.documentContainer = document.getElementById('document-container');
        
        // Load documents
        this.loadDocuments();
    },
    
    // Load all documents from database and display in the sidebar
    async loadDocuments() {
        try {
            // Get all documents sorted by most recently modified
            const documents = await this.db.documents.orderBy('modified').reverse().toArray();
            
            // Clear container
            if (this.documentContainer) {
                this.documentContainer.innerHTML = '';
                
                if (documents.length === 0) {
                    // Show empty state
                    this.showEmptyState();
                } else {
                    // Create document list items
                    documents.forEach(doc => {
                        const item = this.createDocumentListItem(doc);
                        this.documentContainer.appendChild(item);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading documents:', error);
            alert('Could not load your documents. Please refresh the page and try again.');
        }
    },
    
    // Create an empty state element
    showEmptyState() {
        const emptyState = document.createElement('div');
        emptyState.className = 'text-center p-4 empty-state';
        emptyState.innerHTML = `
            <div class="empty-state-icon mb-3">
                <i class="fas fa-file-alt fa-3x text-muted"></i>
            </div>
            <h5>No Documents Yet</h5>
            <p class="text-muted mb-4">Upload your CV or create a new document to get started.</p>
            <button class="btn btn-primary empty-state-upload-btn" id="empty-state-upload-btn">
                <i class="fas fa-upload me-2"></i> Upload CV
            </button>
        `;
        
        this.documentContainer.appendChild(emptyState);
        
        // Add event listener to the upload button
        const uploadBtn = document.getElementById('empty-state-upload-btn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                // Create file input dynamically
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = '.pdf,.doc,.docx,.txt';
                fileInput.style.display = 'none';
                fileInput.addEventListener('change', this.handleFileUpload.bind(this));
                document.body.appendChild(fileInput);
                fileInput.click();
                
                // Remove after selection
                fileInput.addEventListener('blur', function() {
                    document.body.removeChild(fileInput);
                });
            });
        }
    },
    
    // Create a list item for a document
    createDocumentListItem(doc) {
        const listItem = document.createElement('a');
        listItem.href = '#';
        listItem.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
        listItem.setAttribute('data-id', doc.id);
        listItem.setAttribute('data-type', doc.type);
        
        // Create document icon and name
        const docInfo = document.createElement('div');
        docInfo.className = 'd-flex align-items-center';
        
        // Choose icon based on document type
        const icon = document.createElement('i');
        if (doc.type === 'cv') {
            icon.className = 'fas fa-file-alt me-2 text-primary';
        } else {
            icon.className = 'fas fa-file-alt me-2 text-secondary';
        }
        
        // Document name
        const docName = document.createElement('span');
        docName.textContent = doc.name;
        
        docInfo.appendChild(icon);
        docInfo.appendChild(docName);
        
        // Document timestamp
        const timestamp = document.createElement('small');
        timestamp.className = 'text-muted';
        timestamp.textContent = this.formatDate(doc.modified);
        
        // Add elements to list item
        listItem.appendChild(docInfo);
        listItem.appendChild(timestamp);
        
        // Add event listeners
        listItem.addEventListener('click', (event) => {
            event.preventDefault();
            
            // Remove active class from all items
            const items = this.documentContainer.querySelectorAll('.list-group-item');
            items.forEach(item => item.classList.remove('active'));
            
            // Add active class to clicked item
            listItem.classList.add('active');
            
            // Load document
            this.loadDocumentById(doc.id);
        });
        
        // Add context menu event
        listItem.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            window.showContextMenu(event, doc);
        });
        
        return listItem;
    },
    
    // Format date for display
    formatDate(date) {
        const d = new Date(date);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    },
    
    // Load document by ID
    async loadDocumentById(id) {
        try {
            // Get document
            const doc = await this.db.documents.get(id);
            
            if (!doc) {
                alert('Document not found');
                return { success: false, message: 'Document not found' };
            }
            
            // Mark editor as having this document loaded
            const editorElement = document.querySelector('.editor-wrapper');
            if (editorElement) {
                editorElement.setAttribute('data-current-doc-id', doc.id);
            }
            
            // Get editor content elements
            const cvEditor = document.getElementById('cv-editor');
            const coverLetterEditor = document.getElementById('cover-letter-editor');
            
            // Activate appropriate tab based on document type
            if (doc.type === 'cv') {
                const tabLinks = document.querySelectorAll('.nav-link');
                tabLinks.forEach(link => {
                    if (link.getAttribute('href') === '#cv-tab') {
                        link.classList.add('active');
                    } else {
                        link.classList.remove('active');
                    }
                });
                
                const tabPanes = document.querySelectorAll('.tab-pane');
                tabPanes.forEach(pane => {
                    if (pane.id === 'cv-tab') {
                        pane.classList.add('active', 'show');
                    } else {
                        pane.classList.remove('active', 'show');
                    }
                });
                
                // Set content
                if (cvEditor) {
                    cvEditor.innerHTML = doc.content;
                }
            } else if (doc.type === 'cover-letter') {
                const tabLinks = document.querySelectorAll('.nav-link');
                tabLinks.forEach(link => {
                    if (link.getAttribute('href') === '#cover-letter-tab') {
                        link.classList.add('active');
                    } else {
                        link.classList.remove('active');
                    }
                });
                
                const tabPanes = document.querySelectorAll('.tab-pane');
                tabPanes.forEach(pane => {
                    if (pane.id === 'cover-letter-tab') {
                        pane.classList.add('active', 'show');
                    } else {
                        pane.classList.remove('active', 'show');
                    }
                });
                
                // Set content
                if (coverLetterEditor) {
                    coverLetterEditor.innerHTML = doc.content;
                }
            }
            
            return { success: true };
        } catch (error) {
            console.error('Error loading document:', error);
            alert('Could not load document. Please try again.');
            return { success: false, message: error.message };
        }
    },
    
    // Save document content
    async saveDocumentContent(id, content) {
        try {
            // Get document
            const doc = await this.db.documents.get(id);
            
            if (!doc) {
                return { success: false, message: 'Document not found' };
            }
            
            // Update content and modified timestamp
            const updated = await this.db.documents.update(id, {
                content: content,
                modified: new Date()
            });
            
            if (updated) {
                return { success: true };
            } else {
                return { success: false, message: 'Failed to update document' };
            }
        } catch (error) {
            console.error('Error saving document:', error);
            return { success: false, message: error.message };
        }
    },
    
    // Rename document
    async renameDocument(id, newName) {
        try {
            // Get document
            const doc = await this.db.documents.get(id);
            
            if (!doc) {
                return { success: false, message: 'Document not found' };
            }
            
            // Update name and modified timestamp
            const updated = await this.db.documents.update(id, {
                name: newName,
                modified: new Date()
            });
            
            if (updated) {
                return { success: true };
            } else {
                return { success: false, message: 'Failed to rename document' };
            }
        } catch (error) {
            console.error('Error renaming document:', error);
            return { success: false, message: error.message };
        }
    },
    
    // Delete document
    async deleteDocument(id) {
        try {
            // Delete document
            await this.db.documents.delete(id);
            return { success: true };
        } catch (error) {
            console.error('Error deleting document:', error);
            return { success: false, message: error.message };
        }
    },
    
    // Handle file upload
    async handleFileUpload(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;
            
            // Show loading indicator
            this.showLoadingState('Parsing your CV...');
            
            // Get file name without extension as document name
            const fileName = file.name.split('.')[0];
            
            // Parse content using the CV Parser
            const content = await window.CVParser.parseFile(file);
            
            // Create document in database
            const docId = await this.db.documents.add({
                name: fileName,
                type: 'cv',  // Set type to CV for uploaded documents
                content: content,
                created: new Date(),
                modified: new Date()
            });
            
            // Reload document list
            await this.loadDocuments();
            
            // Load the new document
            await this.loadDocumentById(docId);
            
            // Hide loading indicator
            this.hideLoadingState();
            
            // Highlight the new document in the list
            const newItem = this.documentContainer.querySelector(`[data-id="${docId}"]`);
            if (newItem) {
                newItem.classList.add('active');
            }
            
            // Show success message
            this.showToast('Success', 'CV uploaded and parsed successfully!');
            
        } catch (error) {
            console.error('Error handling file upload:', error);
            alert(`Error uploading CV: ${error.message}`);
            // Hide loading indicator
            this.hideLoadingState();
        }
    },
    
    // Show loading state
    showLoadingState(message = 'Loading...') {
        // Create loading overlay if it doesn't exist
        let loadingOverlay = document.getElementById('loading-overlay');
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'loading-overlay';
            loadingOverlay.className = 'position-fixed w-100 h-100 d-flex align-items-center justify-content-center bg-white bg-opacity-75';
            loadingOverlay.style.top = '0';
            loadingOverlay.style.left = '0';
            loadingOverlay.style.zIndex = '9999';
            
            loadingOverlay.innerHTML = `
                <div class="text-center">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="mt-2" id="loading-message">${message}</p>
                </div>
            `;
            
            document.body.appendChild(loadingOverlay);
        } else {
            // Update message if overlay exists
            document.getElementById('loading-message').textContent = message;
            loadingOverlay.style.display = 'flex';
        }
    },
    
    // Hide loading state
    hideLoadingState() {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    },
    
    // Show toast notification
    showToast(title, message) {
        // Create toast container if it doesn't exist
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
            toastContainer.style.zIndex = '1080';
            document.body.appendChild(toastContainer);
        }
        
        // Create toast
        const toastId = `toast-${Date.now()}`;
        const toastEl = document.createElement('div');
        toastEl.id = toastId;
        toastEl.className = 'toast';
        toastEl.role = 'alert';
        toastEl.setAttribute('aria-live', 'assertive');
        toastEl.setAttribute('aria-atomic', 'true');
        
        // Toast content
        toastEl.innerHTML = `
            <div class="toast-header">
                <strong class="me-auto">${title}</strong>
                <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        `;
        
        // Add to container
        toastContainer.appendChild(toastEl);
        
        // Initialize and show toast
        const toast = new bootstrap.Toast(toastEl, {
            autohide: true,
            delay: 5000
        });
        toast.show();
        
        // Remove from DOM after hiding
        toastEl.addEventListener('hidden.bs.toast', function() {
            toastEl.remove();
        });
    }
};

// Make DB available globally
window.DB = DB;