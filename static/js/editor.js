// Document Editor JavaScript
// This file handles all UI interactions and delegates database operations to db.js

document.addEventListener('DOMContentLoaded', function() {
    // Initialize editor components
    initEditorToolbar();
    
    // Initialize CV database and document list
    window.DB.initializeDatabase();
    
    // Setup context menu
    setupContextMenu();
    
    // Setup rename document functionality
    setupRenameDocument();
    
    // Setup delete document functionality
    setupDeleteDocument();
    
    // Setup upload button from sidebar
    const uploadBtn = document.getElementById('upload-document-btn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', function() {
            // Create file input dynamically
            createAndTriggerFileInput();
        });
    }
    
    // Setup CV upload button from empty editor state
    const cvUploadBtn = document.getElementById('cv-upload-btn');
    if (cvUploadBtn) {
        cvUploadBtn.addEventListener('click', function() {
            // Create file input dynamically
            createAndTriggerFileInput();
        });
    }
    
    // Setup cover letter creation button
    // Will be created during AI agent workflow trigger
    
    // Setup AI suggestions, apply, and save buttons
    setupActionButtons();
});

// Create and trigger file input for CV upload
function createAndTriggerFileInput() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,.doc,.docx,.txt';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', window.DB.handleFileUpload.bind(window.DB));
    document.body.appendChild(fileInput);
    fileInput.click();
    
    // Remove after selection
    fileInput.addEventListener('blur', function() {
        document.body.removeChild(fileInput);
    });
}

// Show context menu for document management
function showContextMenu(event, doc) {
    event.preventDefault();
    event.stopPropagation();
    
    const menu = document.getElementById('documentContextMenu');
    const button = event.currentTarget; // The 3-dot button that was clicked
    
    // Get the button's position
    const buttonRect = button.getBoundingClientRect();
    
    // Position the menu next to the button
    menu.style.display = 'block';
    
    // Adjust position calculations for better alignment with the button
    const menuPosition = {
        top: buttonRect.bottom + window.scrollY,
        left: buttonRect.right + window.scrollX - menu.offsetWidth, // Align right edge of menu with right edge of button
    };
    
    // Position the menu using the button's position
    menu.style.position = 'absolute';
    menu.style.top = `${menuPosition.top}px`;
    menu.style.left = `${menuPosition.left}px`;
    menu.style.right = 'auto'; // Clear any previous right positioning
    
    // Store the document ID in the menu
    menu.setAttribute('data-document-id', doc.id);
    
    // Handle document view click
    const viewItem = menu.querySelector('.document-view');
    viewItem.onclick = function(e) {
        e.preventDefault();
        hideContextMenu();
        window.DB.loadDocumentById(doc.id);
    };
    
    // Handle document rename click
    const renameItem = menu.querySelector('.document-rename');
    renameItem.onclick = function(e) {
        e.preventDefault();
        hideContextMenu();
        openRenameModal(doc);
    };
    
    // Handle document download click
    const downloadItem = menu.querySelector('.document-download');
    downloadItem.onclick = function(e) {
        e.preventDefault();
        hideContextMenu();
        downloadDocument(doc);
    };
    
    // Handle document delete click
    const deleteItem = menu.querySelector('.document-delete');
    deleteItem.onclick = function(e) {
        e.preventDefault();
        hideContextMenu();
        openDeleteModal(doc);
    };
    
    // Hide menu when clicking elsewhere
    document.addEventListener('click', hideContextMenu);
}

// Hide context menu
function hideContextMenu() {
    const menu = document.getElementById('documentContextMenu');
    menu.style.display = 'none';
    document.removeEventListener('click', hideContextMenu);
}

// Setup context menu
function setupContextMenu() {
    // Hide context menu initially
    const menu = document.getElementById('documentContextMenu');
    if (menu) {
        menu.style.display = 'none';
    }
}

