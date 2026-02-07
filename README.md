# Graph Query Platform

A modern, full-stack web application for managing and querying graph databases. This platform allows users to upload CSV datasets containing nodes and relationships, visualize database schemas, and execute Cypher queries through an intuitive web interface with real-time progress tracking.

## 1. Project Overview and Features

### Core Functionality
This project provides a complete solution for working with graph databases, specifically Neo4j, through a user-friendly web interface. The platform bridges the gap between raw CSV data and graph database operations.

### Key Features

#### Dataset Management
- **CSV Upload**: Upload multiple CSV files containing node and relationship data with automatic validation
- **Real-time Progress Tracking**: WebSocket-based live updates during dataset processing
- **Dataset Organization**: View, filter, search, and manage multiple datasets
- **Schema Visualization**: Explore node labels, relationship types, and their properties
- **Data Export**: Download datasets as individual CSV files or ZIP archives

#### Query Interface
- **Advanced Cypher Editor**: Code editor with syntax highlighting, line numbers, and auto-indentation
- **Multi-Query Support**: Manage multiple query tabs with auto-save functionality
- **Query Templates**: Pre-built templates for common Cypher operations
- **Schema Explorer**: Interactive sidebar to browse database schema and insert elements into queries
- **Query History**: Track and replay previously executed queries with execution metadata
- **Results Display**: View query results in tabular or JSON format with sorting, pagination, and CSV export

#### Advanced Capabilities
- **Automatic Type Detection**: Intelligent detection and conversion of data types during CSV processing
- **Relationship Inference**: Smart label detection for relationships based on relationship type patterns
- **Comprehensive Validation**: Detailed error messages for CSV validation issues
- **Performance Optimization**: Batch processing and efficient data loading for large datasets
- **Error Handling**: User-friendly error messages with specific guidance for common issues

## 2. Technology Stack

### Backend
- **Framework**: Django 5.2.10 (Python 3.9+)
- **API**: Django REST Framework 3.15.2
- **Database**: 
  - PostgreSQL 14 (metadata storage)
  - Neo4j 5.15.0 (graph data storage)
- **WebSockets**: Django Channels 4.1.0 for real-time updates
- **Async Processing**: Python asyncio for background tasks
- **Database Drivers**: 
  - `psycopg2-binary` 2.9.10 (PostgreSQL)
  - `neo4j` 5.20.0 (Neo4j async driver)
- **CORS**: Django CORS Headers 4.6.0
- **Environment Management**: Python-dotenv 1.0.1

### Frontend
- **Framework**: React 19.2.0 with TypeScript
- **State Management**: Redux Toolkit
- **Routing**: React Router v7
- **Code Editor**: CodeMirror 6 (`@uiw/react-codemirror`)
- **Build Tool**: Vite 7.2.4
- **HTTP Client**: Axios
- **Styling**: CSS3 with modern features

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Development Server**: Django development server, Vite dev server

## 3. Prerequisites

Before installing and running this project, ensure you have the following software installed:

### Required
- **Python**: 3.9 or higher (3.10+ recommended)
  - Verify: `python --version`
- **Node.js**: 18.x or higher (20.x recommended)
  - Verify: `node --version`
- **npm**: 9.x or higher (comes with Node.js)
  - Verify: `npm --version`
- **Docker**: 20.10 or higher (for database containers)
  - Verify: `docker --version`
- **Docker Compose**: 2.0 or higher
  - Verify: `docker-compose --version`
- **Git**: For cloning the repository
  - Verify: `git --version`

### Optional
- **Redis**: For production WebSocket support (optional in development)
- **PostgreSQL Client**: For manual database management (optional)
- **Neo4j Desktop**: For manual Neo4j management (optional)

## 4. Installation Steps

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd graph-query-platform
```

### Step 2: Database Setup

#### Option A: Using Docker Compose (Recommended)

This is the easiest method and ensures consistent database configurations.

1. Start PostgreSQL and Neo4j containers:
   ```bash
   docker-compose up -d
   ```

2. Verify containers are running:
   ```bash
   docker-compose ps
   ```

   You should see both `postgres` and `neo4j` containers running.

3. **PostgreSQL** will be available on:
   - Host port: `5433`
   - Container port: `5432`
   - Default credentials: `graphuser` / `graphpass123`
   - Database: `graph_platform_db`

4. **Neo4j** will be available on:
   - HTTP: `http://localhost:7474`
   - Bolt: `bolt://localhost:7687`
   - Default credentials: `neo4j` / `neo4jpass123` (change on first login)

