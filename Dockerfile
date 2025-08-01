FROM python:3.11-slim

WORKDIR /app

# Install LibreOffice for DOCX to PDF conversion
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libreoffice \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]