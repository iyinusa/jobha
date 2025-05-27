import os
import requests
import logging
import json
from typing import Dict, Any, Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, RootModel

from services.database.json_db import db  # Import the singleton database instance

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Define Pydantic models for structured output
class CVAnalysisFormat(BaseModel):
    """Schema for CV analysis response format"""
    skills: List[str] = Field(default_factory=list, description="Technical and soft skills found in the CV")
    job_titles: List[str] = Field(default_factory=list, description="Past job titles/positions")
    industries: List[str] = Field(default_factory=list, description="Industries the person has worked in")
    years_experience: Optional[int] = Field(None, description="Estimated total years of professional experience")
    education_level: Optional[str] = Field(None, description="Highest education level achieved")
    education_field: Optional[str] = Field(None, description="Field(s) of study")
    certifications: List[str] = Field(default_factory=list, description="Professional certifications mentioned")
    languages: List[str] = Field(default_factory=list, description="Languages the person speaks")
    key_achievements: List[str] = Field(default_factory=list, description="Notable achievements or projects")
    job_search_keywords: List[str] = Field(default_factory=list, description="Suggested keywords for job searches based on this CV")

class KeywordsFormat(RootModel):
    """Schema for job search keywords response format"""
    root: List[str] = Field(..., description="List of optimized job search keywords extracted from the CV")

class JobFormat(BaseModel):
    """Schema for individual job result"""
    title: str = Field(..., description="Job title (exact title from the posting)")
    company: str = Field(..., description="Company name (exact company name from the posting)")
    location: str = Field(..., description="Job location (including remote options)")
    description: str = Field(..., description="Full job description in HTML format")
    requirements: List[str] = Field(default_factory=list, description="Key requirements for the position")
    match_score: int = Field(..., description="A percentage (1-100) indicating how well this job matches the provided keywords")
    url: str = Field(..., description="Direct link to the actual job posting")
    date_posted: Optional[str] = Field(None, description="When the job was posted, if available")
    salary: Optional[str] = Field(None, description="Salary information, if available")

