// CV Document Database Management
// This file handles all database interactions using Dexie.js

// Create Dexie database for storing CVs
const db = new Dexie('JobhaDB');

// Define database schema
db.version(2).stores({
    cvDocuments: '++id, name, type, content, createdAt, updatedAt'
});

// Initialize CV database and load existing documents
async function initializeDatabase() {
    try {
        // Load all documents
        await loadDocuments();
    } catch (error) {
        console.error('Failed to initialize database:', error);
        alert('Failed to initialize CV storage. Please try refreshing the page.');
    }
}

// Default empty state content for CV
function getEmptyStateContentCV() {
    return `<div class="document-content empty-state-content text-center">
        <div class="empty-state-icon mb-4">
            <i class="fas fa-file-upload fa-4x text-primary opacity-50"></i>
        </div>
        <h2 class="mb-3">No Resume Uploaded Yet</h2>
        <p class="lead mb-4">Upload your resume to get started with editing and optimization</p>
        <p class="mb-5">Our tools will help you create a professional resume that stands out to employers.</p>
        <button class="btn btn-lg btn-primary px-4 py-2 empty-state-upload-btn">
            <i class="fas fa-upload me-2"></i> Upload Your Resume
        </button>
    </div>`;
}

// Default empty state content for Cover Letter
function getEmptyStateContentCoverLetter() {
    return `<div class="document-content empty-state-content text-center">
        <div class="empty-state-icon mb-4">
            <i class="fas fa-envelope-open-text fa-4x text-primary opacity-50"></i>
        </div>
        <h2 class="mb-3">No Cover Letter Created Yet</h2>
        <p class="lead mb-4">Upload a resume first to generate a matching cover letter</p>
        <p class="mb-5">Our AI tools can help you create a tailored cover letter to match any job posting.</p>
        <button class="btn btn-lg btn-primary px-4 py-2 empty-state-upload-btn">
            <i class="fas fa-upload me-2"></i> Upload Your Resume
        </button>
    </div>`;
}

// Load all documents from the database
async function loadDocuments() {
    try {
        const documents = await db.cvDocuments.orderBy('updatedAt').reverse().toArray();
        const container = document.getElementById('document-container');
        
        // Clear existing content
        container.innerHTML = '';
        
        // Add each document
        documents.forEach(doc => {
            const item = createDocumentElement(doc);
            container.appendChild(item);
        });
        
        // Set the first document as active if exists
        if (documents.length > 0) {
            const firstItem = container.querySelector('.list-group-item');
            if (firstItem) {
                firstItem.classList.add('active');
                loadDocumentContent(documents[0]);
            }
        } else {
            // If no documents, show empty state
            showEmptyState();
        }
    } catch (error) {
        console.error('Failed to load documents:', error);
        showEmptyState();
    }
}

// Show empty state UI when no documents exist
function showEmptyState() {
    // Update CV editor with empty state
    document.getElementById('cv-editor').innerHTML = getEmptyStateContentCV();
    
    // Update Cover Letter editor with empty state
    document.getElementById('cover-letter-editor').innerHTML = getEmptyStateContentCoverLetter();
    
    // Remove current document ID if present
    const editorElement = document.querySelector('.editor-wrapper');
    if (editorElement) {
        editorElement.removeAttribute('data-current-doc-id');
    }
    
    // Add event listeners for the upload buttons in empty states
    setupEmptyStateListeners();
}

// Set up click handlers for empty state upload buttons
function setupEmptyStateListeners() {
    const uploadButtons = document.querySelectorAll('.empty-state-upload-btn');
    
    uploadButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Trigger the main upload button
            document.getElementById('upload-document-btn').click();
        });
    });
}

// Create a document list item element
function createDocumentElement(doc) {
    const item = document.createElement('a');
    item.href = "#";
    item.className = "list-group-item list-group-item-action d-flex justify-content-between align-items-center";
    item.setAttribute('data-id', doc.id);
    
    // Set the appropriate icon based on type
    let icon = 'file-alt';
    if (doc.type === 'cover-letter') {
        icon = 'envelope-open-text';
    }
    
    item.innerHTML = `
        <div>
            <i class="fas fa-${icon} me-2"></i> <span class="doc-name">${doc.name}</span>
        </div>
        <span class="badge bg-primary rounded-pill">${formatDate(doc.updatedAt)}</span>
    `;
    
    // Add event listener for document selection
    item.addEventListener('click', function(e) {
        e.preventDefault();
        
        // Skip if already active
        if (this.classList.contains('active')) return;
        
        // Update active state
        document.querySelectorAll('.document-list .list-group-item').forEach(t => 
            t.classList.remove('active'));
        this.classList.add('active');
        
        // Load the document content
        loadDocumentById(doc.id);
    });
    
    // Add context menu handler
    item.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        showContextMenu(e, doc);
    });
    
    return item;
}

