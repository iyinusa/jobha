import os
import requests
import logging
import json
import asyncio
import time
from typing import Dict, Any, Optional, List, Callable, Awaitable
from datetime import datetime

from services.database.json_db import db  # Import the singleton database instance

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
    
    def search_jobs(self, keywords: List[str], doc_id: str, callback: Optional[Callable] = None) -> Optional[List[Dict[str, Any]]]:
        """
        Search for jobs using Perplexity Sonar Deep Research API based on CV keywords.
        
        Args:
            keywords: List of keywords extracted from the CV
            doc_id: Document ID to associate the search results with
            callback: Optional callback function for streaming results
            
        Returns:
            List of job postings found or None if search failed
        """
        if not self.api_key:
            logger.error("Cannot search jobs: Perplexity API key not found")
            return None
            
        if not keywords:
            logger.error("Cannot search jobs: No keywords provided")
            return None
            
        try:
            # Load websites from the JSON file - adjust path for data folder location
            data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
            websites_path = os.path.join(data_dir, "websites.json")
            
            try:
                with open(websites_path, 'r') as f:
                    websites = json.load(f)
                    logger.info(f"Loaded {len(websites)} websites from {websites_path}")
            except (FileNotFoundError, json.JSONDecodeError) as e:
                logger.warning(f"Error loading websites.json: {str(e)}")
                websites = ["indeed.com", "glassdoor.com"]  # Default fallback
                
            if not websites:
                logger.warning("No websites found in websites.json")
                websites = ["indeed.com", "glassdoor.com"]  # Default fallback
                
            # Join keywords with OR for more comprehensive search
            search_query = " ".join(keywords[:10])  # Limit to top 10 keywords
            
            # Prepare the prompt for the model
            prompt = self._create_job_search_prompt(search_query)
            
            # Call the Perplexity API with deep research model
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "model": self.R_MODEL,  # Use the deep research model
                "messages": [
                    {"role": "system", "content": "You are a job search expert. Find open job positions that match the provided skills and keywords."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.2,  # Low temperature for more focused results
                "search_domain_filter": websites,  # Restrict search to these domains
                "search_context_size": "high",  # High context size for better results
            }
            
            logger.info(f"Making job search request to Perplexity API with keywords: {search_query}")
            response = requests.post(self.API_URL, headers=headers, json=payload)
            
            if response.status_code != 200:
                logger.error(f"API Error: {response.status_code} - {response.text}")
                return None
                
            # Parse the response
            response_data = response.json()
            extracted_text = response_data.get("choices", [{}])[0].get("message", {}).get("content", "")
            
            # Process the extracted text into structured data
            result = self._process_job_search_response(extracted_text, doc_id)
            
            # If callback provided, send jobs in batches for streaming
            if callback and result:
                batch_size = 5  # Send jobs in batches of 5
                for i in range(0, len(result), batch_size):
                    batch = result[i:i + batch_size]
                    is_final_batch = (i + batch_size) >= len(result)
                    callback(batch, is_complete=is_final_batch)
                    
                    # Small delay between batches for better streaming effect
                    if not is_final_batch:
                        time.sleep(0.5)
            elif callback:
                # No results found
                callback([], is_complete=True)
            
            # Save results to database using the JsonDatabase singleton
            db.save_document_jobs(doc_id, result)
            
            logger.info(f"Saved {len(result)} job results for document {doc_id}")
            
            return result
        except Exception as e:
            logger.error(f"Error searching jobs with Perplexity API: {str(e)}")
            if callback:
                callback([], is_complete=True, error=str(e))
            return None

    async def search_jobs_async(self, keywords: List[str], doc_id: str, callback: Callable) -> None:
        """
        Async version of job search that supports streaming results via callback.
        
        Args:
            keywords: List of keywords extracted from the CV
            doc_id: Document ID to associate the search results with
            callback: Callback function to receive streaming results
        """
        try:
            # Run the synchronous search_jobs in a thread pool
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                self.search_jobs,
                keywords,
                doc_id,
                callback
            )
        except Exception as e:
            logger.error(f"Error in async job search: {str(e)}")
            callback([], is_complete=True, error=str(e))
    
    def create_tailored_cv(self, cv_content: str, cv_keywords: Dict[str, Any], job_details: Dict[str, Any], doc_id: str) -> Optional[Dict[str, Any]]:
        """
        Create a tailored CV for a specific job using the Perplexity API.
        
        Args:
            cv_content: The original CV content
            cv_keywords: The extracted keywords and information from the CV
            job_details: The job details to tailor the CV for
            doc_id: Document ID to associate the tailored CV with
            
        Returns:
            Dictionary containing the tailored CV content or None if generation failed
        """
        if not self.api_key:
            logger.error("Cannot create tailored CV: Perplexity API key not found")
            return None
            
        if not cv_content or not job_details:
            logger.error("Cannot create tailored CV: Missing CV content or job details")
            return None
            
        try:
            # Prepare the prompt for the model
            prompt = self._create_tailored_cv_prompt(cv_content, cv_keywords, job_details)
            
            # Call the Perplexity API
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "model": self.MODEL,
                "messages": [
                    {"role": "system", "content": "You are an expert CV and resume writer. Create a tailored CV that highlights relevant skills and experience for a specific job."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7,  # Higher temperature for creative content
            }
            
            logger.info("Making request to Perplexity API to create tailored CV")
            response = requests.post(self.API_URL, headers=headers, json=payload)
            
            if response.status_code != 200:
                logger.error(f"API Error: {response.status_code} - {response.text}")
                return None
                
            # Parse the response
            response_data = response.json()
            tailored_cv = response_data.get("choices", [{}])[0].get("message", {}).get("content", "")
            
            if not tailored_cv:
                logger.error("Empty response from Perplexity API")
                return None
            
            # Create result object
            result = {
                "doc_id": doc_id,
                "job_id": job_details.get("id") or job_details.get("job_id"),
                "company": job_details.get("company"),
                "job_title": job_details.get("title"),
                "content": tailored_cv,
                "created_at": datetime.now().isoformat()
            }
            
            # Save to database
            db.save_tailored_cv(doc_id, job_details.get("id") or job_details.get("job_id"), result)
            
            return result
        except Exception as e:
            logger.error(f"Error creating tailored CV: {str(e)}")
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
    
    def _create_job_search_prompt(self, search_query: str) -> str:
        """
        Create a prompt for the Perplexity API to search for jobs.
        """
        return f"""
        Search for current open job positions matching the following skills and keywords:
        
        {search_query}
        
        Focus only on active, open job listings. Ignore any closed positions.
        For each job listing found, extract and format your response as structured JSON with these fields:
        1. title: Job title
        2. company: Company name
        3. location: Job location (including remote options)
        4. description: Full job description in HTML format for easy display
        5. requirements: List of key requirements for the position
        6. match_score: A percentage (1-100) indicating how well this job matches the provided keywords, based on your analysis
        7. url: Direct link to the job posting
        8. date_posted: When the job was posted, if available
        9. salary: Salary information, if available (can be null)
        
        Return exactly 25 jobs, prioritizing the best matches. Format your response as a valid JSON array of job objects.
        Your response should be valid JSON that can be parsed directly, with no other text before or after.
        """
    
    def _create_tailored_cv_prompt(self, cv_content: str, cv_keywords: Dict[str, Any], job_details: Dict[str, Any]) -> str:
        """
        Create a prompt for the Perplexity API to generate a tailored CV.
        """
        job_title = job_details.get("title", "")
        company = job_details.get("company", "")
        job_description = job_details.get("description", "")
        requirements = job_details.get("requirements", [])
        
        skills = cv_keywords.get("skills", [])
        experiences = cv_keywords.get("job_titles", [])
        achievements = cv_keywords.get("key_achievements", [])
        education = [f"{cv_keywords.get('education_level')} in {cv_keywords.get('education_field')}"] if cv_keywords.get('education_level') and cv_keywords.get('education_field') else []
        
        req_text = "\n".join(f"- {req}" for req in requirements) if isinstance(requirements, list) else requirements
        
        return f"""
        I need you to create a professionally formatted and tailored CV/Resume for the following job:
        
        JOB TITLE: {job_title}
        COMPANY: {company}
        
        JOB DESCRIPTION:
        ```
        {job_description}
        ```
        
        JOB REQUIREMENTS:
        ```
        {req_text}
        ```
        
        Here is the candidate's original CV:
        ```
        {cv_content}
        ```
        
        Key information from the CV:
        - Skills: {", ".join(skills) if skills else "N/A"}
        - Previous Positions: {", ".join(experiences) if experiences else "N/A"}
        - Education: {", ".join(education) if education else "N/A"}
        - Achievements: {", ".join(achievements) if achievements else "N/A"}
        
        Create a well-structured HTML formatted CV that is specifically tailored for this job position. The CV should:
        1. Highlight the candidate's skills and experiences that best match the job requirements
        2. Use clean HTML formatting with <section>, <h2>, <h3>, <ul>, <li>, <p> tags for structure
        3. Be organized into standard sections (Profile, Experience, Education, Skills)
        4. Include a brief professional summary at the top
        5. Use bullet points for achievements and responsibilities
        6. Be ready to display directly in a webpage
        
        Only return the HTML formatted CV, nothing else.
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
    
    def _process_job_search_response(self, response_text: str, doc_id: str) -> List[Dict[str, Any]]:
        """
        Process the job search API response text into structured data.
        """
        # Default empty list for jobs
        default_result = []
        
        try:
            logger.info(f"Raw job search response text preview: {response_text[:100]}...")  # Log first 100 chars
            
            if not response_text or response_text.strip() == "":
                logger.error("Empty response text received from job search")
                return default_result
                
            # Extract JSON part from the response
            json_content = self._extract_json_from_text(response_text)
            
            if not json_content:
                logger.error("Could not extract JSON content from job search response")
                return default_result
                
            # Parse the JSON
            logger.info(f"Attempting to parse JSON content: {json_content[:100]}...")
            if not json_content.strip():
                logger.error("Empty JSON content after extraction")
                return default_result
                
            parsed_result = json.loads(json_content)
            
            # Ensure result is a list
            if not isinstance(parsed_result, list):
                if isinstance(parsed_result, dict) and "jobs" in parsed_result:
                    parsed_result = parsed_result["jobs"]
                else:
                    logger.error("Invalid job search response format")
                    return default_result
            
            # Add document ID and timestamp to each job
            for job in parsed_result:
                job["doc_id"] = doc_id
                job["search_timestamp"] = datetime.now().isoformat()
                
                # Ensure match_score is an integer percentage
                if "match_score" in job and isinstance(job["match_score"], str):
                    try:
                        # Extract numbers from strings like "90%" to just 90
                        job["match_score"] = int(job["match_score"].strip("%"))
                    except (ValueError, TypeError):
                        job["match_score"] = 0
            
            return parsed_result
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON from job search response: {e}")
            return default_result
        except Exception as e:
            logger.error(f"Error processing job search response: {str(e)}")
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
            logger.warning("Empty text provided to JSON extraction")
            return ""
            
        text = text.strip()
        logger.info(f"Extracting JSON from text of length {len(text)}")
        
        try:
            # Case 1: Response has <think> tags - extract everything after the last tag
            if "<think>" in text:
                parts = text.split("```json")
                if len(parts) > 1:
                    # Extract content between ```json and ```
                    json_part = parts[1].split("```")[0].strip()
                    return json_part
                    
            # Case 2: Standard markdown JSON block with ```json
            if "```json" in text.lower():
                parts = text.split("```json", 1)  # Split on first occurrence only
                if len(parts) > 1:
                    # Extract content between ```json and ```
                    json_part = parts[1].split("```", 1)[0].strip()
                    logger.info(f"Found JSON in markdown block: {json_part[:50]}...")
                    return json_part
                    
            # Case 3: Generic code block with ```
            if "```" in text:
                parts = text.split("```", 2)  # Split into at most 3 parts to get before, content, after
                # Take the content of the first code block
                if len(parts) > 1:
                    potential_json = parts[1].strip()
                    # Try to validate if it's JSON by finding { or [ at the start
                    if potential_json.lstrip().startswith(("{", "[")):
                        logger.info(f"Found JSON in code block: {potential_json[:50]}...")
                        return potential_json
                    
            # Case 4: Direct JSON object (look for start of JSON object)
            if text.lstrip().startswith("{"):
                # Find the first { and the last } to extract complete JSON object
                start = text.find("{")
                end = text.rfind("}") + 1
                if start >= 0 and end > start:
                    json_part = text[start:end]
                    logger.info(f"Found direct JSON object: {json_part[:50]}...")
                    return json_part
                    
            # Case 5: If the response contains "json" followed by "{", extract that part
            if "json" in text.lower() and "{" in text:
                start = text.find("{")
                end = text.rfind("}") + 1
                if start >= 0 and end > start:
                    json_part = text[start:end]
                    logger.info(f"Found JSON after 'json' keyword: {json_part[:50]}...")
                    return json_part
            
            # Case 6: Check for array format
            if text.lstrip().startswith("["):
                # Find the first [ and the last ] to extract complete JSON array
                start = text.find("[")
                end = text.rfind("]") + 1
                if start >= 0 and end > start:
                    json_part = text[start:end]
                    logger.info(f"Found JSON array: {json_part[:50]}...")
                    return json_part
            
            # Case 7: Look for any JSON-like structure anywhere in the text
            import re
            # Look for patterns like [{ or { that might indicate JSON
            json_start_match = re.search(r'[\[\{]', text)
            if json_start_match:
                start_pos = json_start_match.start()
                # If we find a start bracket, extract from there to the end and hope it's valid JSON
                potential_json = text[start_pos:]
                logger.info(f"Found potential JSON using regex: {potential_json[:50]}...")
                return potential_json
                
            # If we can't definitively extract JSON, log it and return the original string
            logger.warning("Could not extract specific JSON from text, returning full text for parser to handle")
            return text
            
        except Exception as e:
            logger.error(f"Error extracting JSON from text: {str(e)}")
            # Return the original text as a fallback
            return text

# Create a singleton instance
perplexity_api = PerplexityAPI()