import os
import requests
import logging
import json
from typing import Dict, Any, Optional
from datetime import datetime

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PerplexityAPI:
    """
    Service to interact with Perplexity's Soner model API
    for extracting information from CV documents.
    """
    API_URL = "https://api.perplexity.ai/chat/completions"
    MODEL = "sonar-reasoning-pro"  # Sonar Reasoning Pro model
    R_MODEL = "sonar-deep-research"  # Sonar Deep Research model
    
    def __init__(self):
        # Get API key from environment variable
        self.api_key = os.getenv("PERPLEXITY_API_KEY")
        if not self.api_key:
            logger.warning("PERPLEXITY_API_KEY environment variable not found")
    
    def analyze_cv(self, cv_content: str) -> Optional[Dict[str, Any]]:
        """
        Analyze a CV document using Perplexity API and extract relevant information.
        
        Args:
            cv_content: The text content of the CV document
            
        Returns:
            Dictionary containing extracted information or None if analysis failed
        """
        if not self.api_key:
            logger.error("Cannot analyze CV: Perplexity API key not found")
            return None
            
        if not cv_content or cv_content.strip() == "":
            logger.error("Cannot analyze empty CV content")
            return None
            
        try:
            # Prepare the prompt for the model
            prompt = self._create_analysis_prompt(cv_content)
            
            # Call the Perplexity API
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "model": self.MODEL,
                "messages": [
                    {"role": "system", "content": "You are a CV analysis expert. Extract key information from the CV provided, and return a structured data."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.1,  # Low temperature for more deterministic output
                # "max_tokens": 1000
            }
            
            logger.info("Making request to Perplexity API")
            response = requests.post(self.API_URL, headers=headers, json=payload)
            
            if response.status_code != 200:
                logger.error(f"API Error: {response.status_code} - {response.text}")
                return None
                
            # Parse the response
            response_data = response.json()
            extracted_text = response_data.get("choices", [{}])[0].get("message", {}).get("content", "")
            
            # Process the extracted text into structured data
            result = self._process_response(extracted_text)
            
            # Add timestamp to the result
            result["analyzed_at"] = datetime.now().isoformat()
            
            return result
        except Exception as e:
            logger.error(f"Error analyzing CV with Perplexity API: {str(e)}")
            return None
    
    def _create_analysis_prompt(self, cv_content: str) -> str:
        """
        Create a prompt for the Perplexity API to analyze a CV document.
        """
        # Truncate CV content if too long
        # max_content_length = 25000
        # if len(cv_content) > max_content_length:
        #     cv_content = cv_content[:max_content_length] + "... [content truncated]"
        
        return f"""
        Analyze this CV/resume and extract the following information in a structured JSON format:
        
        CV CONTENT:
        ```
        {cv_content}
        ```
        
        Extract and format your response as structured JSON with these fields:
        1. skills: Array of technical and soft skills found in the CV
        2. job_titles: Array of past job titles/positions
        3. industries: Array of industries the person has worked in
        4. years_experience: Estimated total years of professional experience
        5. education_level: Highest education level achieved
        6. education_field: Field(s) of study
        7. certifications: Array of professional certifications mentioned
        8. languages: Array of languages the person speaks
        9. key_achievements: Array of notable achievements or projects
        10. job_search_keywords: Suggested keywords for job searches based on this CV
        
        Your response should be valid JSON that can be parsed directly, with no other text before or after. If you cannot determine a value for a field, use an appropriate empty value (empty array or null).
        """
    
    def _process_response(self, response_text: str) -> Dict[str, Any]:
        """
        Process the API response text into structured data.
        Attempts to extract valid JSON from various response formats.
        Handles cases where JSON might be preceded by thinking text,
        embedded in markdown code blocks, or returned directly.
        """
        # Default structure for result
        default_result = {
            "skills": [],
            "job_titles": [],
            "industries": [],
            "years_experience": None,
            "education_level": None,
            "education_field": None,
            "certifications": [],
            "languages": [],
            "key_achievements": [],
            "job_search_keywords": []
        }
        
        try:
            logger.debug(f"Raw response text: {response_text[:200]}...")  # Log first 200 chars for debugging
            
            # Extract just the JSON part from the response
            json_content = self._extract_json_from_text(response_text)
            
            if not json_content:
                logger.error("Could not extract JSON content from response")
                return default_result
                
            # Parse the JSON
            parsed_result = json.loads(json_content)
            
            # Merge with defaults to ensure all expected fields are present
            # but give priority to values from the API response
            result = {**default_result, **parsed_result}
            
            return result
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON from API response: {e}")
            return default_result
        except Exception as e:
            logger.error(f"Error processing response: {str(e)}")
            return default_result
    
    def _extract_json_from_text(self, text: str) -> str:
        """
        Extract JSON content from text that may include other content.
        Handles various formats including thinking text, markdown code blocks, etc.
        
        Args:
            text: Raw text from API response
            
        Returns:
            Extracted JSON string or empty string if no JSON found
        """
        if not text:
            return ""
            
        text = text.strip()
        
        # Case 1: Response has <think> tags - extract everything after the last tag
        if "<think>" in text:
            parts = text.split("```json")
            if len(parts) > 1:
                # Extract content between ```json and ```
                json_part = parts[1].split("```")[0].strip()
                return json_part
                
        # Case 2: Standard markdown JSON block with ```json
        if "```json" in text.lower():
            parts = text.lower().split("```json")
            if len(parts) > 1:
                json_part = parts[1].split("```")[0].strip()
                return json_part
                
        # Case 3: Generic code block with ```
        if "```" in text:
            parts = text.split("```")
            # Take the content of the first code block
            if len(parts) > 1:
                return parts[1].strip()
                
        # Case 4: Direct JSON (look for start of JSON object)
        if text.lstrip().startswith("{"):
            # Find the first { and the last } to extract complete JSON object
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                return text[start:end]
                
        # Case 5: If the response contains "json" followed by "{", extract that part
        if "json" in text.lower() and "{" in text:
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                return text[start:end]
        
        # If we can't definitively extract JSON, return the original string
        # and let the JSON parser try to handle it
        return text

# Create a singleton instance
perplexity_api = PerplexityAPI()