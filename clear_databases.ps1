# PowerShell script to clear PostgreSQL and Neo4j databases
# This script uses Docker exec commands if databases are running in Docker

$separator = "=" * 60

Write-Host ""
Write-Host $separator
Write-Host "DATABASE CLEARING SCRIPT (PowerShell)"
Write-Host $separator
Write-Host ""
Write-Host "WARNING: This will permanently delete ALL data from:"
Write-Host "  - PostgreSQL database"
Write-Host "  - Neo4j database"
Write-Host ""
Write-Host "This action cannot be undone!"
Write-Host ""

$response = Read-Host "Are you sure you want to continue? (yes/no)"
if ($response -notmatch "^yes$|^y$") {
    Write-Host ""
    Write-Host "Operation cancelled."
    exit 0
}

Write-Host ""
Write-Host $separator
Write-Host "Clearing PostgreSQL Database"
Write-Host $separator
Write-Host ""

# Check if PostgreSQL container is running
try {
    $postgresContainer = docker ps --filter "name=graph_platform_postgres" --format "{{.Names}}" 2>&1
    if ($LASTEXITCODE -eq 0 -and $postgresContainer) {
        Write-Host "PostgreSQL container found: $postgresContainer"
        Write-Host "Clearing PostgreSQL via Docker..."
        
        # Drop all tables using psql in container
        # Use single line command to avoid PowerShell multi-line string issues
        $dropTablesCmd = "DO `$`$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE'; END LOOP; END `$`$;"
        
        docker exec graph_platform_postgres psql -U graphuser -d graph_platform_db -c $dropTablesCmd
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ PostgreSQL database cleared successfully!"
        } else {
            Write-Host "✗ ERROR: Failed to clear PostgreSQL database (Exit code: $LASTEXITCODE)"
        }
    } else {
        Write-Host "PostgreSQL container not found."
        Write-Host "Please ensure Docker containers are running with: docker-compose up -d"
        Write-Host "Or use the Python script (clear_databases.py) for direct database connections."
    }
} catch {
    Write-Host "✗ ERROR checking PostgreSQL container: $_"
}

Write-Host ""
Write-Host $separator
Write-Host "Clearing Neo4j Database"
Write-Host $separator
Write-Host ""

# Check if Neo4j container is running
try {
    $neo4jContainer = docker ps --filter "name=graph_platform_neo4j" --format "{{.Names}}" 2>&1
    if ($LASTEXITCODE -eq 0 -and $neo4jContainer) {
        Write-Host "Neo4j container found: $neo4jContainer"
        Write-Host "Clearing Neo4j via Docker..."
        
        # Delete all relationships first, then nodes
        # Use separate commands for better reliability
        Write-Host "  Deleting relationships..."
        docker exec graph_platform_neo4j cypher-shell -u neo4j -p neo4jpass123 "MATCH ()-[r]->() DELETE r;"
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Relationships deleted"
        } else {
            Write-Host "  ⚠ Warning: Failed to delete relationships (Exit code: $LASTEXITCODE)"
        }
        
        Write-Host "  Deleting nodes..."
        docker exec graph_platform_neo4j cypher-shell -u neo4j -p neo4jpass123 "MATCH (n) DELETE n;"
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Neo4j database cleared successfully!"
        } else {
            Write-Host "✗ ERROR: Failed to delete nodes (Exit code: $LASTEXITCODE)"
            Write-Host "  You may need to clear Neo4j manually via Neo4j Browser at http://localhost:7474"
        }
    } else {
        Write-Host "Neo4j container not found."
        Write-Host "Please ensure Docker containers are running with: docker-compose up -d"
        Write-Host "Or use the Python script (clear_databases.py) for direct database connections."
    }
} catch {
    Write-Host "✗ ERROR checking Neo4j container: $_"
}

Write-Host ""
Write-Host $separator
Write-Host "✓ Database clearing completed!"
Write-Host $separator
Write-Host ""
Write-Host "Note: You may need to run migrations again:"
Write-Host "  cd backend"
Write-Host "  python manage.py migrate"
Write-Host $separator
Write-Host ""
