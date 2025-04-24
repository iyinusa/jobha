import logging
import re
from typing import Dict, List, Any, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

# Define common section patterns
SECTION_PATTERNS = {
    'contact': ['contact', 'personal details', 'personal information', 'email', 'phone', 'address'],
    'summary': ['summary', 'profile', 'objective', 'professional summary', 'about me', 'career objective'],
    'experience': ['experience', 'work experience', 'employment history', 'work history', 'professional experience'],
    'education': ['education', 'academic background', 'qualifications', 'academic qualifications', 'educational background'],
    'skills': ['skills', 'technical skills', 'core competencies', 'key skills', 'professional skills', 'expertise'],
    'certifications': ['certifications', 'certificates', 'professional certifications', 'accreditations'],
    'languages': ['languages', 'language proficiency', 'language skills'],
    'projects': ['projects', 'key projects', 'professional projects'],
    'awards': ['awards', 'honors', 'achievements', 'recognitions'],
    'references': ['references', 'referees']
}


def _score_line_as_header(line: str) -> int:
    """
    Score a line based on its likelihood of being a section header
    
    Args:
        line: The line to score
        
    Returns:
        int: The header score
    """
    score = 0
    
    # Headers are often short
    if len(line) < 30:
        score += 1
        
    # Headers are often all caps or title case
    if line.isupper():
        score += 2
    elif line[0].isupper():
        score += 1
        
    # Headers often end with colons
    if line.endswith(':'):
        score += 2
        
    # Check if line matches any known section patterns
    for section, patterns in SECTION_PATTERNS.items():
        if any(pattern in line.lower() for pattern in patterns):
            score += 3
            break
            
    return score


def extract_sections(text: str) -> Dict[str, List[str]]:
    """
    Extract sections from CV text using pattern matching and heuristics
    
    Args:
        text: The CV text content
        
    Returns:
        Dict[str, List[str]]: Dictionary mapping section names to content
    """
    # Initialize sections
    sections = {'other': []}
    
    # Split text into lines
    lines = text.split('\n')
    
    # First identify potential section headers
    potential_headers = []
    
    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
            
        # Calculate header score
        score = _score_line_as_header(line)
        
        # If line has a high score, consider it a potential header
        if score >= 3:
            potential_headers.append({
                'index': i,
                'line': line,
                'score': score
            })
    
    # Sort headers by score (highest first)
    potential_headers.sort(key=lambda h: h['score'], reverse=True)
    
    # If we identified potential headers, extract content between them
    if potential_headers:
        for i, header in enumerate(potential_headers):
            # Determine section name
            section_name = 'other'
            for name, patterns in SECTION_PATTERNS.items():
                if any(pattern in header['line'].lower() for pattern in patterns):
                    section_name = name
                    break
            
            # Get content for this section (from this header to next header)
            next_header = potential_headers[i+1] if i < len(potential_headers) - 1 else None
            start_idx = header['index'] + 1
            end_idx = next_header['index'] if next_header else len(lines)
            
            # Extract section content
            content = [line.strip() for line in lines[start_idx:end_idx] if line.strip()]
            
            # Add content to section
            if section_name not in sections:
                sections[section_name] = []
            sections[section_name].extend(content)
        
        # Extract contact info from the top of the document (before first header)
        if potential_headers:
            first_header = min(potential_headers, key=lambda h: h['index'])
            contact_lines = [line.strip() for line in lines[:first_header['index']] if line.strip()]
            
            if contact_lines:
                sections['contact'] = sections.get('contact', []) + contact_lines
    else:
        # If no headers found, use simple pattern matching
        current_section = 'other'
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            # Check if this could be a section header
            found_header = False
            for section, patterns in SECTION_PATTERNS.items():
                if any(pattern in line.lower() for pattern in patterns):
                    current_section = section
                    if current_section not in sections:
                        sections[current_section] = []
                    found_header = True
                    break
                    
            # If not a header, add to current section
            if not found_header:
                sections[current_section].append(line)
    
    # If we don't have meaningful sections, extract contact info from beginning
    has_meaningful_sections = any(key != 'other' and sections[key] for key in sections)
    if not has_meaningful_sections and len(lines) > 0:
        # Take first few non-empty lines as contact info
        contact_lines = [line.strip() for line in lines[:10] if line.strip()]
        if contact_lines:
            sections['contact'] = contact_lines
    
    return sections


