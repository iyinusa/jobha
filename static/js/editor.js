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
    const menu = document.getElementById('documentContextMenu');
    
    // Position the menu at the mouse position
    menu.style.display = 'block';
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
    
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
            const docId = parseInt(document.getElementById('renameDocId').value);
            const newName = document.getElementById('newDocName').value.trim();
            
            if (!newName) {
                alert('Please enter a valid name');
                return;
            }
            
            // Use the database module to rename document
            const result = await window.DB.renameDocument(docId, newName);
            
            if (result.success) {
                // Close modal
                bootstrap.Modal.getInstance(document.getElementById('renameDocModal')).hide();
                
                // Reload documents
                await window.DB.loadDocuments();
                
                // Keep the renamed document active
                const renamedItem = document.querySelector(`[data-id="${docId}"]`);
                if (renamedItem) {
                    renamedItem.click();
                }
            } else {
                alert(result.message);
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
            const docId = parseInt(document.getElementById('deleteDocId').value);
            
            // Use the database module to delete document
            const result = await window.DB.deleteDocument(docId);
            
            if (result.success) {
                // Close modal
                bootstrap.Modal.getInstance(document.getElementById('deleteDocModal')).hide();
                
                // Reload documents
                await window.DB.loadDocuments();
            } else {
                alert(result.message);
            }
        });
    }
}

// Download document as HTML
function downloadDocument(doc) {
    // Create download link
    const a = document.createElement('a');
    const blob = new Blob([doc.content], {type: 'text/html'});
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.name}.html`;
    
    // Trigger download
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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