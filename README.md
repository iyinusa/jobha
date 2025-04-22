# Jobha - AI-Powered Job Agent

Jobha is a modern job search platform that uses AI to match job seekers with their ideal opportunities.

Finding your dream job shouldn't be a full-time job. Let our intelligent agent search, match, and notify you of perfect opportunities, help re-craft your CV to match the job, and generate compelling Cover Letter.

## Features

- **Smart Job Matching**: AI engine that searches multiple job sites and matches positions to user skills
- **CV Optimization**: Get personalized suggestions to tailor your CV for specific applications
- **Cover Letter Generator**: Create customized cover letters for each application
- **Instant Notifications**: Get alerts when new jobs matching your criteria are posted

## Project Structure

```
jobha/
├── main.py               # FastAPI application
├── routers/              # API endpoint routers
├── models/               # Database models
├── services/             # Business logic
├── schemas/              # Pydantic schemas for API
├── static/               # Static files (CSS, JS, images, fonts)
├── templates/            # HTML templates for UI
├── requirements.txt      # Python dependencies
├── Dockerfile            # Container definition
├── docker-compose.yml    # Docker services configuration
└── .env                  # Environment variables
```

## Getting Started

### Prerequisites

- Python 3.9+
- Docker and Docker Compose (for containerized deployment)

### Setup and Installation

1. **Clone the repository**

```bash
git clone https://your-repository/jobha.git
cd jobha
```

2. **Set up environment variables**

Copy the `.env.example` to `.env` and update the values:

```bash
cp .env.example .env
# Edit .env with your configuration values
```

3. **Run with Docker Compose (recommended)**

```bash
docker-compose up
```

The application will be available at:
- Web UI & API: http://localhost:80
- API Documentation: http://localhost:80/api/docs

### Manual Setup

1. Create a virtual environment and install dependencies:

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

2. Start the FastAPI server:

```bash
uvicorn main:app --reload
```

Then visit http://localhost:8000 in your browser.

## API Documentation

Once the application is running, you can access the auto-generated API documentation at:

- Swagger UI: http://localhost:80/api/docs (Docker) or http://localhost:8000/api/docs (Manual)
- ReDoc: http://localhost:80/api/redoc (Docker) or http://localhost:8000/api/redoc (Manual)

## Development Workflow

1. Make changes to the code
2. If you're running in Docker, the changes will be automatically reflected due to volume mounting
3. FastAPI's auto-reload will update both the API and the UI templates
4. Refresh your browser to see updates

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- FastAPI for providing an efficient API framework
- Python ecosystem for AI and data processing capabilities