def generate_html(filename: str, sections: Dict[str, List[str]], full_text: str) -> str:
    """
    Generate structured HTML from parsed sections
    
    Args:
        filename: Original filename
        sections: Dictionary of sections extracted from the document
        full_text: The full text of the document
        
    Returns:
        str: HTML representation of the document
    """
    try:
        # Extract name from filename or contact section
        name = Path(filename).stem.replace('_', ' ').replace('-', ' ')
        if sections.get('contact') and len(sections['contact']) > 0:
            name = sections['contact'][0]
            
        # Start HTML structure
        html = '<div class="cv-document">'
        
        # Add header with name
        html += '<div class="cv-header">'
        html += f'<div class="cv-name">{name}</div>'
        
        # Add contact info
        if sections.get('contact') and len(sections['contact']) > 0:
            html += '<div class="cv-contact">'
            
            # Skip the first line if it was used as name
            contact_info = sections['contact'][1:] if len(sections['contact']) > 1 else []
            
            for item in contact_info:
                # Determine icon based on content
                icon = 'fas fa-info-circle'  # default
                
                # Email pattern
                if re.match(r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$', item):
                    icon = 'fas fa-envelope'
                # Phone pattern
                elif re.match(r'^\+?[0-9\s\-()]{7,}$', item):
                    icon = 'fas fa-phone'
                # Social media/website pattern
                elif re.search(r'linkedin\.com|github\.com|twitter\.com|facebook\.com', item):
                    icon = 'fas fa-link'
                # URL pattern
                elif re.match(r'^https?://', item):
                    icon = 'fas fa-globe'
                # Address pattern (basic)
                elif re.search(r'[A-Za-z]+,\s*[A-Za-z]+', item):
                    icon = 'fas fa-map-marker-alt'
                    
                html += f'<div class="cv-contact-item"><i class="{icon}"></i> {item}</div>'
                
            html += '</div>'  # End cv-contact
        html += '</div>'  # End cv-header
        
        # Add summary section
        if sections.get('summary') and len(sections['summary']) > 0:
            html += '<div class="cv-section">'
            html += '<h2 class="cv-section-title">Professional Summary</h2>'
            html += '<div class="cv-summary">'
            html += f'<p>{" ".join(sections["summary"])}</p>'
            html += '</div></div>'
            
        # Add experience section
        if sections.get('experience') and len(sections['experience']) > 0:
            html += '<div class="cv-section">'
            html += '<h2 class="cv-section-title">Experience</h2>'
            
            # Process experience entries
            html += '<div class="cv-experience-items">'
            
            for line in sections['experience']:
                html += f'<div class="cv-experience-item">{line}</div>'
                
            html += '</div>'  # End experience items
            html += '</div>'  # End cv-section
            
        # Add education section
        if sections.get('education') and len(sections['education']) > 0:
            html += '<div class="cv-section">'
            html += '<h2 class="cv-section-title">Education</h2>'
            
            # Process education entries
            html += '<div class="cv-education-items">'
            
            for line in sections['education']:
                html += f'<div class="cv-education-item">{line}</div>'
                
            html += '</div>'  # End education items
            html += '</div>'  # End cv-section
            
        # Add skills section
        if sections.get('skills') and len(sections['skills']) > 0:
            html += '<div class="cv-section">'
            html += '<h2 class="cv-section-title">Skills</h2>'
            html += '<div class="cv-skills">'
            
            # Process skills, splitting by commas if needed
            all_skills = []
            for skill_line in sections['skills']:
                if ',' in skill_line:
                    all_skills.extend([s.strip() for s in skill_line.split(',') if s.strip()])
                else:
                    all_skills.append(skill_line)
                    
            for skill in all_skills:
                html += f'<div class="cv-skill">{skill}</div>'
                
            html += '</div>'  # End skills
            html += '</div>'  # End cv-section
            
        # Add certifications section
        if sections.get('certifications') and len(sections['certifications']) > 0:
            html += '<div class="cv-section">'
            html += '<h2 class="cv-section-title">Certifications</h2>'
            html += '<ul class="cv-certifications-list">'
            
            for cert in sections['certifications']:
                html += f'<li>{cert}</li>'
                
            html += '</ul>'
            html += '</div>'  # End cv-section
            
        # Add languages section
        if sections.get('languages') and len(sections['languages']) > 0:
            html += '<div class="cv-section">'
            html += '<h2 class="cv-section-title">Languages</h2>'
            html += '<div class="cv-languages">'
            
            for lang in sections['languages']:
                # Check if format is "Language: Proficiency"
                parts = re.split(r'[:–-]', lang, 1)
                if len(parts) > 1:
                    lang_name = parts[0].strip()
                    proficiency = parts[1].strip()
                    html += f'<div class="cv-language-item"><span class="cv-language-name">{lang_name}:</span> <span class="cv-language-level">{proficiency}</span></div>'
                else:
                    html += f'<div class="cv-language-item"><span class="cv-language-name">{lang}</span></div>'
            
            html += '</div>'  # End languages
            html += '</div>'  # End cv-section
            
        # Add projects section
        if sections.get('projects') and len(sections['projects']) > 0:
            html += '<div class="cv-section">'
            html += '<h2 class="cv-section-title">Projects</h2>'
            
            for project in sections['projects']:
                html += f'<div class="cv-projects-item"><div class="cv-project-title">{project}</div></div>'
                
            html += '</div>'  # End cv-section
            
        # Add awards section
        if sections.get('awards') and len(sections['awards']) > 0:
            html += '<div class="cv-section">'
            html += '<h2 class="cv-section-title">Awards & Achievements</h2>'
            html += '<ul class="cv-awards-list">'
            
            for award in sections['awards']:
                html += f'<li>{award}</li>'
                
            html += '</ul>'
            html += '</div>'  # End cv-section
            
        # Add references section
        if sections.get('references') and len(sections['references']) > 0:
            html += '<div class="cv-section">'
            html += '<h2 class="cv-section-title">References</h2>'
            html += '<div class="cv-references">'
            
            for ref in sections['references']:
                html += f'<div class="cv-reference-item">{ref}</div>'
                
            html += '</div>'  # End references
            html += '</div>'  # End cv-section
            
        # Add other content
        if sections.get('other') and len(sections['other']) > 0:
            html += '<div class="cv-section">'
            html += '<h2 class="cv-section-title">Additional Information</h2>'
            html += '<div class="cv-additional-info">'
            
            for line in sections['other']:
                html += f'<p>{line}</p>'
                
            html += '</div>'  # End additional info
            html += '</div>'  # End cv-section
            
        html += '</div>'  # End cv-document
        return html
        
    except Exception as e:
        logger.error(f"Error generating HTML: {str(e)}", exc_info=True)
        
        # Return simple fallback HTML
        return f"""
        <div class="document-content">
            <h1 class="text-center mb-4">{filename}</h1>
            <pre class="text-wrap">{full_text}</pre>
        </div>
        """