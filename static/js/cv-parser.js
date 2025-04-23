// CV Parser Module
// This module handles the parsing of CV/Resume files into structured HTML

// Main CV Parser object
const CVParser = {
    // Process an uploaded file and extract content
    async parseFile(file) {
        try {
            // Read file content based on type
            const fileExtension = file.name.split('.').pop().toLowerCase();
            
            if (fileExtension === 'pdf') {
                return await this.parsePDF(file);
            } else if (fileExtension === 'doc' || fileExtension === 'docx') {
                return await this.parseWord(file);
            } else if (fileExtension === 'txt') {
                return await this.parsePlainText(file);
            } else {
                throw new Error('Unsupported file format. Please upload PDF, DOC, DOCX, or TXT files.');
            }
        } catch (error) {
            console.error('Error parsing CV file:', error);
            throw error;
        }
    },
    
    // Parse PDF files using PDF.js with improved content extraction
    async parsePDF(file) {
        try {
            // Set PDF.js worker path
            pdfjsLib.GlobalWorkerOptions.workerSrc = '/static/js/vendors/pdf.worker.min.js';
            
            // Convert file to ArrayBuffer
            const arrayBuffer = await this.fileToArrayBuffer(file);
            
            // Load PDF document
            const loadingTask = pdfjsLib.getDocument({data: arrayBuffer});
            const pdf = await loadingTask.promise;
            
            // Get total number of pages
            const numPages = pdf.numPages;
            console.log(`PDF loaded with ${numPages} pages`);
            
            let extractedText = '';
            let pageTexts = []; // Store text from each page separately
            
            // Show progress indicator
            window.DB.showLoadingState(`Parsing PDF (0/${numPages} pages)`);
            
            // Process each page
            for (let i = 1; i <= numPages; i++) {
                try {
                    // Update progress indicator
                    window.DB.showLoadingState(`Parsing PDF (${i}/${numPages} pages)`);
                    
                    const page = await pdf.getPage(i);
                    
                    // Get page dimensions
                    const viewport = page.getViewport({ scale: 1.0 });
                    const pageWidth = viewport.width;
                    const pageHeight = viewport.height;
                    
                    // Extract text content with position information
                    const textContent = await page.getTextContent();
                    
                    // Sort text by y-position (top to bottom)
                    const textItems = textContent.items.sort((a, b) => {
                        // 15 pixels tolerance for the same line
                        if (Math.abs(a.transform[5] - b.transform[5]) < 15) {
                            // If on same line, sort left to right
                            return a.transform[4] - b.transform[4];
                        }
                        // Otherwise sort top to bottom (reverse because PDF coordinates are from bottom)
                        return b.transform[5] - a.transform[5];
                    });
                    
                    // Group text items by lines
                    const lines = [];
                    let currentLine = [];
                    let lastY = null;
                    
                    for (const item of textItems) {
                        const y = item.transform[5];
                        const fontSize = Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1]);
                        
                        // Detect if this item is on a new line
                        if (lastY !== null && Math.abs(y - lastY) > fontSize * 0.8) {
                            // Save current line and start a new one
                            if (currentLine.length > 0) {
                                lines.push(currentLine.join(' '));
                                currentLine = [];
                            }
                        }
                        
                        // Add item to current line
                        currentLine.push(item.str);
                        lastY = y;
                    }
                    
                    // Add final line
                    if (currentLine.length > 0) {
                        lines.push(currentLine.join(' '));
                    }
                    
                    // Join lines with proper newlines
                    const pageText = lines.join('\n');
                    pageTexts.push(pageText);
                    
                    // Add page text to extracted text
                    extractedText += pageText + '\n\n';
                    
                } catch (pageErr) {
                    console.error(`Error parsing page ${i}:`, pageErr);
                    // Continue to next page if this one fails
                }
            }
            
            // Try to detect sections based on font sizes and positioning
            const sections = this.detectSectionsFromPDF(pageTexts, extractedText);
            
            // Generate structured HTML
            return this.generateStructuredHTMLFromSections(file.name, sections, extractedText);
            
        } catch (error) {
            console.error('Error parsing PDF:', error);
            throw new Error('Could not parse PDF file. Please try a different format.');
        }
    },
    
    // Detect sections from PDF structure based on typography and spacing
    detectSectionsFromPDF(pageTexts, fullText) {
        // First try standard section detection
        const basicSections = this.extractSections(fullText);
        
        // Check if we got meaningful sections
        let hasMeaningfulSections = false;
        for (const section in basicSections) {
            if (section !== 'other' && basicSections[section].length > 0) {
                hasMeaningfulSections = true;
                break;
            }
        }
        
        if (hasMeaningfulSections) {
            return basicSections;
        }
        
        // If no meaningful sections were found, try advanced detection
        
        // Define common section headers and their patterns
        const possibleSections = [
            { name: 'contact', patterns: ['contact', 'personal details', 'personal information', 'email', 'phone', 'address'] },
            { name: 'summary', patterns: ['summary', 'profile', 'objective', 'professional summary', 'about me', 'career objective'] },
            { name: 'experience', patterns: ['experience', 'work experience', 'employment history', 'work history', 'professional experience'] },
            { name: 'education', patterns: ['education', 'academic background', 'qualifications', 'academic qualifications', 'educational background'] },
            { name: 'skills', patterns: ['skills', 'technical skills', 'core competencies', 'key skills', 'professional skills', 'expertise'] },
            { name: 'certifications', patterns: ['certifications', 'certificates', 'professional certifications', 'accreditations'] },
            { name: 'languages', patterns: ['languages', 'language proficiency', 'language skills'] },
            { name: 'projects', patterns: ['projects', 'key projects', 'professional projects'] },
            { name: 'awards', patterns: ['awards', 'honors', 'achievements', 'recognitions'] },
            { name: 'references', patterns: ['references', 'referees'] }
        ];
        
        // Enhanced section detection based on visual cues and capitalization
        const enhancedSections = {};
        let currentSection = 'other';
        enhancedSections[currentSection] = [];
        
        // Process text and try to detect sections
        const lines = fullText.split('\n');
        
        // First pass - identify potential headers
        const potentialHeaders = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (!line) continue;
            
            // Check if this line could be a header
            // Headers are often short, capitalized or uppercase
            const isShort = line.length < 30;
            const isAllCaps = line === line.toUpperCase();
            const startsWithCap = line[0] === line[0].toUpperCase();
            const endsWithColon = line.endsWith(':');
            const isFollowedByEmpty = i < lines.length - 1 && !lines[i + 1].trim();
            
            // Score the line for header-ness
            let headerScore = 0;
            if (isShort) headerScore += 1;
            if (isAllCaps) headerScore += 2;
            if (startsWithCap) headerScore += 1;
            if (endsWithColon) headerScore += 2;
            if (isFollowedByEmpty) headerScore += 1;
            
            // Check if matches any known section patterns
            for (const section of possibleSections) {
                if (section.patterns.some(pattern => line.toLowerCase().includes(pattern))) {
                    headerScore += 3;
                    break;
                }
            }
            
            if (headerScore >= 3) {
                potentialHeaders.push({ index: i, line, score: headerScore });
            }
        }
        
        // Sort headers by score
        potentialHeaders.sort((a, b) => b.score - a.score);
        
        // Second pass - create sections
        if (potentialHeaders.length > 0) {
            // Convert potential headers to sections
            for (let i = 0; i < potentialHeaders.length; i++) {
                const header = potentialHeaders[i];
                const nextHeader = potentialHeaders[i + 1];
                const startLine = header.index + 1;
                const endLine = nextHeader ? nextHeader.index : lines.length;
                
                // Determine section name
                let sectionName = 'other';
                for (const section of possibleSections) {
                    if (section.patterns.some(pattern => header.line.toLowerCase().includes(pattern))) {
                        sectionName = section.name;
                        break;
                    }
                }
                
                // Extract content
                const content = lines.slice(startLine, endLine)
                    .filter(line => line.trim())
                    .map(line => line.trim());
                
                // Add content to section
                if (!enhancedSections[sectionName]) {
                    enhancedSections[sectionName] = [];
                }
                enhancedSections[sectionName] = enhancedSections[sectionName].concat(content);
            }
            
            // Add any unclassified content to 'other'
            if (!enhancedSections['other']) {
                enhancedSections['other'] = [];
            }
            
            // Extract personal info from the top of the document
            const nameAndContact = lines.slice(0, potentialHeaders[0] ? potentialHeaders[0].index : 10)
                .filter(line => line.trim())
                .map(line => line.trim());
            
            if (nameAndContact.length > 0) {
                enhancedSections['contact'] = enhancedSections['contact'] || [];
                enhancedSections['contact'] = nameAndContact.concat(enhancedSections['contact']);
            }
            
            return enhancedSections;
        }
        
        // If we still couldn't detect sections, fall back to basic sections
        return basicSections;
    },
    
    // Helper to convert File to ArrayBuffer
    fileToArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    },
    
    // Parse Word documents
    async parseWord(file) {
        // In a real implementation, this would use a library for parsing Word docs
        // For now, we'll use a mock implementation
        
        try {
            // Generate structured HTML for Word documents
            return this.generateStructuredHTML(file.name, 'Word document content would be parsed here');
        } catch (error) {
            console.error('Error parsing Word document:', error);
            throw new Error('Could not parse Word document. Please try a different format.');
        }
    },
    
    // Parse plain text files
    async parsePlainText(file) {
        try {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                
                reader.onload = (event) => {
                    const content = event.target.result;
                    resolve(this.generateStructuredHTML(file.name, content));
                };
                
                reader.onerror = () => {
                    reject(new Error('Failed to read text file'));
                };
                
                reader.readAsText(file);
            });
        } catch (error) {
            console.error('Error parsing text file:', error);
            throw error;
        }
    },
    
    // Extract key sections from CV text using basic heuristics
    extractSections(text) {
        // This is a simplified implementation - a real one would use NLP
        // to better identify sections and their contents
        const sections = {};
        
        // Look for common CV section headers
        const possibleSections = [
            { name: 'contact', patterns: ['contact', 'personal details', 'personal information', 'email', 'phone', 'address'] },
            { name: 'summary', patterns: ['summary', 'profile', 'objective', 'professional summary', 'about me', 'career objective'] },
            { name: 'experience', patterns: ['experience', 'work experience', 'employment history', 'work history', 'professional experience'] },
            { name: 'education', patterns: ['education', 'academic background', 'qualifications', 'academic qualifications', 'educational background'] },
            { name: 'skills', patterns: ['skills', 'technical skills', 'core competencies', 'key skills', 'professional skills', 'expertise'] },
            { name: 'certifications', patterns: ['certifications', 'certificates', 'professional certifications', 'accreditations'] },
            { name: 'languages', patterns: ['languages', 'language proficiency', 'language skills'] },
            { name: 'projects', patterns: ['projects', 'key projects', 'professional projects'] },
            { name: 'awards', patterns: ['awards', 'honors', 'achievements', 'recognitions'] },
            { name: 'references', patterns: ['references', 'referees'] }
        ];
        
        // Simple algorithm to find sections
        // This is not robust but provides a starting point
        const lines = text.split('\n');
        let currentSection = 'other';
        sections[currentSection] = [];
        
        for (const line of lines) {
            const lowerLine = line.toLowerCase().trim();
            
            // Skip empty lines
            if (!lowerLine) continue;
            
            // Check if this line could be a section header
            let foundHeader = false;
            for (const section of possibleSections) {
                if (section.patterns.some(pattern => lowerLine.includes(pattern))) {
                    currentSection = section.name;
                    sections[currentSection] = sections[currentSection] || [];
                    foundHeader = true;
                    break;
                }
            }
            
            if (!foundHeader) {
                sections[currentSection].push(line.trim());
            }
        }
        
        return sections;
    },
    
    // Generate structured HTML from PDF sections
    generateStructuredHTMLFromSections(filename, sections, fullText) {
        try {
            // Extract name from filename as a fallback
            const nameFromFile = filename.split('.')[0].replace(/[-_]/g, ' ');
            
            // Try to extract name from contact section or first few lines
            let name = nameFromFile;
            if (sections.contact && sections.contact.length > 0) {
                // Usually the first line of contact is the name
                name = sections.contact[0];
            }
            
            // Build HTML structure
            let html = '<div class="document-content">';
            
            // Add name
            html += `<h1 class="text-center mb-4">${name}</h1>`;
            
            // Add contact info if found (skip the first line if it was used as name)
            if (sections.contact && sections.contact.length > 0) {
                const contactInfo = sections.contact.slice(1).filter(line => line.trim());
                html += `<p class="text-center mb-3">${contactInfo.join(' | ')}</p>`;
            }
            
            // Add professional summary
            if (sections.summary && sections.summary.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">Professional Summary</h2>';
                html += `<p>${sections.summary.join(' ')}</p>`;
            }
            
            // Add experience section with improved formatting
            if (sections.experience && sections.experience.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">Experience</h2>';
                html += '<div class="mb-3">';
                
                // Try to identify individual positions by looking for patterns
                let currentPosition = [];
                let positions = [];
                
                for (const line of sections.experience) {
                    // If line might be a new position title (contains year or common job title words)
                    const hasYear = /\b(19|20)\d{2}\b/.test(line);
                    const isJobTitle = /\b(manager|engineer|developer|specialist|director|assistant|coordinator|analyst)\b/i.test(line);
                    
                    if ((hasYear || isJobTitle) && currentPosition.length > 0) {
                        positions.push([...currentPosition]);
                        currentPosition = [line];
                    } else {
                        currentPosition.push(line);
                    }
                }
                
                // Add the last position
                if (currentPosition.length > 0) {
                    positions.push(currentPosition);
                }
                
                // If we identified positions, format them; otherwise just output lines
                if (positions.length > 0) {
                    for (const position of positions) {
                        html += '<div class="position mb-4">';
                        html += `<h3 class="h5 mb-1">${position[0]}</h3>`;
                        html += position.slice(1).map(line => `<p class="mb-1">${line}</p>`).join('');
                        html += '</div>';
                    }
                } else {
                    html += sections.experience.map(line => `<p class="mb-2">${line}</p>`).join('');
                }
                
                html += '</div>';
            }
            
            // Add education section with improved formatting
            if (sections.education && sections.education.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">Education</h2>';
                html += '<div class="mb-3">';
                
                // Try to identify individual education entries
                let currentEducation = [];
                let educationEntries = [];
                
                for (const line of sections.education) {
                    // If line might be a new education entry (contains year or degree keywords)
                    const hasYear = /\b(19|20)\d{2}\b/.test(line);
                    const isDegree = /\b(bachelor|master|phd|degree|diploma|certificate)\b/i.test(line);
                    
                    if ((hasYear || isDegree) && currentEducation.length > 0) {
                        educationEntries.push([...currentEducation]);
                        currentEducation = [line];
                    } else {
                        currentEducation.push(line);
                    }
                }
                
                // Add the last entry
                if (currentEducation.length > 0) {
                    educationEntries.push(currentEducation);
                }
                
                // Format education entries
                if (educationEntries.length > 0) {
                    for (const entry of educationEntries) {
                        html += '<div class="education-entry mb-3">';
                        html += `<h3 class="h5 mb-1">${entry[0]}</h3>`;
                        html += entry.slice(1).map(line => `<p class="mb-1">${line}</p>`).join('');
                        html += '</div>';
                    }
                } else {
                    html += sections.education.map(line => `<p class="mb-2">${line}</p>`).join('');
                }
                
                html += '</div>';
            }
            
            // Add skills section with improved grid layout
            if (sections.skills && sections.skills.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">Skills</h2>';
                
                // Extract individual skills by splitting on common delimiters
                let skills = [];
                for (const line of sections.skills) {
                    // Split by commas, bullets, or multiple spaces
                    const extractedSkills = line.split(/[,•]|\s{2,}/).map(s => s.trim()).filter(s => s);
                    if (extractedSkills.length > 1) {
                        skills = skills.concat(extractedSkills);
                    } else {
                        skills.push(line);
                    }
                }
                
                html += '<div class="skills-list row">';
                // Split skills into two columns
                for (const skill of skills) {
                    if (skill.trim()) {
                        html += `<div class="col-md-6 col-lg-4 mb-2"><span class="badge bg-light text-dark p-2 mb-2">${skill}</span></div>`;
                    }
                }
                html += '</div>';
            }
            
            // Add certifications section if found
            if (sections.certifications && sections.certifications.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">Certifications</h2>';
                html += '<ul class="list-unstyled">';
                html += sections.certifications.map(line => `<li class="mb-2">${line}</li>`).join('');
                html += '</ul>';
            }
            
            // Add languages section if found
            if (sections.languages && sections.languages.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">Languages</h2>';
                html += '<div class="row">';
                for (const line of sections.languages) {
                    html += `<div class="col-md-6 mb-2">${line}</div>`;
                }
                html += '</div>';
            }
            
            // Add projects section if found
            if (sections.projects && sections.projects.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">Projects</h2>';
                
                // Try to identify individual projects
                let currentProject = [];
                let projects = [];
                
                for (const line of sections.projects) {
                    if (line.trim().endsWith(':') && currentProject.length > 0) {
                        projects.push([...currentProject]);
                        currentProject = [line];
                    } else {
                        currentProject.push(line);
                    }
                }
                
                // Add the last project
                if (currentProject.length > 0) {
                    projects.push(currentProject);
                }
                
                // Format projects
                if (projects.length > 0) {
                    for (const project of projects) {
                        html += '<div class="project mb-3">';
                        html += `<h3 class="h5 mb-1">${project[0]}</h3>`;
                        html += project.slice(1).map(line => `<p class="mb-1">${line}</p>`).join('');
                        html += '</div>';
                    }
                } else {
                    html += sections.projects.map(line => `<p class="mb-2">${line}</p>`).join('');
                }
            }
            
            // Add awards section if found
            if (sections.awards && sections.awards.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">Awards & Achievements</h2>';
                html += '<ul class="list-unstyled">';
                html += sections.awards.map(line => `<li class="mb-2">${line}</li>`).join('');
                html += '</ul>';
            }
            
            // Add references section if found
            if (sections.references && sections.references.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">References</h2>';
                html += sections.references.map(line => `<p>${line}</p>`).join('');
            }
            
            // Add other content if there is any
            if (sections.other && sections.other.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">Additional Information</h2>';
                html += sections.other.map(line => `<p>${line}</p>`).join('');
            }
            
            html += '</div>';
            return html;
            
        } catch (error) {
            console.error('Error generating HTML from PDF content:', error);
            
            // Fallback to simple content display
            return this.generateStructuredHTML(filename, fullText);
        }
    },
    
    // Original method for generating structured HTML from text content
    generateStructuredHTML(filename, content) {
        try {
            // Extract name from filename as a fallback
            const nameFromFile = filename.split('.')[0].replace(/[-_]/g, ' ');
            
            // Try to extract sections using basic heuristics
            const sections = this.extractSections(content);
            
            // Build HTML structure
            let html = '<div class="document-content">';
            
            // Add name - either from content or filename
            html += `<h1 class="text-center mb-4">${nameFromFile}</h1>`;
            
            // Add contact info if found
            if (sections.contact && sections.contact.length > 0) {
                html += `<p class="text-center mb-3">${sections.contact.join(' | ')}</p>`;
            }
            
            // Add professional summary
            if (sections.summary && sections.summary.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">Professional Summary</h2>';
                html += `<p>${sections.summary.join(' ')}</p>`;
            }
            
            // Add experience section
            if (sections.experience && sections.experience.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">Experience</h2>';
                html += '<div class="mb-3">';
                html += sections.experience.map(line => `<p>${line}</p>`).join('');
                html += '</div>';
            }
            
            // Add education section
            if (sections.education && sections.education.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">Education</h2>';
                html += sections.education.map(line => `<p>${line}</p>`).join('');
            }
            
            // Add skills section
            if (sections.skills && sections.skills.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">Skills</h2>';
                html += '<div class="skills-list row">';
                // Split skills into two columns
                for (const skill of sections.skills) {
                    if (skill.trim()) {
                        html += `<div class="col-md-6"><span>${skill}</span></div>`;
                    }
                }
                html += '</div>';
            }
            
            // Add certifications section if found
            if (sections.certifications && sections.certifications.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">Certifications</h2>';
                html += sections.certifications.map(line => `<p>${line}</p>`).join('');
            }
            
            // Add languages section if found
            if (sections.languages && sections.languages.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">Languages</h2>';
                html += sections.languages.map(line => `<p>${line}</p>`).join('');
            }
            
            // Add projects section if found
            if (sections.projects && sections.projects.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">Projects</h2>';
                html += sections.projects.map(line => `<p>${line}</p>`).join('');
            }
            
            // Add awards section if found
            if (sections.awards && sections.awards.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">Awards & Achievements</h2>';
                html += sections.awards.map(line => `<p>${line}</p>`).join('');
            }
            
            // Add references section if found
            if (sections.references && sections.references.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">References</h2>';
                html += sections.references.map(line => `<p>${line}</p>`).join('');
            }
            
            // Add other content if there is any
            if (sections.other && sections.other.length > 0) {
                html += '<h2 class="mt-4 border-bottom pb-2">Additional Information</h2>';
                html += sections.other.map(line => `<p>${line}</p>`).join('');
            }
            
            html += '</div>';
            return html;
            
        } catch (error) {
            console.error('Error generating HTML from content:', error);
            
            // Fallback to simple content display
            return `<div class="document-content">
                <h1 class="text-center mb-4">${filename}</h1>
                <pre class="text-wrap">${content}</pre>
            </div>`;
        }
    }
};

// Make the parser available globally
window.CVParser = CVParser;