// Open rename document modal
function openRenameModal(doc) {
    const modal = document.getElementById('renameDocModal');
    const nameInput = document.getElementById('newDocName');
    const docIdInput = document.getElementById('renameDocId');
    
    // Set current values
    nameInput.value = doc.name;
    docIdInput.value = doc.id;
    
    // Show modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}

// Setup rename document functionality
function setupRenameDocument() {
    const confirmBtn = document.getElementById('confirmRenameBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async function() {
            try {
                // Get the document ID and new name
                const docIdInput = document.getElementById('renameDocId');
                const nameInput = document.getElementById('newDocName');
                
                if (!docIdInput || !docIdInput.value) {
                    throw new Error('Document ID not found');
                }
                
                // Convert ID to string to match backend expectations
                const docId = docIdInput.value.toString();
                const newName = nameInput.value.trim();
                
                if (!newName) {
                    window.DB.showToast('Error', 'Please enter a valid name');
                    return;
                }
                
                // Show loading indicator in the modal
                const renameModal = document.getElementById('renameDocModal');
                const modalBody = renameModal.querySelector('.modal-body');
                const originalContent = modalBody.innerHTML;
                
                // Update modal content to show loading
                modalBody.innerHTML = `
                    <div class="text-center">
                        <div class="spinner-border text-primary mb-3" role="status"></div>
                        <p>Renaming document...</p>
                    </div>
                `;
                
                // Use the database module to rename document
                const result = await window.DB.renameDocument(docId, newName);
                
                if (result.success) {
                    // Close modal
                    bootstrap.Modal.getInstance(renameModal).hide();
                    
                    // Reload documents
                    await window.DB.loadDocuments();
                    
                    // Keep the renamed document active and update viewer
                    const renamedItem = document.querySelector(`[data-id="${docId}"]`);
                    if (renamedItem) {
                        // Make sure it's selected in the list
                        const items = document.querySelectorAll('.list-group-item');
                        items.forEach(item => item.classList.remove('active'));
                        renamedItem.classList.add('active');
                        
                        // Reload the document to refresh the view with new name
                        window.DB.loadDocumentById(docId);
                    }
                } else {
                    // Restore original modal content
                    modalBody.innerHTML = originalContent;
                    window.DB.showToast('Error', result.message || 'Failed to rename document');
                }
            } catch (error) {
                console.error('Error in document renaming:', error);
                window.DB.showToast('Error', `Failed to rename document: ${error.message}`);
                bootstrap.Modal.getInstance(document.getElementById('renameDocModal')).hide();
            }
        });
    }
}

// Open delete document confirmation modal
function openDeleteModal(doc) {
    const modal = document.getElementById('deleteDocModal');
    const nameElement = document.getElementById('deleteDocName');
    const idInput = document.getElementById('deleteDocId');
    
    // Set document details
    nameElement.textContent = doc.name;
    idInput.value = doc.id;
    
    // Show modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}

// Setup delete document functionality
function setupDeleteDocument() {
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async function() {
            try {
                // Get the document ID from the hidden input field
                const docIdInput = document.getElementById('deleteDocId');
                if (!docIdInput || !docIdInput.value) {
                    throw new Error('Document ID not found');
                }
                
                // Get the document ID as a string (backend uses string IDs)
                const docId = docIdInput.value.toString();
                
                // Show loading indicator
                const deleteModal = document.getElementById('deleteDocModal');
                const modalBody = deleteModal.querySelector('.modal-body');
                const originalContent = modalBody.innerHTML;
                
                // Update modal content to show loading
                modalBody.innerHTML = `
                    <div class="text-center">
                        <div class="spinner-border text-primary mb-3" role="status"></div>
                        <p>Deleting document and associated files...</p>
                    </div>
                `;
                
                // Use the database module to delete document
                const result = await window.DB.deleteDocument(docId);
                
                if (result.success) {
                    // Close modal
                    bootstrap.Modal.getInstance(deleteModal).hide();
                    
                    // Clear current document from viewer if it was the one deleted
                    const viewerElement = document.querySelector('.viewer-wrapper');
                    if (viewerElement && viewerElement.getAttribute('data-current-doc-id') === docId) {
                        // Reset viewer to empty state
                        const cvViewer = document.getElementById('cv-viewer');
                        if (cvViewer) {
                            cvViewer.innerHTML = `
                                <div class="document-content text-center empty-viewer-state">
                                    <div class="py-5">
                                        <i class="fas fa-file-alt fa-4x text-muted mb-3"></i>
                                        <h3 class="h4">No CV Selected</h3>
                                        <p class="text-muted mb-4">Upload a CV or select an existing document from the sidebar</p>
                                        <button class="btn btn-primary" id="cv-upload-btn">
                                            <i class="fas fa-upload me-2"></i> Upload CV
                                        </button>
                                    </div>
                                </div>
                            `;
                            
                            // Re-attach event listener to upload button
                            const cvUploadBtn = document.getElementById('cv-upload-btn');
                            if (cvUploadBtn) {
                                cvUploadBtn.addEventListener('click', function() {
                                    createAndTriggerFileInput();
                                });
                            }
                        }
                    }
                    
                    // Reload documents to update the sidebar list
                    await window.DB.loadDocuments();
                    
                    // Show success message
                    window.DB.showToast('Success', 'Document and associated files deleted successfully');
                } else {
                    // Restore original modal content
                    modalBody.innerHTML = originalContent;
                    
                    // Show error message
                    window.DB.showToast('Error', result.message || 'Failed to delete document');
                }
            } catch (error) {
                console.error('Error in document deletion:', error);
                window.DB.showToast('Error', `Failed to delete document: ${error.message}`);
                bootstrap.Modal.getInstance(document.getElementById('deleteDocModal')).hide();
            }
        });
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
            return '.html';
    }
}

