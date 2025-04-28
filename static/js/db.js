// Document Database Module
// This file handles document operations with server APIs for the document viewer

// Initialize database module
const DB = {
    documentContainer: null,
    jobContainer: null,

    // Initialize the document container
    initializeDatabase() {
        console.log("Initializing document database...");
        // Set document container
        this.documentContainer = document.getElementById('document-container');
        this.jobContainer = document.getElementById('job-container');

        // Load parsed documents
        this.loadDocuments()
            .then(() => {
                // Then load uploaded files
                if (typeof loadUploadedFiles === 'function') {
                    console.log("Loading uploaded files after documents...");
                    loadUploadedFiles();
                } else {
                    console.log("loadUploadedFiles function not available");
                }
            })
            .catch(error => {
                console.error("Error during initialization:", error);
            });

        // Set up event listener for Find Jobs button
        const findJobsBtn = document.getElementById('find-jobs-btn');
        if (findJobsBtn) {
            findJobsBtn.addEventListener('click', this.findMatchingJobs.bind(this));
        }
    },

    // Load all documents from server and display in the sidebar
    async loadDocuments() {
        try {
            console.log('Fetching documents from server...');
            // Show subtle loading indicator in the document list
            if (this.documentContainer) {
                const loadingEl = document.createElement('div');
                loadingEl.className = 'text-center p-3';
                loadingEl.innerHTML = '<div class="spinner-border spinner-border-sm text-primary" role="status"></div><span class="ms-2">Loading documents...</span>';
                this.documentContainer.innerHTML = '';
                this.documentContainer.appendChild(loadingEl);
            }

            // Get all documents from server API
            const documents = await window.CVParser.listDocuments();
            console.log(`Loaded ${documents ? documents.length : 0} documents from server`);

            // Clear container
            if (this.documentContainer) {
                this.documentContainer.innerHTML = '';

                // Always show documents container, even if empty
                if (!documents || documents.length === 0) {
                    // Show minimal container without the empty state message
                    const emptyContainer = document.createElement('div');
                    emptyContainer.className = 'p-3 text-center';
                    emptyContainer.innerHTML = `
                        <div class="text-muted mb-3">No documents found</div>
                        <button class="btn btn-primary btn-sm" id="empty-state-upload-btn">
                            <i class="fas fa-upload me-2"></i> Upload CV
                        </button>
                    `;
                    this.documentContainer.appendChild(emptyContainer);

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
                            fileInput.addEventListener('blur', function () {
                                document.body.removeChild(fileInput);
                            });
                        });
                    }
                } else {
                    // Documents are already sorted by updated_at (newest first) from the backend

                    // Get current timestamp to identify recently updated documents
                    const now = new Date();

                    // Create document list items
                    documents.forEach((doc, index) => {
                        const item = this.createDocumentListItem(doc, index === 0);

                        // Add "new" badge for documents created within the last hour
                        if (doc.created_at) {
                            const createdAt = new Date(doc.created_at);
                            const timeDiff = now - createdAt;
                            const oneHour = 60 * 60 * 1000; // milliseconds

                            if (timeDiff < oneHour) {
                                const badge = document.createElement('span');
                                badge.className = 'badge bg-success ms-2';
                                badge.textContent = 'New';

                                // Find the document name element and append the badge
                                const docName = item.querySelector('span');
                                if (docName) {
                                    docName.appendChild(badge);
                                }
                            }
                        }

                        this.documentContainer.appendChild(item);
                    });

                    // Auto-select first document if none is currently selected
                    if (documents.length > 0) {
                        const activeItem = this.documentContainer.querySelector('.list-group-item.active');
                        if (!activeItem) {
                            const firstItem = this.documentContainer.querySelector('.list-group-item');
                            if (firstItem) {
                                firstItem.classList.add('active');

                                // Get the document ID and load it
                                const docId = firstItem.getAttribute('data-id');
                                if (docId) {
                                    // Load with a small delay to allow UI to render
                                    setTimeout(() => this.loadDocumentById(docId), 100);
                                }
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error loading documents:', error);

            // Clear the loading indicator if present
            if (this.documentContainer) {
                const loadingEl = this.documentContainer.querySelector('.spinner-border');
                if (loadingEl) {
                    this.documentContainer.innerHTML = '';
                }

                // Add error message and retry button
                const errorEl = document.createElement('div');
                errorEl.className = 'alert alert-danger m-3';
                errorEl.innerHTML = `
                    <p><i class="fas fa-exclamation-circle me-2"></i>Could not load documents from server</p>
                    <p class="small">${error.message || 'Unknown error'}</p>
                    <button class="btn btn-sm btn-danger mt-2" id="retry-load-documents">
                        <i class="fas fa-sync me-2"></i> Retry
                    </button>
                `;
                this.documentContainer.appendChild(errorEl);

                // Add event listener to retry button
                const retryBtn = document.getElementById('retry-load-documents');
                if (retryBtn) {
                    retryBtn.addEventListener('click', () => {
                        this.loadDocuments();
                    });
                }
            }

            // Show toast with error message
            this.showToast('Error', 'Could not load documents from server. ' + (error.message || ''));
        }
    },

    // Add file documents to the document list
    appendFileDocuments(files) {
        if (!files || files.length === 0) {
            console.log("No files to append");
            return;
        }

        console.log(`Appending ${files.length} files to document list`);

        // Process each file
        files.forEach(file => {
            // Create a file document object
            const fileDoc = {
                id: file.path, // Use path as ID
                name: this.getCleanFilename(file.name),
                path: file.path,
                file_path: file.path, // Add file_path property to match API document format
                size: file.size,
                modified: file.modified,
                type: this.getDocumentType(file.name),
                category: 'cv', // Default category
                isFileDocument: true // Flag to indicate this is a direct file document
            };

            // Add to document list using the existing document list item creation function
            const item = this.createDocumentListItem(fileDoc);
            if (this.documentContainer) {
                this.documentContainer.appendChild(item);
            }
        });
    },

    // Get clean filename (without extension)
    getCleanFilename(filename) {
        const lastDotIndex = filename.lastIndexOf('.');
        if (lastDotIndex === -1) return filename;
        return filename.substring(0, lastDotIndex);
    },

    // Determine document type from filename
    getDocumentType(filename) {
        const ext = filename.toLowerCase().split('.').pop();

        switch (ext) {
            case 'pdf':
                return 'pdf';
            case 'doc':
            case 'docx':
                return 'word';
            case 'txt':
                return 'text';
            default:
                return 'other';
        }
    },

    // Get file icon based on type
    getFileIcon(type) {
        switch (type) {
            case 'pdf':
                return 'fas fa-file-pdf text-danger';
            case 'word':
                return 'fas fa-file-word text-primary';
            case 'text':
                return 'fas fa-file-alt text-secondary';
            case 'cv':
                return 'fas fa-file-alt text-primary';
            case 'cover-letter':
                return 'fas fa-envelope text-success';
            default:
                return 'fas fa-file text-muted';
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
                fileInput.addEventListener('blur', function () {
                    document.body.removeChild(fileInput);
                });
            });
        }
    },

    // Create a list item for a document
    createDocumentListItem(doc, isRecent = false) {
        const listItem = document.createElement('a');
        listItem.href = '#';
        listItem.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';

        // Highlight recent document with subtle background
        if (isRecent) {
            listItem.classList.add('bg-light');
        }

        // Ensure we're using the string version of the ID for consistency
        const docId = doc.id.toString();
        listItem.setAttribute('data-id', docId);

        // Store both category and type as data attributes
        listItem.setAttribute('data-category', doc.category || 'cv');    // Document category (cv or cover-letter)
        listItem.setAttribute('data-type', doc.type || 'pdf');          // File format type (pdf, word, text)

        // Create document icon and name
        const docInfo = document.createElement('div');
        docInfo.className = 'd-flex align-items-center';

        // Choose icon based on document category and file type
        const icon = document.createElement('i');

        // Determine icon class based on both category and file type
        let iconClass = '';

        if (doc.category === 'cv') {
            // For CV documents, show file format icon
            switch (doc.type) {
                case 'pdf':
                    iconClass = 'fas fa-file-pdf text-danger';
                    break;
                case 'word':
                    iconClass = 'fas fa-file-word text-primary';
                    break;
                case 'text':
                    iconClass = 'fas fa-file-alt text-secondary';
                    break;
                default:
                    iconClass = 'fas fa-file-alt text-primary'; // Default CV icon
            }
        } else if (doc.category === 'cover-letter') {
            // For Cover Letters, show file format icon with cover letter color
            switch (doc.type) {
                case 'pdf':
                    iconClass = 'fas fa-file-pdf text-success';
                    break;
                case 'word':
                    iconClass = 'fas fa-file-word text-success';
                    break;
                case 'text':
                    iconClass = 'fas fa-file-alt text-success';
                    break;
                default:
                    iconClass = 'fas fa-envelope text-success'; // Default cover letter icon
            }
        } else {
            // Fallback to file format type if category is missing
            iconClass = this.getFileIcon(doc.type || 'pdf');
        }

        icon.className = iconClass;
        icon.style.marginRight = '12px';

        // Document name - ensure it has a valid value
        const docName = document.createElement('span');
        docName.textContent = doc.name || 'Untitled Document';

        // Add formatted date as a badge for recent documents
        if (doc.updated_at) {
            const updatedDate = new Date(doc.updated_at);
            const now = new Date();
            const timeDiff = now - updatedDate;
            const oneDay = 24 * 60 * 60 * 1000; // milliseconds

            // Show timestamp for documents updated within the last day
            if (timeDiff < oneDay) {
                const timestamp = document.createElement('small');
                timestamp.className = 'text-muted ms-2';

                // Format time based on how recent it is
                let timeText;
                const minutesDiff = Math.floor(timeDiff / (60 * 1000));
                const hoursDiff = Math.floor(timeDiff / (60 * 60 * 1000));

                if (minutesDiff < 1) {
                    timeText = 'just now';
                } else if (minutesDiff < 60) {
                    timeText = `${minutesDiff}m ago`;
                } else {
                    timeText = `${hoursDiff}h ago`;
                }

                timestamp.textContent = timeText;
                docName.appendChild(timestamp);
            }
        }

        docInfo.appendChild(icon);
        docInfo.appendChild(docName);

        // Document actions (3-dots menu)
        const actionsBtn = document.createElement('button');
        actionsBtn.type = 'button';
        actionsBtn.className = 'btn btn-sm text-muted border-0 p-0';
        actionsBtn.innerHTML = '<i class="fas fa-ellipsis-v"></i>';

        // Add elements to list item
        listItem.appendChild(docInfo);
        listItem.appendChild(actionsBtn);

        // Add event listeners
        listItem.addEventListener('click', (event) => {
            // Only handle clicks that aren't on the actions button
            if (event.target !== actionsBtn && !actionsBtn.contains(event.target)) {
                event.preventDefault();

                // Remove active class from all items
                const items = this.documentContainer.querySelectorAll('.list-group-item');
                items.forEach(item => item.classList.remove('active'));

                // Add active class to clicked item
                listItem.classList.add('active');

                // Load document
                this.loadDocumentById(docId);
            }
        });

        // Add actions button click
        actionsBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            window.showContextMenu(event, doc);
        });

        return listItem;
    },

    // Format date for display
    formatDate(date) {
        const d = new Date(date);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    },

    // Get document by ID (helper for download)
    async getDocumentById(id) {
        try {
            return await window.CVParser.getDocument(id);
        } catch (error) {
            console.error('Error getting document:', error);
            return null;
        }
    },

    // Load document by ID
    async loadDocumentById(id) {
        try {
            // Show subtle loading indicator
            this.showLoadingState('Loading document...');

            // Ensure ID is handled as a string - the backend uses string IDs
            id = String(id);

            // Get document from server API
            let doc;
            try {
                doc = await window.CVParser.getDocument(id);
            } catch (fetchError) {
                console.error('Error fetching document:', fetchError);
                this.hideLoadingState();
                this.showToast('Error', 'Could not load document: ' + (fetchError.message || 'Network error'));
                return { success: false, message: fetchError.message || 'Network error' };
            }

            if (!doc) {
                this.hideLoadingState();
                this.showToast('Error', 'Document not found. Please try again.');
                return { success: false, message: 'Document not found' };
            }

            // Mark viewer as having this document loaded
            const viewerElement = document.querySelector('.viewer-wrapper');
            if (viewerElement) {
                viewerElement.setAttribute('data-current-doc-id', doc.id);
                viewerElement.removeAttribute('data-file-path'); // Clear any previous file path
            }

            // Update download button to show the document name
            const downloadBtn = document.getElementById('download-document-btn');
            if (downloadBtn) {
                downloadBtn.innerHTML = `<i class="fas fa-download me-1"></i> Download`;
                downloadBtn.classList.remove('btn-outline-primary');
                downloadBtn.classList.add('btn-primary');
            }

            // Load jobs for this document (if any)
            if (doc.category === 'cv' && this.jobContainer) {
                console.log(`Loading jobs for document ID: ${doc.id}`);
                // Load jobs asynchronously without blocking document loading
                setTimeout(() => {
                    this.loadJobsForDocument(doc.id).catch(error => {
                        console.error('Failed to load jobs for document:', error);
                        // Don't show error toast since this is automatic background loading
                    });
                }, 500);
            }

            // Check if we should use direct file viewing instead of parsed content
            if (doc.file_path) {
                // We have a file path, so load the document directly
                const fileDoc = {
                    id: doc.id,
                    name: doc.name,
                    path: doc.file_path,
                    category: doc.category || 'cv',     // Document category (cv or cover-letter)
                    type: doc.type || 'pdf',           // File format type (pdf, word, text)
                    modified: doc.modified,
                    isFileDocument: true
                };

                // Use the existing file document loader
                return this.loadFileDocument(fileDoc);
            }

            // Otherwise continue with regular document display
            // Get viewer content elements
            const cvViewer = document.getElementById('cv-viewer');
            const coverLetterViewer = document.getElementById('cover-letter-viewer');

            if (!cvViewer || !coverLetterViewer) {
                console.error('Document viewer elements not found');
                this.hideLoadingState();
                this.showToast('Error', 'Document viewer not available. Please refresh the page.');
                return { success: false, message: 'Viewer elements not found' };
            }

            // Activate appropriate tab based on document category
            if (doc.category === 'cv') {
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

                // Set content with smooth transition
                if (cvViewer) {
                    // Remove empty state if it exists
                    const emptyState = cvViewer.querySelector('.empty-viewer-state');
                    if (emptyState) {
                        emptyState.style.opacity = '0';
                        setTimeout(() => {
                            if (emptyState.parentNode === cvViewer) {
                                cvViewer.removeChild(emptyState);
                            }
                        }, 300);
                    }

                    // Create a professional document container
                    let contentContainer = cvViewer.querySelector('.document-content:not(.empty-viewer-state)');

                    if (!contentContainer) {
                        // If no content container exists, create a new one with fade-in effect
                        contentContainer = document.createElement('div');
                        contentContainer.className = 'document-content';
                        contentContainer.style.opacity = '0';
                        contentContainer.style.transition = 'opacity 0.3s ease';
                        cvViewer.innerHTML = '';
                        cvViewer.appendChild(contentContainer);

                        // Trigger reflow for transition to work
                        contentContainer.offsetHeight;
                    }

                    // Add document metadata section
                    const metadataHtml = `
                        <div class="document-metadata mb-4">
                            <h1>${doc.name}</h1>
                            <div class="document-info text-muted small d-flex justify-content-between border-bottom pb-3 mb-4">
                                <span><i class="far fa-calendar me-1"></i> Last updated: ${this.formatDate(doc.updated_at || doc.modified || new Date())}</span>
                                <span><i class="fas fa-file-alt me-1"></i> Document type: Resume/CV (${this.getFileTypeLabel(doc.type)})</span>
                            </div>
                        </div>
                    `;

                    // Create metadata container
                    const metadataContainer = document.createElement('div');
                    metadataContainer.className = 'document-metadata-container';
                    metadataContainer.innerHTML = metadataHtml;

                    // Create document content container that preserves original formatting
                    const originalContentContainer = document.createElement('div');
                    originalContentContainer.className = 'original-document-content';

                    // Check if content exists and is not null/undefined
                    if (doc.content) {
                        originalContentContainer.innerHTML = doc.content;
                    } else {
                        originalContentContainer.innerHTML = '<div class="alert alert-warning">No content available for this document.</div>';
                    }

                    // Clear container and append both sections
                    contentContainer.innerHTML = '';
                    contentContainer.appendChild(metadataContainer);
                    contentContainer.appendChild(originalContentContainer);

                    // Trigger fade in
                    setTimeout(() => {
                        contentContainer.style.opacity = '1';
                    }, 50);
                }

            } else if (doc.category === 'cover-letter') {
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

                // Set content with smooth transition
                if (coverLetterViewer) {
                    // Remove empty state if it exists
                    const emptyState = coverLetterViewer.querySelector('.empty-viewer-state');
                    if (emptyState) {
                        emptyState.style.opacity = '0';
                        setTimeout(() => {
                            if (emptyState.parentNode === coverLetterViewer) {
                                coverLetterViewer.removeChild(emptyState);
                            }
                        }, 300);
                    }

                    // Create a professional document container
                    let contentContainer = coverLetterViewer.querySelector('.document-content:not(.empty-viewer-state)');

                    if (!contentContainer) {
                        // If no content container exists, create a new one with fade-in effect
                        contentContainer = document.createElement('div');
                        contentContainer.className = 'document-content';
                        contentContainer.style.opacity = '0';
                        contentContainer.style.transition = 'opacity 0.3s ease';
                        coverLetterViewer.innerHTML = '';
                        coverLetterViewer.appendChild(contentContainer);

                        // Trigger reflow for transition to work
                        contentContainer.offsetHeight;
                    }

                    // Add document metadata section
                    const metadataHtml = `
                        <div class="document-metadata mb-4">
                            <h1>${doc.name}</h1>
                            <div class="document-info text-muted small d-flex justify-content-between border-bottom pb-3 mb-4">
                                <span><i class="far fa-calendar me-1"></i> Last updated: ${this.formatDate(doc.updated_at || new Date())}</span>
                                <span><i class="fas fa-envelope me-1"></i> Document type: Cover Letter (${this.getFileTypeLabel(doc.type)})</span>
                            </div>
                        </div>
                    `;

                    // Create metadata container
                    const metadataContainer = document.createElement('div');
                    metadataContainer.className = 'document-metadata-container';
                    metadataContainer.innerHTML = metadataHtml;

                    // Create document content container that preserves original formatting
                    const originalContentContainer = document.createElement('div');
                    originalContentContainer.className = 'original-document-content';

                    // Check if content exists and is not null/undefined
                    if (doc.content) {
                        originalContentContainer.innerHTML = doc.content;
                    } else {
                        originalContentContainer.innerHTML = '<div class="alert alert-warning">No content available for this document.</div>';
                    }

                    // Clear container and append both sections
                    contentContainer.innerHTML = '';
                    contentContainer.appendChild(metadataContainer);
                    contentContainer.appendChild(originalContentContainer);

                    // Trigger fade in
                    setTimeout(() => {
                        contentContainer.style.opacity = '1';
                    }, 50);
                }
            } else {
                // Generic document type, default to CV tab
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

                // Render as generic document
                if (cvViewer) {
                    // Similar setup as CV but with generic type
                    const contentContainer = document.createElement('div');
                    contentContainer.className = 'document-content';
                    contentContainer.style.opacity = '0';
                    contentContainer.style.transition = 'opacity 0.3s ease';
                    cvViewer.innerHTML = '';
                    cvViewer.appendChild(contentContainer);

                    // Add document metadata section
                    const metadataHtml = `
                        <div class="document-metadata mb-4">
                            <h1>${doc.name}</h1>
                            <div class="document-info text-muted small d-flex justify-content-between border-bottom pb-3 mb-4">
                                <span><i class="far fa-calendar me-1"></i> Last updated: ${this.formatDate(doc.updated_at || doc.modified || new Date())}</span>
                                <span><i class="fas fa-file me-1"></i> Document type: ${this.getFileTypeLabel(doc.type) || 'Unknown'}</span>
                            </div>
                        </div>
                    `;

                    const metadataContainer = document.createElement('div');
                    metadataContainer.className = 'document-metadata-container';
                    metadataContainer.innerHTML = metadataHtml;

                    const originalContentContainer = document.createElement('div');
                    originalContentContainer.className = 'original-document-content';

                    if (doc.content) {
                        originalContentContainer.innerHTML = doc.content;
                    } else {
                        originalContentContainer.innerHTML = '<div class="alert alert-warning">No content available for this document.</div>';
                    }

                    contentContainer.appendChild(metadataContainer);
                    contentContainer.appendChild(originalContentContainer);

                    // Trigger fade in
                    setTimeout(() => {
                        contentContainer.style.opacity = '1';
                    }, 50);
                }
            }

            // Hide loading state
            this.hideLoadingState();

            // Log success to confirm the document was loaded
            console.log(`Document loaded successfully: ${doc.name} (ID: ${doc.id})`);

            return { success: true };
        } catch (error) {
            console.error('Error loading document:', error);
            this.hideLoadingState();
            this.showToast('Error', 'Could not load document: ' + (error.message || 'Unknown error'));
            return { success: false, message: error.message || 'Unknown error loading document' };
        }
    },

    // Find matching jobs based on active CV document
    async findMatchingJobs() {
        try {
            // Get the active document ID
            const activeDocItem = document.querySelector('.document-list .list-group-item.active');
            if (!activeDocItem) {
                this.showToast('Error', 'Please select a CV document first');
                return;
            }

            const docId = activeDocItem.getAttribute('data-id');
            const docCategory = activeDocItem.getAttribute('data-category');

            // Ensure we're using a CV document
            if (docCategory !== 'cv') {
                this.showToast('Error', 'Please select a CV/Resume document to find matching jobs');
                return;
            }

            // Show job search modal
            const jobSearchModal = new bootstrap.Modal(document.getElementById('jobSearchModal'));
            jobSearchModal.show();

            try {
                // Call the API to search for jobs (updated endpoint)
                const response = await fetch(`/api/cv/documents/${docId}/search-jobs`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });

                // Hide the modal regardless of result
                jobSearchModal.hide();

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || 'Job search failed');
                }

                const result = await response.json();

                if (result.success && result.jobs && result.jobs.length > 0) {
                    // Load the jobs into the job container
                    this.loadJobsForDocument(docId);
                    this.showToast('Success', `Found ${result.jobs_count} matching jobs!`);
                } else {
                    this.showToast('Info', result.message || 'No matching jobs found. Select CV and Click "AI Job Matching"');
                }
            } catch (error) {
                jobSearchModal.hide();
                console.error('Job search error:', error);
                this.showToast('Error', `Job search failed: ${error.message}`);
            }
        } catch (error) {
            console.error('Error finding matching jobs:', error);
            this.showToast('Error', `Job search failed: ${error.message}`);
        }
    },

    // Load jobs for a specific document
    async loadJobsForDocument(docId) {
        try {
            if (!this.jobContainer) {
                console.error('Job container element not found');
                return;
            }

            // Show loading indicator
            this.jobContainer.innerHTML = `
                <div class="text-center p-4">
                    <div class="spinner-border text-primary" role="status"></div>
                    <p class="mt-2">Loading matching jobs...</p>
                </div>
            `;

            // Fetch jobs for the document (updated endpoint)
            const response = await fetch(`/api/cv/documents/${docId}/jobs?limit=50`);

            if (!response.ok) {
                throw new Error('Failed to load jobs');
            }

            const result = await response.json();

            if (result.success && result.jobs && result.jobs.length > 0) {
                // Clear the container
                this.jobContainer.innerHTML = '';

                // Create and append job items
                result.jobs.forEach(job => {
                    const jobItem = this.createJobListItem(job);
                    this.jobContainer.appendChild(jobItem);
                });

                // Hide the no jobs message
                const noJobsMessage = document.getElementById('no-jobs-message');
                if (noJobsMessage) {
                    noJobsMessage.style.display = 'none';
                }
            } else {
                // Show no jobs message
                this.jobContainer.innerHTML = `
                    <div class="text-center p-4 text-muted" id="no-jobs-message">
                        <i class="fas fa-briefcase fa-2x mb-3 opacity-50"></i>
                        <p>No matching jobs found</p>
                        <p class="small">Select CV/Resume and Click "AI Job Matching"</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading jobs:', error);
            this.jobContainer.innerHTML = `
                <div class="alert alert-danger m-3">
                    <p><i class="fas fa-exclamation-circle me-2"></i>Failed to load jobs</p>
                    <p class="small">${error.message}</p>
                    <button class="btn btn-sm btn-danger mt-2" id="retry-load-jobs">
                        <i class="fas fa-sync me-2"></i> Retry
                    </button>
                </div>
            `;

            // Add retry button functionality
            const retryBtn = document.getElementById('retry-load-jobs');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    this.loadJobsForDocument(docId);
                });
            }
        }
    },

    // Create a list item for a job
    createJobListItem(job) {
        const listItem = document.createElement('a');
        listItem.href = '#';
        listItem.className = 'list-group-item list-group-item-action p-3 job-list-item';
        listItem.setAttribute('data-id', job.id || `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
        listItem.setAttribute('data-job', JSON.stringify(job));

        // Determine match badge class based on score
        let matchBadgeClass = 'match-badge-low';

        if (job.match_score >= 90) {
            matchBadgeClass = 'match-badge-high';
        } else if (job.match_score >= 75) {
            matchBadgeClass = 'match-badge-medium';
        } else if (job.match_score >= 60) {
            matchBadgeClass = 'match-badge-low';
        } else {
            matchBadgeClass = 'match-badge-poor';
        }

        // Format job location (show Remote prominently)
        const location = job.location ? job.location : 'Location not specified';
        const locationClass = location.toLowerCase().includes('remote') ? 'job-location-remote' : '';

        listItem.innerHTML = `
            <h6 class="mb-1 job-item-title">${job.title || 'Untitled Job'}</h6>
            <p class="mb-1 small job-item-company">${job.company || 'Unknown Company'}</p>
            <div class="d-flex justify-content-between align-items-center small job-item-meta">
                <span class="job-item-location ${locationClass}"><i class="fas fa-map-marker-alt me-1"></i> ${location}</span>
                <span class="badge ${matchBadgeClass}">${job.match_score || 0}% Match</span>
            </div>
        `;

        // Add click event to show job details
        listItem.addEventListener('click', (event) => {
            event.preventDefault();

            // Remove active class from all items
            const items = this.jobContainer.querySelectorAll('.list-group-item');
            items.forEach(item => item.classList.remove('active'));

            // Add active class to clicked item
            listItem.classList.add('active');

            // Show job details
            this.showJobDetails(job);
        });

        return listItem;
    },

    // Show job details in the viewer
    showJobDetails(job) {
        try {
            // Show the job tabs
            const jobTabs = document.querySelectorAll('.job-tab');
            jobTabs.forEach(tab => tab.classList.remove('d-none'));

            // Switch to job details tab
            const tabLinks = document.querySelectorAll('.nav-link');
            tabLinks.forEach(link => {
                if (link.getAttribute('href') === '#job-details-tab') {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });

            const tabPanes = document.querySelectorAll('.tab-pane');
            tabPanes.forEach(pane => {
                if (pane.id === 'job-details-tab') {
                    pane.classList.add('active', 'show');
                } else {
                    pane.classList.remove('active', 'show');
                }
            });

            // Display job details
            const jobDetailsContent = document.getElementById('job-details-content');
            if (jobDetailsContent) {
                // Format salary information
                const salary = job.salary ? job.salary : 'Not specified';

                // Format date posted
                let datePosted = 'Not specified';
                if (job.date_posted) {
                    try {
                        const date = new Date(job.date_posted);
                        if (!isNaN(date.getTime())) {
                            datePosted = date.toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                            });
                        }
                    } catch (e) {
                        datePosted = job.date_posted; // Use as-is if cannot parse
                    }
                }

                // Determine match badge class based on score
                let matchBadgeClass = 'match-badge-low';

                if (job.match_score >= 90) {
                    matchBadgeClass = 'match-badge-high';
                } else if (job.match_score >= 75) {
                    matchBadgeClass = 'match-badge-medium';
                } else if (job.match_score >= 60) {
                    matchBadgeClass = 'match-badge-low';
                } else {
                    matchBadgeClass = 'match-badge-poor';
                }

                // Format job location (show Remote prominently)
                const location = job.location ? job.location : 'Location not specified';
                const locationClass = location.toLowerCase().includes('remote') ? 'job-location-remote' : '';

                // Create HTML content for job details
                jobDetailsContent.innerHTML = `
                    <div class="job-details">
                        <div class="mb-4 job-details-header">
                            <h1 class="h3 job-details-title">${job.title || 'Untitled Job'}</h1>
                            <div class="d-flex flex-wrap align-items-center job-details-meta mb-3">
                                <span class="me-3 job-details-company"><i class="fas fa-building me-2"></i>${job.company || 'Unknown Company'}</span>
                                <span class="me-3 job-details-location ${locationClass}"><i class="fas fa-map-marker-alt me-2"></i>${location}</span>
                                <span class="me-3 job-details-date"><i class="fas fa-calendar me-2"></i>Posted: ${datePosted}</span>
                                <span class="job-details-salary"><i class="fas fa-money-bill-wave me-2"></i>Salary: ${salary}</span>
                            </div>

                            <div class="mb-3 job-details-actions">
                                <span class="badge ${matchBadgeClass} me-2">
                                    ${job.match_score || 0}% Match
                                </span>
                                <a href="${job.url || '#'}" target="_blank" class="btn btn-sm btn-primary job-apply-btn">
                                    <i class="fas fa-external-link-alt me-1"></i> Apply on Website
                                </a>
                            </div>
                        </div>

                        <div class="job-description mb-4">
                            <h4 class="h5 job-section-title">Job Description</h4>
                            <div class="job-section-content">
                                ${job.description || 'No description available.'}
                            </div>
                        </div>

                        <div class="job-requirements mb-4">
                            <h4 class="h5 job-section-title">Requirements</h4>
                            <div class="job-section-content">
                                ${job.requirements && job.requirements.length > 0 ?
                        `<ul class="job-requirements-list">
                                        ${job.requirements.map(req => `<li>${req}</li>`).join('')}
                                    </ul>` :
                        '<p>No specific requirements listed.</p>'
                    }
                            </div>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error displaying job details:', error);
            this.showToast('Error', 'Failed to display job details');
        }
    },

    // Helper method to trigger CV analysis in the background without blocking UI
    async _triggerCvAnalysisInBackground(docId) {
        try {
            console.log(`Triggering background CV analysis for document ${docId}`);

            // Show discreet notification that analysis is happening
            this.showToast('CV Analysis', 'Analyzing CV in background...');

            // Call the Perplexity API to analyze the CV
            const result = await window.CVParser.analyzeDocument(docId);

            if (result.success) {
                console.log('CV Analysis complete:', result.analysis);
                this.showToast('Analysis Complete', 'Your CV has been analyzed successfully.');
            }
        } catch (error) {
            console.error('Background CV analysis error:', error);
            // Don't show errors to user since this is a background process
        }
    },

    // Load a file document for viewing
    loadFileDocument(fileDoc) {
        try {
            console.log("Loading file document:", fileDoc); // Add debugging
            // Show loading state
            this.showLoadingState('Loading document...');

            // Mark viewer as having this document loaded
            const viewerElement = document.querySelector('.viewer-wrapper');
            if (viewerElement) {
                viewerElement.removeAttribute('data-current-doc-id'); // Clear any previous document ID
                viewerElement.setAttribute('data-file-path', fileDoc.path);
            }

            // Update download button to show the document name
            const downloadBtn = document.getElementById('download-document-btn');
            if (downloadBtn) {
                downloadBtn.innerHTML = `<i class="fas fa-download me-1"></i> Download "${fileDoc.name}"`;
                downloadBtn.classList.remove('btn-outline-primary');
                downloadBtn.classList.add('btn-primary');
            }

            // Default to CV tab
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

            // Get the viewer container
            const cvViewer = document.getElementById('cv-viewer');
            if (!cvViewer) {
                console.error('CV viewer element not found');
                this.hideLoadingState();
                this.showToast('Error', 'Document viewer not available. Please refresh the page.');
                return { success: false };
            }

            // Remove empty state if exists
            const emptyState = cvViewer.querySelector('.empty-viewer-state');
            if (emptyState) {
                emptyState.style.opacity = '0';
                setTimeout(() => {
                    if (emptyState.parentNode === cvViewer) {
                        cvViewer.removeChild(emptyState);
                    }
                }, 300);
            }

            // Create container with fade effect
            cvViewer.innerHTML = '';

            // File URL - fix the path construction
            // Make sure we have a proper path that starts with 'uploads/'
            let filePath = fileDoc.path;
            if (!filePath.startsWith('uploads/') && !filePath.startsWith('/uploads/')) {
                filePath = 'uploads/' + filePath;
            }
            const fileUrl = `/static/${filePath}`;
            console.log("File URL constructed:", fileUrl);

            // Get full absolute URL (needed for external viewers)
            const origin = window.location.origin;
            const absoluteFileUrl = origin + fileUrl;
            console.log("Absolute File URL:", absoluteFileUrl);

            // Modified date information
            const modifiedDate = fileDoc.modified ? this.formatDate(new Date(fileDoc.modified)) : this.formatDate(new Date());

            // Standard metadata header for all file types
            const metadataHeader = `
                <div class="document-metadata mb-4">
                    <h1>${fileDoc.name}</h1>
                    <div class="document-info text-muted small d-flex justify-content-between border-bottom pb-3 mb-4">
                        <span><i class="far fa-calendar me-1"></i> Last modified: ${modifiedDate}</span>
                        <span><i class="fas ${this.getFileTypeIcon(fileDoc.type)} me-1"></i> File type: ${this.getFileTypeLabel(fileDoc.type)}</span>
                    </div>
                </div>
            `;

            // Handle different file types
            switch (fileDoc.type) {
                case 'pdf':
                    // Create container for PDF with metadata
                    const pdfContainer = document.createElement('div');
                    pdfContainer.className = 'document-content-native p-0';
                    pdfContainer.style.opacity = '0';
                    pdfContainer.style.transition = 'opacity 0.3s ease';

                    // Add metadata section at the top
                    // const pdfMetadataSection = document.createElement('div');
                    // pdfMetadataSection.className = 'pdf-metadata p-4';
                    // pdfMetadataSection.innerHTML = metadataHeader;
                    // pdfContainer.appendChild(pdfMetadataSection);

                    // Create container for native PDF embedding
                    const nativePdfContainer = document.createElement('div');
                    nativePdfContainer.className = 'native-pdf-container';
                    nativePdfContainer.style.width = '100%';
                    nativePdfContainer.style.height = 'calc(100vh - 250px)';
                    nativePdfContainer.style.overflow = 'hidden';
                    nativePdfContainer.style.borderRadius = '8px';
                    nativePdfContainer.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.05)';

                    // Use iframe for direct PDF rendering - this ensures the document is displayed exactly as it is
                    const pdfIframe = document.createElement('iframe');
                    pdfIframe.className = 'native-pdf-iframe';
                    pdfIframe.src = fileUrl;
                    pdfIframe.style.width = '100%';
                    pdfIframe.style.height = '100%';
                    pdfIframe.style.border = 'none';
                    pdfIframe.setAttribute('title', fileDoc.name);
                    pdfIframe.setAttribute('loading', 'lazy');

                    // Fallback for browsers that don't support PDF embedding
                    const fallbackDiv = document.createElement('div');
                    fallbackDiv.className = 'pdf-fallback-container';
                    fallbackDiv.innerHTML = `
                        <div class="py-4 text-center">
                            <p>Your browser doesn't support embedded PDF viewing.</p>
                            <a href="${fileUrl}" class="btn btn-primary" target="_blank">
                                <i class="fas fa-external-link-alt me-2"></i> Open PDF in New Tab
                            </a>
                        </div>
                    `;

                    // Add PDF content
                    nativePdfContainer.appendChild(pdfIframe);
                    nativePdfContainer.appendChild(fallbackDiv);
                    pdfContainer.appendChild(nativePdfContainer);

                    // Add viewer options buttons below the PDF
                    const viewerOptions = document.createElement('div');
                    viewerOptions.className = 'viewer-options d-flex justify-content-between align-items-center bg-light p-3 mt-3 rounded';
                    viewerOptions.innerHTML = `
                        <div>
                            <button class="btn btn-sm btn-outline-primary toggle-view-mode" data-mode="native">
                                <i class="fas fa-file-pdf me-2"></i> Native View
                            </button>
                            <button class="btn btn-sm btn-outline-secondary ms-2 toggle-view-mode" data-mode="enhanced">
                                <i class="fas fa-edit me-2"></i> Enhanced View
                            </button>
                        </div>
                        <a href="${fileUrl}" class="btn btn-sm btn-outline-primary" target="_blank">
                            <i class="fas fa-external-link-alt me-2"></i> Open in New Tab
                        </a>
                    `;
                    pdfContainer.appendChild(viewerOptions);

                    // Append to the document
                    cvViewer.appendChild(pdfContainer);

                    // Fade in the container
                    setTimeout(() => {
                        pdfContainer.style.opacity = '1';
                        this.hideLoadingState();

                        // Add event listeners for view mode toggle
                        const toggleButtons = pdfContainer.querySelectorAll('.toggle-view-mode');
                        toggleButtons.forEach(btn => {
                            btn.addEventListener('click', (e) => {
                                const mode = e.currentTarget.getAttribute('data-mode');
                                if (mode === 'native') {
                                    // Switch to native view (already active)
                                    nativePdfContainer.style.display = 'block';
                                    const enhancedViewer = pdfContainer.querySelector('.pdf-viewer-element');
                                    if (enhancedViewer) enhancedViewer.style.display = 'none';

                                    // Update button states
                                    toggleButtons.forEach(b => {
                                        if (b.getAttribute('data-mode') === 'native') {
                                            b.classList.remove('btn-outline-primary');
                                            b.classList.add('btn-primary');
                                        } else {
                                            b.classList.remove('btn-primary');
                                            b.classList.add('btn-outline-secondary');
                                        }
                                    });
                                } else {
                                    // Switch to enhanced view with PDF.js
                                    let enhancedViewer = pdfContainer.querySelector('.pdf-viewer-element');
                                    if (!enhancedViewer) {
                                        enhancedViewer = document.createElement('div');
                                        enhancedViewer.className = 'pdf-viewer-element';
                                        enhancedViewer.style.height = 'calc(100vh - 250px)';
                                        enhancedViewer.style.display = 'none';
                                        nativePdfContainer.parentNode.insertBefore(enhancedViewer, nativePdfContainer.nextSibling);
                                        window.loadPdfDocument(fileUrl, enhancedViewer);
                                    }

                                    // Show enhanced view, hide native
                                    nativePdfContainer.style.display = 'none';
                                    enhancedViewer.style.display = 'block';

                                    // Update button states
                                    toggleButtons.forEach(b => {
                                        if (b.getAttribute('data-mode') === 'enhanced') {
                                            b.classList.remove('btn-outline-secondary');
                                            b.classList.add('btn-primary');
                                        } else {
                                            b.classList.remove('btn-primary');
                                            b.classList.add('btn-outline-primary');
                                        }
                                    });
                                }
                            });
                        });
                    }, 300);
                    break;

                case 'word':
                    // For Word documents, we offer multiple viewing options with fallbacks
                    const wordContainer = document.createElement('div');
                    wordContainer.className = 'document-content-native';
                    wordContainer.style.opacity = '0';
                    wordContainer.style.transition = 'opacity 0.3s ease';

                    // const wordViewerHeader = document.createElement('div');
                    // wordViewerHeader.className = 'pdf-metadata p-4';
                    // wordViewerHeader.innerHTML = metadataHeader;
                    // wordContainer.appendChild(wordViewerHeader);

                    // Create document viewer container
                    const docViewerContainer = document.createElement('div');
                    docViewerContainer.className = 'word-viewer-container';
                    docViewerContainer.style.width = '100%';
                    docViewerContainer.style.height = 'calc(100vh - 320px)';
                    docViewerContainer.style.border = '1px solid #e9ecef';
                    docViewerContainer.style.borderRadius = '8px';
                    docViewerContainer.style.overflow = 'hidden';

                    // Prepare URLs for different viewer options
                    const encodedUrl = encodeURIComponent(absoluteFileUrl);

                    // Microsoft Office Online viewer (better for .docx files)
                    const officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}`;

                    // Google Docs viewer (alternative option)
                    const googleDocsUrl = `https://docs.google.com/viewer?url=${encodedUrl}&embedded=true`;

                    // Default to Microsoft Office viewer since it handles Word docs better
                    const wordFrame = document.createElement('iframe');
                    wordFrame.src = officeViewerUrl;
                    wordFrame.style.width = '100%';
                    wordFrame.style.height = '100%';
                    wordFrame.style.border = 'none';
                    wordFrame.setAttribute('title', fileDoc.name);
                    wordFrame.setAttribute('loading', 'lazy');
                    wordFrame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');

                    // Log what we're doing
                    console.log(`Loading Word document with Office Online viewer: ${officeViewerUrl}`);

                    docViewerContainer.appendChild(wordFrame);

                    // Better viewer options UI with multiple viewing options
                    const viewerOptionsTabs = document.createElement('div');
                    viewerOptionsTabs.className = 'viewer-options bg-light p-3 mt-3 rounded';
                    viewerOptionsTabs.innerHTML = `
                        <div class="d-flex justify-content-between">
                            <div class="btn-group viewer-option-tabs" role="group">
                                <button class="btn btn-sm btn-primary viewer-option active" data-viewer="office">
                                    <i class="fas fa-file-word me-1"></i> Office Viewer
                                </button>
                                <button class="btn btn-sm btn-outline-primary viewer-option" data-viewer="google">
                                    <i class="fab fa-google me-1"></i> Google Docs
                                </button>
                            </div>
                            <div>
                                <a href="${fileUrl}" download class="btn btn-sm btn-outline-primary">
                                    <i class="fas fa-download me-1"></i> Download
                                </a>
                            </div>
                        </div>
                        <div class="mt-3" id="viewer-message">
                            <div class="alert alert-info small">
                                <i class="fas fa-info-circle me-2"></i>
                                If the document doesn't load, try the Google Docs viewer option or download the file.
                            </div>
                        </div>
                    `;

                    wordContainer.appendChild(docViewerContainer);
                    wordContainer.appendChild(viewerOptionsTabs);
                    cvViewer.appendChild(wordContainer);

                    // Fade in the container
                    setTimeout(() => {
                        wordContainer.style.opacity = '1';
                        this.hideLoadingState();

                        // Set up event listeners for viewer option buttons
                        const viewerButtons = viewerOptionsTabs.querySelectorAll('.viewer-option');
                        viewerButtons.forEach(btn => {
                            btn.addEventListener('click', () => {
                                // Update active button state
                                viewerButtons.forEach(b => {
                                    b.classList.remove('btn-primary', 'active');
                                    b.classList.add('btn-outline-primary');
                                });
                                btn.classList.remove('btn-outline-primary');
                                btn.classList.add('btn-primary', 'active');

                                // Get viewer type and update iframe
                                const viewerType = btn.getAttribute('data-viewer');
                                const viewerMessage = document.getElementById('viewer-message');

                                // Show loading message
                                viewerMessage.innerHTML = `
                                    <div class="text-center py-2">
                                        <div class="spinner-border spinner-border-sm text-primary" role="status">
                                            <span class="visually-hidden">Loading...</span>
                                        </div>
                                        <span class="ms-2">Switching document viewer...</span>
                                    </div>
                                `;

                                // Change iframe source based on viewer type
                                if (viewerType === 'google') {
                                    console.log(`Switching to Google Docs viewer: ${googleDocsUrl}`);
                                    wordFrame.src = googleDocsUrl;
                                    viewerMessage.innerHTML = `
                                        <div class="alert alert-info small">
                                            <i class="fas fa-info-circle me-2"></i>
                                            Using Google Docs viewer. If it shows "Loading..." for too long, the document might be too large or complex.
                                        </div>
                                    `;
                                } else {
                                    console.log(`Switching to Office Online viewer: ${officeViewerUrl}`);
                                    wordFrame.src = officeViewerUrl;
                                    viewerMessage.innerHTML = `
                                        <div class="alert alert-info small">
                                            <i class="fas fa-info-circle me-2"></i>
                                            Using Microsoft Office Online viewer. This may take a moment to load.
                                        </div>
                                    `;
                                }
                            });
                        });

                        // Handle iframe errors
                        wordFrame.addEventListener('load', () => {
                            console.log('Word document viewer loaded');
                            const viewerMessage = document.getElementById('viewer-message');
                            viewerMessage.innerHTML = '';
                        });

                        wordFrame.addEventListener('error', () => {
                            console.error('Failed to load Word document in viewer');
                            const viewerMessage = document.getElementById('viewer-message');
                            viewerMessage.innerHTML = `
                                <div class="alert alert-warning">
                                    <i class="fas fa-exclamation-triangle me-2"></i>
                                    Failed to load document in viewer. Try another viewer option or download the file.
                                </div>
                            `;
                        });
                    }, 300);
                    break;

                case 'text':
                    // Create container for text document with syntax highlighting
                    const textContainer = document.createElement('div');
                    textContainer.className = 'document-content-native';
                    textContainer.style.opacity = '0';
                    textContainer.style.transition = 'opacity 0.3s ease';

                    // Add metadata initially
                    const textHeader = document.createElement('div');
                    textHeader.className = 'pdf-metadata p-4';
                    textHeader.innerHTML = metadataHeader;
                    textContainer.appendChild(textHeader);

                    const textContentWrapper = document.createElement('div');
                    textContentWrapper.className = 'text-content-wrapper p-4';
                    textContentWrapper.innerHTML = '<div class="text-content-placeholder"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';
                    textContainer.appendChild(textContentWrapper);

                    cvViewer.appendChild(textContainer);

                    // Fetch and display text content with original formatting
                    fetch(fileUrl)
                        .then(response => response.text())
                        .then(text => {
                            const contentPlaceholder = textContainer.querySelector('.text-content-placeholder');
                            if (contentPlaceholder) {
                                // Create a pre element for proper text formatting
                                const textContent = document.createElement('pre');
                                textContent.className = 'text-document-content';
                                textContent.style.fontFamily = 'Consolas, Monaco, "Andale Mono", monospace';
                                textContent.style.fontSize = '14px';
                                textContent.style.lineHeight = '1.6';
                                textContent.style.padding = '20px';
                                textContent.style.border = '1px solid #e9ecef';
                                textContent.style.borderRadius = '8px';
                                textContent.style.backgroundColor = '#fafafa';
                                textContent.style.whiteSpace = 'pre-wrap';
                                textContent.style.wordWrap = 'break-word';
                                textContent.style.overflow = 'auto';
                                textContent.style.maxHeight = 'calc(100vh - 300px)';
                                textContent.textContent = text;

                                contentPlaceholder.replaceWith(textContent);

                                // Fade in when content is loaded
                                textContainer.style.opacity = '1';
                                this.hideLoadingState();
                            }
                        })
                        .catch(error => {
                            console.error('Error loading text document:', error);
                            const contentPlaceholder = textContainer.querySelector('.text-content-placeholder');
                            if (contentPlaceholder) {
                                contentPlaceholder.innerHTML = `
                                    <div class="alert alert-danger">
                                        <i class="fas fa-exclamation-circle me-2"></i>
                                        Failed to load text document: ${error.message || 'Unknown error'}
                                    </div>
                                    <div class="mt-3">
                                        <a href="${fileUrl}" download class="btn btn-primary">
                                            <i class="fas fa-download me-2"></i> Download Text File
                                        </a>
                                    </div>
                                `;

                                // Fade in even on error
                                textContainer.style.opacity = '1';
                                this.hideLoadingState();
                            }
                        });
                    break;

                default:
                    // Generic file view with download option and attempt to embed if possible
                    const genericContainer = document.createElement('div');
                    genericContainer.className = 'document-content-native';
                    genericContainer.style.opacity = '0';
                    genericContainer.style.transition = 'opacity 0.3s ease';

                    genericContainer.innerHTML = `
                        ${metadataHeader}
                        <div class="text-center mt-5">
                            <i class="fas ${this.getFileIcon(fileDoc.type)} fa-5x mb-4"></i>
                            <p class="text-muted mb-4">This file type cannot be previewed natively in the browser.</p>
                            <div class="document-actions">
                                <a href="${fileUrl}" download class="btn btn-primary me-2">
                                    <i class="fas fa-download me-2"></i> Download File
                                </a>
                                <a href="${fileUrl}" target="_blank" class="btn btn-outline-primary">
                                    <i class="fas fa-external-link-alt me-2"></i> Open in New Tab
                                </a>
                            </div>
                        </div>
                    `;

                    cvViewer.appendChild(genericContainer);

                    // Fade in the container
                    setTimeout(() => {
                        genericContainer.style.opacity = '1';
                        this.hideLoadingState();
                    }, 300);
            }

            console.log(`File document loaded successfully: ${fileDoc.name}`);

            return { success: true };

        } catch (error) {
            console.error('Error loading file document:', error);
            this.hideLoadingState();
            this.showToast('Error', 'Could not load document. Please try again.');
            return { success: false, message: error.message };
        }
    },

    // Get file type icon for metadata display
    getFileTypeIcon(type) {
        switch (type) {
            case 'pdf':
                return 'fa-file-pdf';
            case 'word':
                return 'fa-file-word';
            case 'text':
                return 'fa-file-alt';
            default:
                return 'fa-file';
        }
    },

    // Get file type label for metadata
    getFileTypeLabel(type) {
        switch (type) {
            case 'pdf':
                return 'PDF Document';
            case 'word':
                return 'Word Document';
            case 'text':
                return 'Text File';
            default:
                return 'Document';
        }
    },

    // Handle file upload
    async handleFileUpload(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;

            // Show loading indicator
            this.showLoadingState('Uploading and parsing your CV...');

            try {
                // Parse content using the CV Parser
                const result = await window.CVParser.parseFile(file);

                // Reload document list
                await this.loadDocuments();

                // Show success message
                this.showToast('Success', 'CV uploaded and parsed successfully!');

                // Load the newly uploaded document in the viewer
                if (result && result.document_id) {
                    await this.loadDocumentById(result.document_id);

                    // Highlight the document in the list
                    const newDocItem = document.querySelector(`[data-id="${result.document_id}"]`);
                    if (newDocItem) {
                        const items = this.documentContainer.querySelectorAll('.list-group-item');
                        items.forEach(item => item.classList.remove('active'));
                        newDocItem.classList.add('active');
                    }

                    // Trigger CV analysis immediately after upload
                    this.showToast('Success', 'Analyzing CV...!');

                    setTimeout(() => {
                        this._triggerCvAnalysisInBackground(result.document_id);
                    }, 3000);

                    // Hide loading indicator (ensure it's hidden)
                    // this.hideLoadingState();
                }
            } catch (error) {
                console.error('Error in file upload:', error);
                // Hide loading indicator on error
                this.hideLoadingState();
                // Show user-friendly error
                this.showToast('Upload Failed', error.message || 'Failed to parse CV. Please try a different file format.');
            }

        } catch (error) {
            console.error('Error handling file upload:', error);
            // Hide loading indicator on outer error
            this.hideLoadingState();
            // Show user-friendly error
            this.showToast('Error', `Error uploading CV: ${error.message || 'Unknown error'}`);
        } finally {
            // Final attempt to ensure loading indicator is hidden
            setTimeout(() => {
                this.hideLoadingState();
            }, 500);
        }
    },

    // Show loading state
    showLoadingState(message = 'Loading...') {
        // Remove any existing loading overlay first to prevent duplicates
        this.hideLoadingState();

        // Create new loading overlay
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'loading-overlay';
        loadingOverlay.className = 'position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center bg-white bg-opacity-75';
        loadingOverlay.style.zIndex = '9999';

        loadingOverlay.innerHTML = `
            <div class="text-center">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p id="loading-message">${message}</p>
            </div>
        `;

        document.body.appendChild(loadingOverlay);

        // Add safety timeout to auto-hide after 30 seconds in case something goes wrong
        window.loadingTimeout = setTimeout(() => {
            console.warn('Loading timeout reached - forcing hide of loading overlay');
            this.hideLoadingState();
        }, 30000);
    },

    // Hide loading state
    hideLoadingState() {
        // Clear any existing timeout
        if (window.loadingTimeout) {
            clearTimeout(window.loadingTimeout);
            window.loadingTimeout = null;
        }

        // Find and remove loading overlay
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            try {
                // First hide it visually
                loadingOverlay.style.display = 'none';
                // Then remove it from DOM
                if (loadingOverlay.parentNode) {
                    loadingOverlay.parentNode.removeChild(loadingOverlay);
                }
            } catch (error) {
                console.error('Error removing loading overlay:', error);
                // Force remove all loading overlays as fallback
                document.querySelectorAll('#loading-overlay').forEach(overlay => {
                    if (overlay.parentNode) {
                        overlay.parentNode.removeChild(overlay);
                    }
                });
            }
        }
    },

    // Show toast notification
    showToast(title, message) {
        // Create toast container if it doesn't exist
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'position-fixed bottom-0 end-0 p-3';
            toastContainer.style.zIndex = '11000';
            document.body.appendChild(toastContainer);
        }

        // Create unique ID for this toast
        const toastId = 'toast-' + Date.now();

        // Create the toast element
        const toastEl = document.createElement('div');
        toastEl.className = 'toast';
        toastEl.id = toastId;
        toastEl.setAttribute('role', 'alert');
        toastEl.setAttribute('aria-live', 'assertive');
        toastEl.setAttribute('aria-atomic', 'true');

        toastEl.innerHTML = `
            <div class="toast-header">
                <strong class="me-auto">${title}</strong>
                <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        `;

        // Add toast to container
        toastContainer.appendChild(toastEl);

        // Initialize and show toast
        const bsToast = new bootstrap.Toast(toastEl);
        bsToast.show();

        // Remove toast after it's hidden
        toastEl.addEventListener('hidden.bs.toast', function () {
            toastEl.remove();
        });
    },

    // Rename document
    async renameDocument(id, newName) {
        try {
            // Show loading indicator
            this.showLoadingState('Renaming document...');

            // Call the API to rename document
            const result = await window.CVParser.renameDocument(id, newName);

            // Hide loading indicator
            this.hideLoadingState();

            if (result.success) {
                this.showToast('Success', 'Document renamed successfully');
            } else {
                this.showToast('Error', result.message || 'Failed to rename document');
            }

            return result;
        } catch (error) {
            console.error('Error renaming document:', error);
            // Hide loading indicator on error
            this.hideLoadingState();
            this.showToast('Error', 'Failed to rename document: ' + error.message);
            return { success: false, message: error.message };
        }
    },

    // Delete document
    async deleteDocument(id) {
        try {
            // Show loading indicator
            this.showLoadingState('Deleting document...');

            // Call the API to delete document
            const result = await window.CVParser.deleteDocument(id);

            // Hide loading indicator
            this.hideLoadingState();

            if (result.success) {
                this.showToast('Success', 'Document deleted successfully');
            } else {
                this.showToast('Error', result.message || 'Failed to delete document');
            }

            return result;
        } catch (error) {
            console.error('Error deleting document:', error);
            // Hide loading indicator on error
            this.hideLoadingState();
            this.showToast('Error', 'Failed to delete document: ' + error.message);
            return { success: false, message: error.message };
        }
    }
};

// Make DB available globally
window.DB = DB;