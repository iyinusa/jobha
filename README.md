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
├── backend/               # FastAPI backend
│   ├── routers/           # API endpoint routers
│   ├── models/            # Database models
│   ├── services/          # Business logic
│   ├── schemas/           # Pydantic schemas for API
│   └── static/            # Static files
├── frontend/              # Frontend files
│   ├── css/               # CSS styles
│   ├── js/                # JavaScript files
│   └── images/            # Images and assets
└── .env                   # Environment variables
```

## Getting Started

### Prerequisites

- Python 3.9+
- Node.js (for development tools)
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
- Frontend: http://localhost:80
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

### Manual Setup

#### Backend

1. Create a virtual environment and install dependencies:

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

2. Start the FastAPI server:

```bash
uvicorn main:app --reload
```

#### Frontend

The frontend is static HTML, CSS, and JavaScript that can be served by any web server. For development, you can use Python's built-in HTTP server:

```bash
cd frontend
python -m http.server 8080
```

Then visit http://localhost:8080 in your browser.

## API Documentation

Once the backend is running, you can access the auto-generated API documentation at:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Development Workflow

1. Make changes to the backend or frontend code
2. If you're running in Docker, the changes will be automatically reflected due to volume mounting
3. For backend changes, FastAPI's auto-reload will update the API
4. For frontend changes, refresh your browser to see updates

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- FastAPI for providing an efficient API framework
- Python ecosystem for AI and data processing capabilities