#### Option B: Manual Database Setup

**PostgreSQL:**
```bash
# Create database
createdb graph_platform_db

# Or using psql
psql -U postgres
CREATE DATABASE graph_platform_db;
CREATE USER graphuser WITH PASSWORD 'graphpass123';
GRANT ALL PRIVILEGES ON DATABASE graph_platform_db TO graphuser;
\q
```

**Neo4j:**
1. Download and install Neo4j from [neo4j.com](https://neo4j.com/download/)
2. Start Neo4j service
3. Access Neo4j Browser at `http://localhost:7474`
4. Change default password from `neo4j` to `neo4jpass123` on first login

### Step 3: Backend Setup and Dependencies

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Create virtual environment:**
   ```bash
   python -m venv venv
   ```

3. **Activate virtual environment:**
   ```bash
   # Windows
   venv\Scripts\activate
   
   # Linux/Mac
   source venv/bin/activate
   ```

4. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

   This will install:
   - Django 5.2.10
   - Django REST Framework 3.15.2
   - psycopg2-binary 2.9.10 (PostgreSQL driver)
   - neo4j 5.20.0 (Neo4j async driver)
   - channels 4.1.0 (WebSockets)
   - channels-redis 4.2.0 (Redis support)
   - django-cors-headers 4.6.0 (CORS handling)
   - python-dotenv 1.0.1 (Environment variables)

5. **Run database migrations:**
   ```bash
   python manage.py migrate
   ```

6. **Create superuser (optional, for Django admin):**
   ```bash
   python manage.py createsuperuser
   ```

### Step 4: Frontend Setup and Dependencies

1. **Navigate to frontend directory:**
   ```bash
   cd ../frontend
   ```

2. **Install Node.js dependencies:**
   ```bash
   npm install
   ```

   This will install all required packages including:
   - React 19.2.0
   - TypeScript
   - Redux Toolkit
   - React Router v7
   - CodeMirror 6
   - Axios
   - Vite 7.2.4

### Step 5: Environment Variables Configuration

#### Backend Environment Variables

1. **Copy the example environment file:**
   ```bash
   cd ../backend
   cp env.example .env
   ```

2. **Edit `.env` file with your configuration:**
   ```env
   # Django Configuration
   SECRET_KEY=your-secret-key-here-change-in-production
   DEBUG=True
   ALLOWED_HOSTS=localhost,127.0.0.1

   # PostgreSQL Configuration
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5433
   POSTGRES_DB=graph_platform_db
   POSTGRES_USER=graphuser
   POSTGRES_PASSWORD=graphpass123

   # Neo4j Configuration
   NEO4J_URI=bolt://localhost:7687
   NEO4J_USER=neo4j
   NEO4J_PASSWORD=neo4jpass123

   # Frontend URL (for CORS)
   FRONTEND_URL=http://localhost:5173

   # Redis Configuration (optional for development)
   REDIS_HOST=localhost
   REDIS_PORT=6379

   # Logging
   DJANGO_LOG_LEVEL=INFO
   ```

   **Important Notes:**
   - Update `SECRET_KEY` with a secure random string for production
   - Ensure database credentials match your setup
   - If using Docker Compose, use the default values above
   - For manual setup, adjust `POSTGRES_PORT` to `5432` if using default PostgreSQL port

#### Frontend Environment Variables

1. **Create `.env` file in the frontend directory:**
   ```bash
   cd ../frontend
   ```

2. **Create `.env` file with:**
   ```env
   VITE_API_BASE_URL=http://localhost:8000/api
   VITE_WS_HOST=localhost:8000
   ```

### Step 6: Verify Installation

**Test Backend:**
```bash
cd ../backend
python manage.py runserver
```

Backend should start on `http://localhost:8000`. You should see:
- Django server running
- No database connection errors

**Test Frontend:**
```bash
cd ../frontend
npm run dev
```

Frontend should start on `http://localhost:5173`. You should see:
- Vite dev server running
- No compilation errors

## 5. Running the Application

### Development Mode

You need **three terminal windows** to run the application in development mode:

#### Terminal 1: Start Databases
```bash
docker-compose up -d
```

Keep this terminal open. To stop databases:
```bash
docker-compose down
```

#### Terminal 2: Start Backend Server
```bash
cd backend
venv\Scripts\activate  # Windows
# or
source venv/bin/activate  # Linux/Mac

python manage.py runserver
```

Backend will be available at `http://localhost:8000`
- API endpoints: `http://localhost:8000/api`
- Django admin: `http://localhost:8000/admin` (if superuser created)

#### Terminal 3: Start Frontend Server
```bash
cd frontend
npm run dev
```

Frontend will be available at `http://localhost:5173`

**Access the application:** Open `http://localhost:5173` in your web browser.

### Production Mode (Optional)

#### Backend Production Setup

1. **Update `.env` file:**
   ```env
   DEBUG=False
   ALLOWED_HOSTS=your-domain.com,www.your-domain.com
   ```

2. **Install Gunicorn:**
   ```bash
   pip install gunicorn
   ```

3. **Run with Gunicorn:**
   ```bash
   gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 4
   ```

#### Frontend Production Setup

1. **Build production bundle:**
   ```bash
   cd frontend
   npm run build
   ```

2. **Serve the `dist` folder:**
   - Use nginx, Apache, or any static file server
   - Configure reverse proxy to backend API
   - Set up SSL certificates for HTTPS

## 6. Sample Dataset Loading Instructions

The project includes two sample datasets located in `backend/samples/`:

### Available Sample Datasets

#### E-commerce Dataset
**Location**: `backend/samples/e_commerce/`

**Files:**
- `Customer.csv` - Customer nodes with id, name, email, age, address, etc.
- `Product.csv` - Product nodes with id, name, description, price, stock, etc.
- `Category.csv` - Category nodes with id, name, description
- `PURCHASED.csv` - Purchase relationships (Customer → Product)
- `IN_CATEGORY.csv` - Category relationships (Product → Category)
- `VIEWED.csv` - View relationships (Customer → Product)

#### Social Network Dataset
**Location**: `backend/samples/social_network/`

**Files:**
- `User.csv` - User nodes with id, name, email, age, location, etc.
- `Post.csv` - Post nodes with id, title, content, created_at, likes
- `Comment.csv` - Comment nodes with id, content, created_at, likes
- `FOLLOWS.csv` - Follow relationships (User → User)
- `AUTHORED.csv` - Author relationships (User → Post)
- `COMMENTED.csv` - Comment relationships (User → Comment)

### Loading Sample Data

1. **Start the application** (follow "Running the Application" section)

2. **Navigate to Datasets page:**
   - Open `http://localhost:5173` in your browser
   - Click on "Datasets" in the navigation bar

3. **Upload a sample dataset:**
   - Click "Upload Dataset" button
   - Select all CSV files from a sample directory (e.g., `backend/samples/e_commerce/`)
   - Enter a dataset name (e.g., "E-commerce Sample")
   - Click "Upload"

4. **Monitor progress:**
   - Real-time progress updates will appear
   - Each file will show processing status
   - Wait for all files to complete (status: "Completed")

5. **Verify data:**
   - Click on the dataset to view details
   - Check the "Schema" tab to see node labels and relationships
   - Verify node and relationship counts

### CSV File Format Requirements

#### Node Files
- **Required column**: `id` (unique identifier)
- **First row**: Must contain column headers
- **All rows**: Must have the same number of columns
- **Encoding**: UTF-8

**Example:**
```csv
id,name,email,age
1,John Doe,john@example.com,32
2,Jane Smith,jane@example.com,28
```

#### Relationship Files
- **Required columns**: `source_id`, `target_id`
- **First row**: Must contain column headers
- **All rows**: Must have the same number of columns
- **Encoding**: UTF-8

**Example:**
```csv
source_id,target_id,quantity,total_price
1,1,2,199.98
2,3,1,49.99
```

**Note:** `source_id` and `target_id` must reference valid node IDs from node files.

## 7. API Documentation

### Base URL
```
http://localhost:8000/api
```

### API Endpoints

#### Datasets

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/datasets/` | List all datasets |
| `POST` | `/datasets/upload/` | Upload CSV files |
| `GET` | `/datasets/{id}/` | Get dataset details |
| `GET` | `/datasets/{id}/metadata/` | Get dataset schema and counts |
| `GET` | `/datasets/{id}/download/` | Download dataset files |
| `DELETE` | `/datasets/{id}/delete/` | Delete dataset |
| `GET` | `/datasets/tasks/{id}/` | Get upload task status |

#### Queries

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/queries/execute/` | Execute a Cypher query |
| `GET` | `/queries/` | List saved queries |
| `POST` | `/queries/save/` | Save a query |
| `GET` | `/queries/{id}/` | Get query details |
| `DELETE` | `/queries/{id}/` | Delete query |
| `GET` | `/queries/history/` | Get query execution history |

#### Schema

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/schema/` | Get Neo4j schema information |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `ws://localhost:8000/ws/tasks/{task_id}/` | Real-time task progress updates |

### Example API Calls

**Upload Dataset:**
```bash
curl -X POST http://localhost:8000/api/datasets/upload/ \
  -F "files=@Customer.csv" \
  -F "files=@Product.csv" \
  -F "files=@PURCHASED.csv" \
  -F "dataset_name=E-commerce Dataset"
```

**Execute Query:**
```bash
curl -X POST http://localhost:8000/api/queries/execute/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "MATCH (c:Customer)-[r:PURCHASED]->(p:Product) RETURN c.name, p.name, r.quantity LIMIT 10"
  }'
```

**Get Schema:**
```bash
curl -X GET http://localhost:8000/api/schema/
```

For detailed API documentation, refer to the Django REST Framework browsable API at `http://localhost:8000/api/` when the server is running.

## 8. Testing Instructions

### Backend Testing

Run Django test suite:
```bash
cd backend
python manage.py test
```

### Frontend Testing

Run frontend test suite:
```bash
cd frontend
npm test
```

### Manual Testing Scenarios

#### Test 1: Dataset Upload
1. Navigate to Datasets page
2. Click "Upload Dataset"
3. Select multiple CSV files (nodes and relationships)
4. Enter dataset name
5. Click "Upload"
6. **Expected**: Progress updates appear, files process successfully, dataset appears in list

#### Test 2: Query Execution
1. Navigate to Queries page
2. Enter a Cypher query:
   ```cypher
   MATCH (n) RETURN n LIMIT 10
   ```
3. Click "Execute"
4. **Expected**: Results display in table format, execution time shown

#### Test 3: Schema Explorer
1. Navigate to Queries page
2. Click schema explorer icon (sidebar toggle)
3. Expand node labels
4. Click on a node label or relationship type
5. **Expected**: Schema element inserted into query editor

#### Test 4: Query History
1. Execute multiple queries
2. Open query history sidebar
3. Click on a previous query
4. **Expected**: Query loads into editor

#### Test 5: Results Export
1. Execute a query with results
2. Click "Export CSV" button
3. **Expected**: CSV file downloads with query results

### Sample Test Queries

**Basic Node Query:**
```cypher
MATCH (c:Customer)
RETURN c.name, c.email
LIMIT 10
```

**Relationship Query:**
```cypher
MATCH (c:Customer)-[r:PURCHASED]->(p:Product)
RETURN c.name AS customer, p.name AS product, r.quantity
LIMIT 10
```

**Aggregation Query:**
```cypher
MATCH (c:Customer)-[r:PURCHASED]->(p:Product)
RETURN p.name AS product, 
       count(r) AS times_purchased,
       sum(r.total_price) AS total_revenue
ORDER BY times_purchased DESC
LIMIT 10
```

**Schema Query:**
```cypher
MATCH (n)
RETURN labels(n) AS label, count(n) AS count
ORDER BY count DESC
```

## 9. Known Limitations

1. **File Size**: Very large CSV files (>100MB) may take significant time to process and may timeout
2. **Concurrent Uploads**: Multiple simultaneous uploads may impact performance and database connections
3. **Relationship Labels**: Automatic label detection may require manual verification for complex schemas with ambiguous relationships
4. **Data Types**: Complex data types (nested objects, arrays) are stored as strings in Neo4j
5. **WebSocket**: In-memory channel layers are used in development (not suitable for production scaling without Redis)
6. **ID Types**: Node IDs are converted to integers when possible; string IDs are preserved but may cause type mismatches
7. **Batch Processing**: Large datasets are processed in batches of 100 nodes/relationships, which may be slow for very large datasets
8. **Validation Limits**: CSV validation is limited to first 10,000 rows for performance reasons
9. **Browser Compatibility**: Modern browsers required (Chrome, Firefox, Edge, Safari latest versions)
10. **Authentication**: No user authentication implemented; all operations are available to all users

## 10. Future Enhancements

### Planned Features
- [ ] **User Authentication**: Implement user registration, login, and role-based access control
- [ ] **Query Result Caching**: Cache frequently executed queries for improved performance
- [ ] **Advanced Visualization**: Graph diagram visualization for nodes and relationships
- [ ] **Query Performance Analysis**: Execution plan analysis and query optimization suggestions
- [ ] **Data Import Formats**: Support for JSON, XML, and other data formats
- [ ] **Export Formats**: Export query results to JSON, Excel, and other formats
- [ ] **Query Scheduling**: Schedule queries to run automatically at specified times
- [ ] **Multi-Database Support**: Support for multiple Neo4j databases or other graph databases
- [ ] **Advanced Relationship Inference**: Machine learning-based relationship detection
- [ ] **Data Transformation Pipelines**: ETL pipelines for data transformation before loading

### Technical Improvements
- [ ] **API Rate Limiting**: Implement rate limiting to prevent abuse
- [ ] **Comprehensive Test Coverage**: Unit tests, integration tests, and end-to-end tests
- [ ] **CI/CD Pipeline**: Automated testing and deployment pipeline
- [ ] **Docker Production Deployment**: Complete Docker setup for production environment
- [ ] **Kubernetes Support**: Container orchestration for scalable deployment
- [ ] **Monitoring and Logging**: Advanced monitoring, logging, and alerting systems
- [ ] **Performance Optimization**: Further optimization for large-scale data processing
- [ ] **Documentation**: API documentation with Swagger/OpenAPI

## Troubleshooting

### Common Issues and Solutions

**Database Connection Errors:**
- Verify PostgreSQL and Neo4j containers are running: `docker-compose ps`
- Check environment variables in `.env` match docker-compose.yml
- Ensure ports 5433 and 7687 are not in use by other applications
- Restart containers: `docker-compose restart`

**Import Errors:**
- Ensure virtual environment is activated
- Reinstall dependencies: `pip install -r requirements.txt --upgrade`
- Check Python version: `python --version` (should be 3.9+)
- Clear Python cache: `find . -type d -name __pycache__ -exec rm -r {} +`

**Frontend Build Errors:**
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Check Node.js version: `node --version` (should be 18+)
- Verify TypeScript compilation: `npm run build`
- Clear npm cache: `npm cache clean --force`

**WebSocket Connection Issues:**
- Check CORS settings in `backend/config/settings.py`
- Verify WebSocket URL in frontend matches backend port
- For production, ensure Redis is configured for channel layers
- Check browser console for WebSocket errors

**CSV Upload Failures:**
- Verify CSV files have proper headers (first row)
- Check for required columns: `id` for nodes, `source_id`/`target_id` for relationships
- Ensure CSV encoding is UTF-8
- Check file size (very large files may timeout)
- Verify no special characters in column names

**Query Execution Errors:**
- Verify data is loaded correctly in Neo4j
- Check dataset_id filtering in queries if needed
- Ensure node labels and relationship types match exactly (case-sensitive)
- Test query in Neo4j Browser first
- Check for syntax errors in Cypher query

## License

This project is licensed under the MIT License.

## Acknowledgments

- Django and Django REST Framework
- Neo4j for graph database technology
- React and Redux Toolkit
- CodeMirror for code editing capabilities
- All open-source contributors and libraries used in this project
