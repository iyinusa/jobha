// Document Editor JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize editor components
    initEditorToolbar();
    setupDocumentSwitching();
    
    // Setup upload button
    const uploadBtn = document.getElementById('upload-document-btn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', function() {
            // Create file input dynamically
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.pdf,.doc,.docx';
            fileInput.style.display = 'none';
            fileInput.addEventListener('change', handleFileUpload);
            document.body.appendChild(fileInput);
            fileInput.click();
            
            // Remove after selection
            fileInput.addEventListener('blur', function() {
                document.body.removeChild(fileInput);
            });
        });
    }
});

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

function setupDocumentSwitching() {
    // Handle document tab switching
    const documentTabs = document.querySelectorAll('.document-list .list-group-item');
    documentTabs.forEach(tab => {
        tab.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Update active state
            documentTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Here you would normally load the selected document
            // For demonstration, we'll just show an alert
            const documentName = this.querySelector('div').textContent.trim();
            console.log('Switching to document: ' + documentName);
            
            // If this is a cover letter, switch to the cover letter tab
            if(documentName.includes('Cover Letter')) {
                document.querySelector('a[href="#cover-letter-tab"]').click();
            } else {
                document.querySelector('a[href="#cv-tab"]').click();
            }
        });
    });
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        // For demonstration purposes, we'll just show an alert
        // In a real application, you would upload the file to the server
        alert(`File "${file.name}" selected. In a fully implemented version, this would be uploaded and processed by the AI agent.`);
        
        // Create a new document entry
        const documentList = document.querySelector('.document-list .list-group');
        const newDoc = document.createElement('a');
        newDoc.href = "#";
        newDoc.className = "list-group-item list-group-item-action d-flex justify-content-between align-items-center";
        newDoc.innerHTML = `
            <div>
                <i class="fas fa-file-alt me-2"></i> ${file.name}
            </div>
            <span class="badge bg-primary rounded-pill">Uploaded</span>
        `;
        
        documentList.appendChild(newDoc);
        
        // Add event listener to the new document
        newDoc.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Update active state
            document.querySelectorAll('.document-list .list-group-item').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Switch to CV tab
            document.querySelector('a[href="#cv-tab"]').click();
        });
    }
}

// AI Suggestion Button
document.addEventListener('DOMContentLoaded', function() {
    const aiSuggestionBtn = document.querySelector('button:has(i.fas.fa-magic)');
    if (aiSuggestionBtn) {
        aiSuggestionBtn.addEventListener('click', function() {
            // For demonstration purposes
            alert("AI is generating suggestions for improving your document... This feature will be implemented in the future.");
        });
    }
    
    // Apply for Job button
    const applyBtn = document.querySelector('button:has(i.fas.fa-paper-plane)');
    if (applyBtn) {
        applyBtn.addEventListener('click', function() {
            // For demonstration purposes
            alert("Your application would be submitted here. This feature will be implemented in the future.");
        });
    }
    
    // Save Draft button
    const saveBtn = document.querySelector('button:has(i.fas.fa-save)');
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            // For demonstration purposes
            alert("Your document has been saved as a draft. This feature will be implemented in the future.");
        });
    }
});