// Setup AI suggestions, apply for job, and save draft buttons
function setupActionButtons() {
    const aiSuggestionBtn = document.querySelector('button:has(i.fas.fa-magic)');
    if (aiSuggestionBtn) {
        aiSuggestionBtn.addEventListener('click', function() {
            alert("AI is generating suggestions for improving your document... This feature will be implemented in the future.");
        });
    }
    
    const applyBtn = document.querySelector('button:has(i.fas.fa-paper-plane)');
    if (applyBtn) {
        applyBtn.addEventListener('click', function() {
            alert("Your application would be submitted here. This feature will be implemented in the future.");
        });
    }
    
    const saveBtn = document.querySelector('button:has(i.fas.fa-save)');
    if (saveBtn) {
        saveBtn.addEventListener('click', async function() {
            // Get current document ID
            const editorElement = document.querySelector('.editor-wrapper');
            if (!editorElement) return;
            
            const docId = parseInt(editorElement.getAttribute('data-current-doc-id'));
            if (!docId) {
                alert("No document currently active");
                return;
            }
            
            // Get current content
            let content;
            const activeTab = document.querySelector('.tab-pane.active');
            if (activeTab.id === 'cv-tab') {
                content = document.getElementById('cv-editor').innerHTML;
            } else {
                content = document.getElementById('cover-letter-editor').innerHTML;
            }
            
            // Use the database module to save document content
            const result = await window.DB.saveDocumentContent(docId, content);
            
            if (result.success) {
                // Reload documents to update timestamps
                await window.DB.loadDocuments();
                
                // Keep the current document active
                const currentItem = document.querySelector(`[data-id="${docId}"]`);
                if (currentItem) {
                    currentItem.classList.add('active');
                }
                
                // Show success message
                window.DB.showToast('Success', 'Document saved successfully!');
            } else {
                alert(result.message);
            }
        });
    }
}

// Editor toolbar functionality
function initEditorToolbar() {
    // Bold button
    const boldBtns = document.querySelectorAll('.editor-toolbar button:has(i.fas.fa-bold)');
    boldBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            document.execCommand('bold', false, null);
        });
    });
    
    // Italic button
    const italicBtns = document.querySelectorAll('.editor-toolbar button:has(i.fas.fa-italic)');
    italicBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            document.execCommand('italic', false, null);
        });
    });
    
    // Underline button
    const underlineBtns = document.querySelectorAll('.editor-toolbar button:has(i.fas.fa-underline)');
    underlineBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            document.execCommand('underline', false, null);
        });
    });
    
    // Align left button
    const alignLeftBtns = document.querySelectorAll('.editor-toolbar button:has(i.fas.fa-align-left)');
    alignLeftBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            document.execCommand('justifyLeft', false, null);
        });
    });
    
    // Align center button
    const alignCenterBtns = document.querySelectorAll('.editor-toolbar button:has(i.fas.fa-align-center)');
    alignCenterBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            document.execCommand('justifyCenter', false, null);
        });
    });
    
    // Align right button
    const alignRightBtns = document.querySelectorAll('.editor-toolbar button:has(i.fas.fa-align-right)');
    alignRightBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            document.execCommand('justifyRight', false, null);
        });
    });
    
    // Unordered list button
    const ulBtns = document.querySelectorAll('.editor-toolbar button:has(i.fas.fa-list-ul)');
    ulBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            document.execCommand('insertUnorderedList', false, null);
        });
    });
    
    // Ordered list button
    const olBtns = document.querySelectorAll('.editor-toolbar button:has(i.fas.fa-list-ol)');
    olBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            document.execCommand('insertOrderedList', false, null);
        });
    });
}

// Make showContextMenu globally available
window.showContextMenu = showContextMenu;