class JobSearchFormat(RootModel):
    """Schema for job search response format (array of jobs)"""
    root: List[JobFormat]

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
        Uses structured output format to ensure consistent response schema.
        
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
            # Call the Perplexity API with structured output format
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            # Truncate CV content if too long to avoid API limitations
            max_content_length = 25000  # 25K characters should be safe for most APIs
            truncated_content = cv_content
            if len(cv_content) > max_content_length:
                truncated_content = cv_content[:max_content_length] + "..."
                logger.info(f"CV content truncated from {len(cv_content)} to {max_content_length} characters")
            
            payload = {
                "model": self.MODEL,  # Using sonar-pro for this task
                "messages": [
                    {"role": "system", "content": "You are a CV analysis expert. Extract key information from the CV provided."},
                    {"role": "user", "content": f"""
                    Analyze this CV/resume and extract structured information:
                    
                    ```
                    {truncated_content}
                    ```
                    """}
                ],
                # "temperature": 0.1,  # Low temperature for more deterministic output
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {"schema": CVAnalysisFormat.model_json_schema()}
                }
            }
            
            logger.info("Making request to Perplexity API using structured output format")
            
            # Add a timeout to avoid hanging requests
            response = requests.post(self.API_URL, headers=headers, json=payload)
            
            if response.status_code != 200:
                logger.error(f"API Error: {response.status_code} - {response.text}")
                # Try to get more detailed error information
                try:
                    error_data = response.json()
                    error_message = error_data.get('error', {}).get('message', 'Unknown API error')
                    logger.error(f"API error details: {error_message}")
                except:
                    logger.error("Could not parse error response from API")
                return None
                
            # Parse the response - with structured format, we should get proper JSON directly
            try:
                response_data = response.json()
                result_content = response_data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
                logger.debug(f"Received response content: {result_content[:200]}...")
                
                # Extract clean JSON from response content (handling <think> sections)
                json_content = self._extract_json_from_text(result_content)
                
                # Parse the JSON response
                result = json.loads(json_content)
                
                # Validate against our model - this can fail if the API doesn't follow our schema exactly
                try:
                    validated_data = CVAnalysisFormat(**result).model_dump()
                except Exception as validation_error:
                    logger.warning(f"Validation error with API response: {str(validation_error)}")
                    
                    # Create a default structure with any values we can extract
                    validated_data = {
                        "skills": result.get("skills", []),
                        "job_titles": result.get("job_titles", []),
                        "industries": result.get("industries", []),
                        "years_experience": result.get("years_experience"),
                        "education_level": result.get("education_level"),
                        "education_field": result.get("education_field"),
                        "certifications": result.get("certifications", []),
                        "languages": result.get("languages", []),
                        "key_achievements": result.get("key_achievements", []),
                        "job_search_keywords": result.get("job_search_keywords", [])
                    }
                
                # Add timestamp to the result
                validated_data["analyzed_at"] = datetime.now().isoformat()
                
                return validated_data
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON from API response: {e}")
                logger.error(f"Response content was: {result_content[:200]}...")
                return self._create_fallback_analysis(cv_content)
            except Exception as e:
                logger.error(f"Error processing CV analysis response: {str(e)}")
                return self._create_fallback_analysis(cv_content)
                
        except requests.exceptions.Timeout:
            logger.error("Timeout while connecting to Perplexity API")
            return self._create_fallback_analysis(cv_content)
        except requests.exceptions.ConnectionError:
            logger.error("Connection error while connecting to Perplexity API")
            return self._create_fallback_analysis(cv_content)
        except Exception as e:
            logger.error(f"Error analyzing CV with Perplexity API: {str(e)}")
            return self._create_fallback_analysis(cv_content)

    def _create_fallback_analysis(self, cv_content: str) -> Dict[str, Any]:
        """
        Create a fallback analysis when the API fails.
        Uses simple text matching to extract basic information from the CV.
        
        Args:
            cv_content: The CV text content
            
        Returns:
            A basic analysis dictionary with the required fields
        """
        logger.info("Creating fallback CV analysis using basic text matching")
        
        # Convert to lowercase for better matching
        content_lower = cv_content.lower()
        
        # Extract basic skills based on common keywords
        skills = []
        common_skills = [
            "python", "javascript", "typescript", "react", "node.js", "java", "c#", "c++",
            "sql", "nosql", "mongodb", "mysql", "postgresql", "aws", "azure", "gcp",
            "docker", "kubernetes", "git", "agile", "scrum", "project management",
            "leadership", "communication", "teamwork", "problem solving"
        ]
        
        # Check for skills in content
        for skill in common_skills:
            if skill in content_lower:
                skills.append(skill)
        
        # Extract potential job titles
        job_titles = []
        common_titles = [
            "software engineer", "developer", "programmer", "architect", "lead",
            "manager", "director", "analyst", "administrator", "designer", "consultant",
            "specialist", "technician"
        ]
        
        # Simple extraction of job titles (could be improved with regex)
        for title in common_titles:
            if title in content_lower:
                job_titles.append(title)
        
        # Basic industry detection
        industries = []
        common_industries = [
            "technology", "finance", "healthcare", "education", "retail",
            "manufacturing", "consulting", "marketing", "telecommunications"
        ]
        
        for industry in common_industries:
            if industry in content_lower:
                industries.append(industry)
        
        # Extract years of experience (simple pattern)
        years_experience = None
        experience_patterns = [
            r"(\d+)(?:\+)?\s*years?\s+(?:of\s+)?experience",
            r"experience\s*(?:of|:)?\s*(\d+)(?:\+)?\s*years"
        ]
        
        for pattern in experience_patterns:
            import re
            match = re.search(pattern, content_lower)
            if match:
                try:
                    years_experience = int(match.group(1))
                    break
                except (ValueError, IndexError):
                    pass
        
        # Determine education level
        education_level = None
        education_keywords = {
            "phd": "PhD",
            "doctorate": "PhD",
            "master": "Master's degree",
            "mba": "Master's degree",
            "bachelor": "Bachelor's degree",
            "undergraduate": "Bachelor's degree",
            "diploma": "Diploma",
            "certificate": "Certificate",
            "high school": "High School"
        }
        
        for keyword, level in education_keywords.items():
            if keyword in content_lower:
                education_level = level
                break
        
        # Generate job search keywords - use dedicated method instead of simple combination
        job_search_keywords = self.generate_search_keywords(cv_content, skills, job_titles, industries)
        
        # Create output format matching the API structure
        result = {
            "skills": skills,
            "job_titles": job_titles,
            "industries": industries,
            "years_experience": years_experience,
            "education_level": education_level,
            "education_field": None,  
            "certifications": [],     
            "languages": [],          
            "key_achievements": [],   
            "job_search_keywords": job_search_keywords,
            "analyzed_at": datetime.now().isoformat(),
            "analysis_method": "fallback"  # Flag to indicate this was not analyzed by the API
        }
        
        logger.info(f"Fallback analysis created with {len(skills)} skills and {len(job_titles)} job titles")
        return result

    def generate_search_keywords(self, cv_content: str, 
                                extracted_skills: List[str] = None, 
                                extracted_job_titles: List[str] = None,
                                extracted_industries: List[str] = None) -> List[str]:
        """
        Generate sophisticated job search keywords using Perplexity sonar-reasoning-pro model.
        This method creates more relevant and targeted keywords for job matching than
        simply combining skills and job titles.
        
        Args:
            cv_content: The CV text content
            extracted_skills: Already extracted skills (optional)
            extracted_job_titles: Already extracted job titles (optional)
            extracted_industries: Already extracted industries (optional)
            
        Returns:
            List of job search keywords optimized for job matching
        """
        # If API key is missing, fall back to simple combination
        if not self.api_key:
            logger.warning("No API key for keyword generation - using fallback approach")
            return list(set((extracted_skills or []) + (extracted_job_titles or [])))[:10]
        
        try:
            # Truncate CV content if too long
            max_content_length = 15000  # Shorter than for full analysis to focus on keywords
            truncated_content = cv_content
            if len(cv_content) > max_content_length:
                truncated_content = cv_content[:max_content_length] + "..."
            
            # Create headers
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            # Create a specialized prompt for job search keyword extraction
            prompt = f"""
            Generate the most effective job search keywords based on this CV/resume:
            
            ```
            {truncated_content}
            ```
            
            Focus on extracting three types of keywords:
            1. Technical skills and tools that are most marketable and in-demand
            2. Job titles or roles that this person is qualified for (both current and potential)
            3. Industry-specific terms that would help match with relevant job postings
            
            Format your response as a JSON array of strings, with 15-20 high-quality keywords.
            Include a mix of technical terms, job titles, and industry terms.
            Order them by relevance, with most important keywords first.
            """
            
            # Create the payload
            payload = {
                "model": self.MODEL,  # Using sonar-reasoning-pro for this task
                "messages": [
                    {"role": "system", "content": "You are a job search and recruitment expert who specializes in keyword optimization for job matching algorithms."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.2,  # Lower temperature for more focused results
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {"schema": KeywordsFormat.model_json_schema()}
                }
            }
            
            logger.info("Generating optimized job search keywords with Perplexity AI")
            
            response = requests.post(self.API_URL, headers=headers, json=payload)
            
            if response.status_code != 200:
                logger.warning(f"Keyword generation API error: {response.status_code} - falling back to basic keywords")
                logger.warning(f"Error details: {response.text}")
                return list(set((extracted_skills or []) + (extracted_job_titles or [])))[:15]
            
            # Parse the response
            response_data = response.json()
            result_content = response_data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
            logger.debug(f"Keyword response content: {result_content[:200]}...")
            
            try:
                # Extract clean JSON from response content (handling <think> sections)
                json_content = self._extract_json_from_text(result_content)
                
                # Parse the JSON response
                result = json.loads(json_content)
                
                # Handling for RootModel structure - if result is a dictionary with a 'root' key
                if isinstance(result, dict) and "root" in result:
                    keywords = result["root"]
                # Handle direct array response
                elif isinstance(result, list):
                    keywords = result
                # Handle other common response formats
                elif isinstance(result, dict) and "keywords" in result:
                    keywords = result["keywords"]
                elif isinstance(result, dict) and "job_search_keywords" in result:
                    keywords = result["job_search_keywords"]
                else:
                    # Try to find any list in the response
                    for key, value in result.items():
                        if isinstance(value, list) and len(value) > 0:
                            keywords = value
                            break
                    else:
                        # If no list found, fall back
                        logger.warning("Could not find keywords list in API response")
                        logger.warning(f"Response was: {result_content[:200]}...")
                        return list(set((extracted_skills or []) + (extracted_job_titles or [])))[:15]
                
                # Ensure we have strings and remove duplicates
                keywords = [str(k).strip().lower() for k in keywords if k]
                unique_keywords = list(dict.fromkeys(keywords))
                
                logger.info(f"Successfully generated {len(unique_keywords)} optimized job search keywords")
                return unique_keywords[:20]  # Limit to top 20 keywords
                
            except (json.JSONDecodeError, AttributeError, KeyError) as e:
                logger.error(f"Error parsing job search keywords: {str(e)}")
                logger.error(f"Response content was: {result_content[:200]}...")
                # Fall back to the basic approach
                return list(set((extracted_skills or []) + (extracted_job_titles or [])))[:15]
                
        except (requests.RequestException, Exception) as e:
            logger.error(f"Error generating job search keywords: {str(e)}")
            # Fall back to the basic approach
            return list(set((extracted_skills or []) + (extracted_job_titles or [])))[:15]

    def search_jobs(self, keywords: List[str], doc_id: str, callback=None) -> Optional[List[Dict[str, Any]]]:
        """
        Search for jobs using Perplexity Sonar Deep Research API based on CV keywords.
        Uses primary keyword approach for better targeted search results.
        
        Args:
            keywords: List of keywords (first one is used as primary search keyword)
            doc_id: Document ID to associate the search results with
            callback: Optional callback function to receive jobs as they're found
            
        Returns:
            List of job postings found or None if search failed
        """
        if not self.api_key:
            logger.error("Cannot search jobs: Perplexity API key not found")
            if callback:
                callback([], is_complete=True, error="Perplexity API key not found")
            return None
            
        if not keywords:
            logger.error("Cannot search jobs: No keywords provided")
            if callback:
                callback([], is_complete=True, error="No keywords provided for job search")
            return None
            
        try:
            # Extract primary keyword (first in the list)
            primary_keyword = keywords[0]
            
            # Load websites from the JSON file
            websites_path = os.path.join(os.path.dirname(__file__), "data", "websites.json")
            
            try:
                with open(websites_path, 'r') as f:
                    websites = json.load(f)
            except (FileNotFoundError, json.JSONDecodeError) as e:
                logger.warning(f"Error loading websites.json: {str(e)}")
                # Use a more comprehensive list of job sites to improve results
                websites = [
                    "indeed.com", 
                    "glassdoor.com",  
                    "linkedin.com",
                    "simplyhired.com",
                    "dice.com"
                ]
                
            if not websites or len(websites) < 2:
                logger.warning("Insufficient websites found in websites.json")
                # Use default list if none found or too few
                websites = [
                    "indeed.com", 
                    "glassdoor.com",  
                    "linkedin.com",
                    "simplyhired.com",
                    "dice.com"
                ]
            
            # Use the primary keyword as the main search query
            search_query = primary_keyword
            
            # Call the Perplexity API with deep research model
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            # For non-streaming job search, we can use structured output
            # We'll use this approach for better structured responses
            if not callback:
                # Non-streaming approach with structured output
                payload = {
                    "model": self.R_MODEL,
                    "messages": [
                        {"role": "system", "content": "You are a job search expert. Find open job positions that match the provided skills and keywords."},
                        {"role": "user", "content": f"""
                        Search for current open job positions matching this primary keyword/skill: {search_query}
                        
                        IMPORTANT RULES:
                        1. Only return REAL job listings from these websites: {', '.join(websites[:10])}
                        2. Each job must have a verifiable URL from one of these websites.
                        3. Return up to 20 real jobs, prioritizing the best matches.
                        """}
                    ],
                    "temperature": 0.2,  # Low temperature for more focused results
                    "search_domain_filter": websites,  # Restrict search to these domains
                    "response_format": {
                        "type": "json_schema",
                        "json_schema": {"schema": JobSearchFormat.model_json_schema()}
                    }
                }
                
                logger.info(f"Making job search request to Perplexity API with primary keyword: {search_query}")
                logger.info(f"Using websites: {websites[:5]}...")
                
                response = requests.post(self.API_URL, headers=headers, json=payload)
                
                if response.status_code != 200:
                    logger.error(f"API Error: {response.status_code} - {response.text}")
                    return None
                
                # Parse the response
                response_data = response.json()
                result_content = response_data.get("choices", [{}])[0].get("message", {}).get("content", "[]")
                
                try:
                    # Extract clean JSON from response content (handling <think> sections)
                    json_content = self._extract_json_from_text(result_content)
                    
                    # Parse the JSON response
                    jobs_data = json.loads(json_content)
                    
                    # Convert to list if it's not already (handling root vs array)
                    if isinstance(jobs_data, dict) and "root" in jobs_data:
                        jobs_list = jobs_data["root"]
                    else:
                        jobs_list = jobs_data
                    
                    # Add document ID and timestamp to each job
                    for job in jobs_list:
                        job["doc_id"] = doc_id
                        job["search_timestamp"] = datetime.now().isoformat()
                    
                    # Calculate match scores using all keywords
                    self._calculate_match_scores(jobs_list, keywords, primary_keyword)
                    
                    # Save jobs to database
                    if jobs_list:
                        db.save_document_jobs(doc_id, jobs_list)
                        logger.info(f"Saved {len(jobs_list)} job results for document {doc_id}")
                    
                    return jobs_list
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse JSON from API response: {e}")
                    logger.error(f"Response content was: {result_content[:200]}...")
                    return []
                except Exception as e:
                    logger.error(f"Error processing job search response: {str(e)}")
                    return []
            
            # Streaming approach (when callback is provided)
            # Perplexity currently doesn't support structured output with streaming
            # so we'll use the traditional approach with streaming
            payload = {
                "model": self.R_MODEL,  # Use the deep research model
                "messages": [
                    {"role": "system", "content": "You are a job search expert. Find open job positions that match the provided skills and keywords."},
                    {"role": "user", "content": self._create_job_search_prompt(search_query, websites)}
                ],
                "search_domain_filter": websites,  # Restrict search to these domains
                "stream": True  # Enable streaming responses
            }
            
            logger.info(f"Making streaming job search request to Perplexity API with primary keyword: {search_query}")
            logger.info(f"Using websites: {websites[:5]}...")
            
            # Store all found jobs
            all_jobs = []
            partial_data = ""
            search_complete = False
            search_error = None
            
            try:
                # Make streaming request
                with requests.post(self.API_URL, headers=headers, json=payload, stream=True, timeout=60) as response:
                    if not response.ok:
                        error_msg = f"API Error: {response.status_code} - {response.text}"
                        logger.error(error_msg)
                        if callback:
                            callback([], is_complete=True, error=error_msg)
                        return None
                    
                    # Process the streaming response
                    for line in response.iter_lines():
                        if not line:
                            continue
                            
                        # Remove 'data: ' prefix from SSE format
                        if line.startswith(b'data: '):
                            line = line[6:]
                        
                        # Skip [DONE] message
                        if line == b'[DONE]':
                            search_complete = True
                            break
                            
                        try:
                            # Parse the JSON chunk
                            chunk = json.loads(line)
                            
                            # Extract content from chunk
                            content = chunk.get('choices', [{}])[0].get('delta', {}).get('content', '')
                            if not content:
                                continue
                                
                            # Append to our partial data
                            partial_data += content
                            
                            # Try to extract job objects if we have a complete JSON object
                            jobs = self._try_extract_jobs_from_stream(partial_data, doc_id)
                            
                            if jobs:
                                # Calculate match scores for this batch of jobs
                                self._calculate_match_scores(jobs, keywords, primary_keyword)
                                
                                # Add new jobs to our collection
                                new_jobs_batch = []
                                for job in jobs:
                                    # Check if job is not already in all_jobs by comparing title and company
                                    if not any(j.get('title') == job.get('title') and 
                                            j.get('company') == job.get('company') for j in all_jobs):
                                        all_jobs.append(job)
                                        new_jobs_batch.append(job)
                                        
                                # If callback is provided, send the batch of new jobs to the frontend
                                if callback and new_jobs_batch:
                                    try:
                                        callback(new_jobs_batch)
                                    except Exception as e:
                                        logger.error(f"Error in job search callback: {str(e)}")
                        except json.JSONDecodeError:
                            # This is expected for partial JSON
                            continue
                        except Exception as e:
                            logger.error(f"Error processing streaming chunk: {str(e)}")
                
                # Search is now complete
                search_complete = True
                
                # Once streaming is complete, try one more time to extract any remaining jobs
                final_jobs = self._try_extract_jobs_from_stream(partial_data, doc_id, force=True)
                new_final_jobs = []
                
                for job in final_jobs:
                    if not any(j.get('title') == job.get('title') and 
                            j.get('company') == job.get('company') for j in all_jobs):
                        # Calculate match scores for final jobs
                        self._calculate_match_scores([job], keywords, primary_keyword)
                        all_jobs.append(job)
                        new_final_jobs.append(job)
                
                # Send any final jobs
                if callback and new_final_jobs:
                    try:
                        callback(new_final_jobs)
                    except Exception as e:
                        logger.error(f"Error in job search callback: {str(e)}")
                
            except requests.exceptions.RequestException as e:
                logger.error(f"Perplexity API request failed: {str(e)}")
                search_error = f"API request failed: {str(e)}"
                search_complete = True
            
            # Save all collected jobs to database
            if all_jobs:
                db.save_document_jobs(doc_id, all_jobs)
                logger.info(f"Saved {len(all_jobs)} job results for document {doc_id}")
            
            # Mark search as complete in callback
            if callback:
                try:
                    callback([], is_complete=True, error=search_error)
                except Exception as e:
                    logger.error(f"Error in job search completion callback: {str(e)}")
            
            return all_jobs
        except Exception as e:
            logger.error(f"Error searching jobs with Perplexity API: {str(e)}")
            if callback:
                try:
                    callback([], is_complete=True, error=str(e))
                except Exception as callback_e:
                    logger.error(f"Error in job search error callback: {str(callback_e)}")
            return None
            
    def _try_extract_jobs_from_stream(self, text: str, doc_id: str, force: bool = False) -> List[Dict[str, Any]]:
        """
        Try to extract complete job objects from streaming text
        
        Args:
            text: Partial or complete JSON text
            doc_id: Document ID to associate jobs with
            force: If True, try harder to extract jobs even from incomplete JSON
            
        Returns:
            List of job objects found, or empty list if none could be extracted
        """
        if not text or (not force and not (text.startswith('[') or text.startswith('{'))):
            return []
            
        try:
            # First try to parse as complete JSON
            json_content = self._extract_json_from_text(text)
            if not json_content:
                return []
                
            # Parse the JSON
            parsed_result = json.loads(json_content)
            
            # Process based on structure
            jobs = []
            if isinstance(parsed_result, list):
                jobs = parsed_result
            elif isinstance(parsed_result, dict) and "jobs" in parsed_result:
                jobs = parsed_result["jobs"]
            
            # Add document ID and timestamp to each job
            for job in jobs:
                job["doc_id"] = doc_id
                job["search_timestamp"] = datetime.now().isoformat()
                
                # Ensure match_score is an integer percentage
                if "match_score" in job:
                    if isinstance(job["match_score"], str):
                        try:
                            # Extract numbers from strings like "90%" to just 90
                            job["match_score"] = int(job["match_score"].strip("%"))
                        except (ValueError, TypeError):
                            job["match_score"] = 0
                    elif not isinstance(job["match_score"], int):
                        # If it's neither string nor int, default to 0
                        job["match_score"] = 0
                        
            return jobs
        except json.JSONDecodeError:
            # If force is True, try to extract jobs using more aggressive methods
            if force:
                # Look for job-like objects in the text
                # Very simplified extraction for demonstration - in production, use a more robust approach
                matches = []
                # Try to find complete objects between braces
                start_idx = 0
                brace_level = 0
                for i, char in enumerate(text):
                    if char == '{':
                        if brace_level == 0:
                            start_idx = i
                        brace_level += 1
                    elif char == '}':
                        brace_level -= 1
                        if brace_level == 0:
                            try:
                                job_text = text[start_idx:i+1]
                                job = json.loads(job_text)
                                if isinstance(job, dict) and "title" in job and "company" in job:
                                    job["doc_id"] = doc_id
                                    job["search_timestamp"] = datetime.now().isoformat()
                                    
                                    # Also handle match_score in the same way here
                                    if "match_score" in job:
                                        if isinstance(job["match_score"], str):
                                            try:
                                                job["match_score"] = int(job["match_score"].strip("%"))
                                            except (ValueError, TypeError):
                                                job["match_score"] = 0
                                        elif not isinstance(job["match_score"], int):
                                            job["match_score"] = 0
                                    
                                    matches.append(job)
                            except json.JSONDecodeError:
                                continue
                return matches
            return []
        except Exception as e:
            logger.error(f"Error extracting jobs from stream: {str(e)}")
            return []
            
    def _create_job_search_prompt(self, search_query: str, websites: List[str]) -> str:
        """
        Create a prompt for the Perplexity API to search for jobs.
        
        Args:
            search_query: Keywords to search for
            websites: List of job websites to search
            
        Returns:
            Formatted prompt string
        """
        return f"""
        Search for current open job positions matching the following skills and keywords:
        
        {search_query}
        
        IMPORTANT INSTRUCTIONS:
        1. Focus ONLY on REAL, active, open job listings that currently exist on these job websites.
        2. DO NOT generate any fake or example jobs - only return actual job postings you find.
        3. Only include jobs from the following websites: {', '.join(websites[:10])}
        4. Each job must have a verifiable URL from one of these websites.
        5. If you cannot find any jobs matching the criteria, return an empty array [].
        
        For each real job listing found, extract and format your response as structured JSON with these fields:
        1. title: Job title (exact title from the posting)
        2. company: Company name (exact company name from the posting)
        3. location: Job location (including remote options)
        4. description: Full job description in HTML format
        5. requirements: List of key requirements for the position
        6. match_score: A percentage (1-100) indicating how well this job matches the provided keywords
        7. url: Direct link to the actual job posting (must be a valid URL from one of the approved websites)
        8. date_posted: When the job was posted, if available
        9. salary: Salary information, if available (null if not provided)
        
        Return up to 25 real jobs, prioritizing the best matches. Format your response as a valid JSON array of job objects.
        Your response should be valid JSON that can be parsed directly, with no other text before or after.
        """
    
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
        
        # Add debug logging to see what we're trying to parse
        logger.debug(f"Attempting to extract JSON from text (first 100 chars): {text[:100]}...")
        
        # Case 1: Response has <think> tags - extract everything after the closing </think> tag
        # This handles the structured output format with reasoning tokens
        if "<think>" in text:
            # Find the closing </think> tag
            think_end = text.find("</think>")
            if think_end >= 0:
                # Get everything after the closing tag
                json_content = text[think_end + len("</think>"):].strip()
                logger.debug(f"Extracted JSON after </think> tag: {json_content[:50]}...")
                return json_content
                
        # Case 2: Standard markdown JSON block with ```json
        if "```json" in text.lower():
            parts = text.lower().split("```json")
            if len(parts) > 1:
                json_part = parts[1].split("```")[0].strip()
                logger.debug(f"Extracted JSON from markdown block: {json_part[:50]}...")
                return json_part
                
        # Case 3: Generic code block with ```
        if "```" in text:
            parts = text.split("```")
            # Take the content of the first code block
            if len(parts) > 1:
                json_candidate = parts[1].strip()
                logger.debug(f"Extracted potential JSON from code block: {json_candidate[:50]}...")
                return json_candidate
        
        # Case 4: Direct JSON array format - improved to be more robust
        if '[' in text and ']' in text:
            try:
                # Try to find the outermost array
                start = text.find('[')
                # Find matching end bracket (this is simplified; in reality, need to account for nested brackets)
                bracket_count = 1
                end = start + 1
                while end < len(text) and bracket_count > 0:
                    if text[end] == '[':
                        bracket_count += 1
                    elif text[end] == ']':
                        bracket_count -= 1
                    end += 1
                
                if start >= 0 and end > start:
                    json_array = text[start:end]
                    logger.debug(f"Extracted potential JSON array: {json_array[:50]}...")
                    # Verify this is valid JSON
                    try:
                        json.loads(json_array)
                        return json_array
                    except:
                        pass  # Will try other methods if this fails
            except:
                pass  # Continue with other extraction methods
                
        # Case 5: Direct JSON object format - improved to be more robust
        if '{' in text and '}' in text:
            try:
                # Find the outermost object
                start = text.find('{')
                # Find matching end brace (this is simplified; in reality, need to account for nested braces)
                brace_count = 1
                end = start + 1
                while end < len(text) and brace_count > 0:
                    if text[end] == '{':
                        brace_count += 1
                    elif text[end] == '}':
                        brace_count -= 1
                    end += 1
                
                if start >= 0 and end > start:
                    json_obj = text[start:end]
                    logger.debug(f"Extracted potential JSON object: {json_obj[:50]}...")
                    # Verify this is valid JSON
                    try:
                        json.loads(json_obj)
                        return json_obj
                    except:
                        pass  # Will try other methods if this fails
            except:
                pass  # Continue with other extraction methods
        
        # Case 6: Look for patterns that indicate JSON data is coming
        if "result:" in text.lower() or "jobs:" in text.lower() or "data:" in text.lower():
            # Look for JSON object after these markers
            markers = ["result:", "jobs:", "data:"]
            for marker in markers:
                if marker in text.lower():
                    pos = text.lower().find(marker) + len(marker)
                    substr = text[pos:].strip()
                    
                    # Check if the substring starts with [ or {
                    if substr.startswith('[') or substr.startswith('{'):
                        logger.debug(f"Found JSON-like content after marker '{marker}': {substr[:50]}...")
                        # Try to extract valid JSON
                        return self._extract_json_from_text(substr)
        
        # If none of the above worked but text contains { or [, return it as is for a final attempt
        if ('{' in text and '}' in text) or ('[' in text and ']' in text):
            logger.debug("Returning raw text with JSON-like characters for final parsing attempt")
            return text
            
        # As a last resort for debugging, log that we couldn't extract JSON
        logger.debug("Could not extract JSON from the provided text")
        return text

    def _calculate_match_scores(self, jobs: List[Dict[str, Any]], keywords: List[str], primary_keyword: str) -> None:
        """
        Calculate job match scores based on keywords from document analysis.
        Updates match_score in each job object directly.
        
        Args:
            jobs: List of job objects to score
            keywords: List of keywords to use for scoring
            primary_keyword: The primary keyword used for the search
        """
        if not jobs or not keywords:
            return
            
        try:
            # Process keywords for better matching
            processed_keywords = [k.lower().strip() for k in keywords if k and isinstance(k, str)]
            processed_primary = primary_keyword.lower().strip()
            
            for job in jobs:
                # Initialize or reset match score
                match_score = job.get('match_score', 50)  # Start with default match score if none present
                
                if not isinstance(match_score, (int, float)):
                    # Convert string percentages to integers if needed
                    if isinstance(match_score, str) and '%' in match_score:
                        try:
                            match_score = int(match_score.replace('%', '').strip())
                        except ValueError:
                            match_score = 50  # Default if conversion fails
                    else:
                        match_score = 50  # Default match score
                
                # Combine relevant text for matching
                job_text = ' '.join([
                    str(job.get('title', '')),
                    str(job.get('company', '')),
                    str(job.get('description', '')),
                    ' '.join(str(req) for req in job.get('requirements', []) if req)
                ]).lower()
                
                # Count matches of relevant keywords in the job text
                matched_keywords = [kw for kw in processed_keywords if kw in job_text]
                keyword_match_ratio = len(matched_keywords) / len(processed_keywords) if processed_keywords else 0
                
                # Check for primary keyword match - this is crucial
                primary_keyword_match = processed_primary in job_text
                
                # Adjust match score based on keyword matches
                # We give higher weight to the primary keyword
                if primary_keyword_match:
                    # If primary keyword matches, that's a good sign
                    base_score = 70
                else:
                    # Without primary keyword match, the base score is lower
                    base_score = 50
                    
                # Add additional points based on keyword matches (up to 30 points more)
                keyword_bonus = int(keyword_match_ratio * 30)
                
                # Calculate final score
                new_score = min(100, base_score + keyword_bonus)
                
                # Special case: If very few keywords match, cap the score
                if len(matched_keywords) < 3 and not primary_keyword_match:
                    new_score = min(new_score, 60)  # Cap at 60% if weak match
                
                # If we have a very strong match (primary + many keywords), boost it
                if primary_keyword_match and keyword_match_ratio > 0.7:
                    new_score = min(100, new_score + 10)  # Bonus for very strong matches
                
                # Update the job's match score
                job['match_score'] = new_score
                
                # Debug logging for scores
                logger.debug(f"Job '{job.get('title', 'Unknown')}' - Match score: {new_score}%, Matched {len(matched_keywords)}/{len(processed_keywords)} keywords")
                
        except Exception as e:
            logger.error(f"Error calculating match scores: {str(e)}")
            # If scoring fails, don't modify existing scores

# Create a singleton instance
perplexity_api = PerplexityAPI()