// Format date for display
function formatDate(date) {
    const d = new Date(date);
    const now = new Date();
    
    // If today, show time
    if (d.toDateString() === now.toDateString()) {
        return 'Today';
    }
    
    // If yesterday, show "Yesterday"
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    }
    
    // Otherwise show date
    return d.toLocaleDateString();
}

// Load document content by ID
async function loadDocumentById(id) {
    try {
        const doc = await db.cvDocuments.get(id);
        if (doc) {
            loadDocumentContent(doc);
        }
    } catch (error) {
        console.error('Failed to load document:', error);
    }
}

// Load document content into the editor
function loadDocumentContent(doc) {
    // Show appropriate tab based on document type
    if (doc.type === 'cover-letter') {
        document.querySelector('a[href="#cover-letter-tab"]').click();
        document.getElementById('cover-letter-editor').innerHTML = doc.content;
    } else {
        document.querySelector('a[href="#cv-tab"]').click();
        document.getElementById('cv-editor').innerHTML = doc.content;
    }
    
    // Update current document data attribute
    const editorElement = document.querySelector('.editor-wrapper');
    if (editorElement) {
        editorElement.setAttribute('data-current-doc-id', doc.id);
    }
}

// Handle file upload
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        // Generate a unique name if a document with the same name exists
        let docName = file.name.split('.')[0]; // Remove extension
        let nameExists = await db.cvDocuments.where('name').equals(docName).count() > 0;
        
        // If name exists, append a unique identifier
        if (nameExists) {
            docName += ' (' + new Date().toLocaleTimeString() + ')';
        }
        
        // Create reader to read file content
        const reader = new FileReader();
        
        reader.onload = async function(e) {
            const content = e.target.result;
            
            // For demonstration, we're storing the file content directly
            // In a real app, you might want to parse the file or send it to a server
            const newDoc = {
                name: docName,
                type: 'cv', // Default to CV type
                content: `<div class="document-content">${content}</div>`,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            // Add to database
            const id = await db.cvDocuments.add(newDoc);
            
            // Reload documents
            await loadDocuments();
            
            // Set the new document as active
            const newItem = document.querySelector(`[data-id="${id}"]`);
            if (newItem) {
                newItem.click();
            }
        };
        
        // If text file, read as text
        if (file.type === 'text/plain') {
            reader.readAsText(file);
        } else {
            // For other files, just store the file name for now 
            // In a real app, you'd want to handle different file types properly
            const newDoc = {
                name: docName,
                type: 'cv',
                content: `<div class="document-content"><h1 class="text-center mb-4">${docName}</h1><p>Document uploaded. Content would be parsed in a full implementation.</p></div>`,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            // Add to database
            const id = await db.cvDocuments.add(newDoc);
            
            // Reload documents
            await loadDocuments();
            
            // Set the new document as active
            const newItem = document.querySelector(`[data-id="${id}"]`);
            if (newItem) {
                newItem.click();
            }
        }
    } catch (error) {
        console.error('Failed to upload file:', error);
        alert('Failed to upload file. Please try again.');
    }
}

// Database operations for document management
async function renameDocument(docId, newName) {
    try {
        // Check if name already exists for other documents
        const existingDoc = await db.cvDocuments.where('name').equals(newName).first();
        if (existingDoc && existingDoc.id !== docId) {
            return { success: false, message: 'A document with this name already exists. Please choose another name.' };
        }
        
        // Update document name
        await db.cvDocuments.update(docId, {
            name: newName,
            updatedAt: new Date()
        });
        
        return { success: true };
    } catch (error) {
        console.error('Failed to rename document:', error);
        return { success: false, message: 'Failed to rename document. Please try again.' };
    }
}

async function deleteDocument(docId) {
    try {
        // Delete document
        await db.cvDocuments.delete(docId);
        
        // Check if any documents remain
        const count = await db.cvDocuments.count();
        if (count === 0) {
            // If no documents remain, show empty state
            showEmptyState();
        }
        
        return { success: true };
    } catch (error) {
        console.error('Failed to delete document:', error);
        return { success: false, message: 'Failed to delete document. Please try again.' };
    }
}

async function saveDocumentContent(docId, content) {
    try {
        // Update document
        await db.cvDocuments.update(docId, {
            content: content,
            updatedAt: new Date()
        });
        return { success: true };
    } catch (error) {
        console.error('Failed to save document:', error);
        return { success: false, message: 'Failed to save document. Please try again.' };
    }
}

// Export functions for use in other files
window.DB = {
    initializeDatabase,
    loadDocuments,
    loadDocumentById,
    handleFileUpload,
    renameDocument,
    deleteDocument,
    saveDocumentContent,
    showEmptyState
};