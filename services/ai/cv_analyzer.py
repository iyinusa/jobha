import re
from typing import List, Dict, Any
from collections import Counter

class CVAnalyzer:
    """
    Basic AI-powered analyzer for parsed CV data.
    This can be extended to use LLMs or ML models.
    """
    COMMON_SKILLS = [
        'python', 'java', 'c++', 'sql', 'javascript', 'html', 'css', 'docker', 'aws', 'azure',
        'git', 'linux', 'react', 'node', 'django', 'flask', 'fastapi', 'machine learning',
        'deep learning', 'nlp', 'data analysis', 'project management', 'leadership', 'communication'
    ]
    DEGREE_KEYWORDS = [
        'bachelor', 'master', 'phd', 'b.sc', 'm.sc', 'b.eng', 'm.eng', 'doctorate', 'degree', 'diploma'
    ]
    EXPERIENCE_PATTERNS = [
        r'(\d+)\+?\s*(years|yrs)'
    ]

    def analyze(self, parsed_cv: Dict[str, Any]) -> Dict[str, Any]:
        text = parsed_cv.get('raw_text', '')
        skills = self.extract_skills(text)
        experience = self.estimate_experience(text)
        education = self.estimate_education(text)
        suggestions = self.suggest_improvements(parsed_cv, skills)
        return {
            'key_skills': skills,
            'experience_years': experience,
            'education_level': education,
            'suggested_improvements': suggestions,
            'match_score': self.estimate_match_score(skills)
        }

    def extract_skills(self, text: str) -> List[str]:
        found = []
        text_lower = text.lower()
        for skill in self.COMMON_SKILLS:
            if skill in text_lower:
                found.append(skill)
        return found

    def estimate_experience(self, text: str) -> str:
        for pattern in self.EXPERIENCE_PATTERNS:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return f"{match.group(1)} years"
        # Fallback: count number of jobs/positions
        lines = text.split('\n')
        job_titles = [l for l in lines if re.search(r'(engineer|developer|manager|analyst|specialist|lead|director)', l, re.IGNORECASE)]
        if len(job_titles) > 1:
            return f"{len(job_titles)-1}+ years (estimated)"
        return "Not specified"

    def estimate_education(self, text: str) -> str:
        for keyword in self.DEGREE_KEYWORDS:
            if keyword in text.lower():
                return keyword.capitalize()
        return "Not specified"

    def suggest_improvements(self, parsed_cv: Dict[str, Any], skills: List[str]) -> List[str]:
        suggestions = []
        if not parsed_cv.get('summary'):
            suggestions.append("Add a professional summary section.")
        if not parsed_cv.get('skills'):
            suggestions.append("List your key skills explicitly.")
        if len(skills) < 3:
            suggestions.append("Highlight more technical or soft skills relevant to your field.")
        if not parsed_cv.get('experience'):
            suggestions.append("Add work experience details.")
        if not parsed_cv.get('education'):
            suggestions.append("Include your education background.")
        return suggestions

    def estimate_match_score(self, skills: List[str]) -> int:
        # Placeholder: score based on number of recognized skills
        return min(100, 50 + len(skills) * 5)