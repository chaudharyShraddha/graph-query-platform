#!/usr/bin/env python3
"""
Script to completely clear PostgreSQL and Neo4j databases.

This script will:
- Drop all tables in PostgreSQL (or truncate if you prefer)
- Delete all nodes and relationships in Neo4j

WARNING: This will permanently delete all data in both databases!
"""

import os
import sys
import asyncio
from pathlib import Path

# Try to load dotenv if available (optional)
try:
    from dotenv import load_dotenv
    DOTENV_AVAILABLE = True
except ImportError:
    DOTENV_AVAILABLE = False

# Load environment variables from backend/.env if it exists
if DOTENV_AVAILABLE:
    backend_env = Path(__file__).parent / "backend" / ".env"
    if backend_env.exists():
        load_dotenv(backend_env)
    else:
        # Try root .env
        root_env = Path(__file__).parent / ".env"
        if root_env.exists():
            load_dotenv(root_env)

# PostgreSQL imports
try:
    import psycopg2
    from psycopg2 import sql
except ImportError:
    print("ERROR: psycopg2 not installed. Install it with: pip install psycopg2-binary")
    sys.exit(1)

# Neo4j imports
try:
    from neo4j import AsyncGraphDatabase
except ImportError:
    print("ERROR: neo4j not installed. Install it with: pip install neo4j")
    sys.exit(1)


def get_postgres_config():
    """Get PostgreSQL configuration from environment variables."""
    return {
        'host': os.getenv('POSTGRES_HOST', 'localhost'),
        'port': os.getenv('POSTGRES_PORT', '5433'),
        'database': os.getenv('POSTGRES_DB', 'graph_platform_db'),
        'user': os.getenv('POSTGRES_USER', 'graphuser'),
        'password': os.getenv('POSTGRES_PASSWORD', 'graphpass123'),
    }


def get_neo4j_config():
    """Get Neo4j configuration from environment variables."""
    return {
        'uri': os.getenv('NEO4J_URI', 'bolt://localhost:7687'),
        'user': os.getenv('NEO4J_USER', 'neo4j'),
        'password': os.getenv('NEO4J_PASSWORD', 'neo4jpass123'),
    }


def clear_postgresql():
    """Clear all data from PostgreSQL database."""
    config = get_postgres_config()
    
    print(f"\n{'='*60}")
    print("Clearing PostgreSQL Database")
    print(f"{'='*60}")
    print(f"Host: {config['host']}:{config['port']}")
    print(f"Database: {config['database']}")
    print(f"User: {config['user']}")
    print(f"{'='*60}\n")
    
    try:
        # Connect to PostgreSQL
        conn = psycopg2.connect(
            host=config['host'],
            port=config['port'],
            database=config['database'],
            user=config['user'],
            password=config['password']
        )
        conn.autocommit = False
        cursor = conn.cursor()
        
        print("Connected to PostgreSQL successfully!")
        
        # Get all table names
        cursor.execute("""
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public'
            ORDER BY tablename;
        """)
        tables = [row[0] for row in cursor.fetchall()]
        
        if not tables:
            print("No tables found in the database.")
            cursor.close()
            conn.close()
            return
        
        print(f"\nFound {len(tables)} tables:")
        for table in tables:
            print(f"  - {table}")
        
        # Disable foreign key checks temporarily (PostgreSQL doesn't have this, but we'll use CASCADE)
        # Drop all tables with CASCADE to handle foreign keys
        print("\nDropping all tables...")
        for table in tables:
            try:
                # Use CASCADE to drop dependent objects
                drop_query = sql.SQL("DROP TABLE IF EXISTS {} CASCADE").format(
                    sql.Identifier(table)
                )
                cursor.execute(drop_query)
                print(f"  ✓ Dropped table: {table}")
            except Exception as e:
                print(f"  ✗ Error dropping table {table}: {e}")
        
        # Commit the transaction
        conn.commit()
        print("\n✓ PostgreSQL database cleared successfully!")
        
        cursor.close()
        conn.close()
        
    except psycopg2.OperationalError as e:
        print(f"\n✗ ERROR: Could not connect to PostgreSQL database!")
        print(f"  Error: {e}")
        print("\nMake sure PostgreSQL is running and credentials are correct.")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ ERROR: Failed to clear PostgreSQL database!")
        print(f"  Error: {e}")
        if 'conn' in locals():
            conn.rollback()
            conn.close()
        sys.exit(1)


async def clear_neo4j():
    """Clear all data from Neo4j database."""
    config = get_neo4j_config()
    
    print(f"\n{'='*60}")
    print("Clearing Neo4j Database")
    print(f"{'='*60}")
    print(f"URI: {config['uri']}")
    print(f"User: {config['user']}")
    print(f"{'='*60}\n")
    
    driver = None
    try:
        # Create Neo4j driver
        driver = AsyncGraphDatabase.driver(
            config['uri'],
            auth=(config['user'], config['password'])
        )
        
        # Verify connectivity
        await driver.verify_connectivity()
        print("Connected to Neo4j successfully!")
        
        # Get counts before deletion
        async with driver.session() as session:
            # Count nodes
            result = await session.run("MATCH (n) RETURN count(n) as count")
            node_record = await result.single()
            node_count = node_record['count'] if node_record else 0
            
            # Count relationships
            result = await session.run("MATCH ()-[r]->() RETURN count(r) as count")
            rel_record = await result.single()
            rel_count = rel_record['count'] if rel_record else 0
            
            print(f"\nCurrent database state:")
            print(f"  Nodes: {node_count}")
            print(f"  Relationships: {rel_count}")
        
        if node_count == 0 and rel_count == 0:
            print("\nDatabase is already empty.")
            await driver.close()
            return
        
        # Delete all relationships first (to avoid constraint issues)
        print("\nDeleting all relationships...")
        async with driver.session() as session:
            result = await session.run("MATCH ()-[r]->() DELETE r")
            summary = await result.consume()
            deleted_rels = summary.counters.relationships_deleted
            print(f"  ✓ Deleted {deleted_rels} relationships")
        
        # Delete all nodes
        print("Deleting all nodes...")
        async with driver.session() as session:
            result = await session.run("MATCH (n) DELETE n")
            summary = await result.consume()
            deleted_nodes = summary.counters.nodes_deleted
            print(f"  ✓ Deleted {deleted_nodes} nodes")
        
        # Verify deletion
        async with driver.session() as session:
            result = await session.run("MATCH (n) RETURN count(n) as count")
            node_record = await result.single()
            remaining_nodes = node_record['count'] if node_record else 0
            
            result = await session.run("MATCH ()-[r]->() RETURN count(r) as count")
            rel_record = await result.single()
            remaining_rels = rel_record['count'] if rel_record else 0
        
        if remaining_nodes == 0 and remaining_rels == 0:
            print("\n✓ Neo4j database cleared successfully!")
        else:
            print(f"\n⚠ Warning: Some data may remain (Nodes: {remaining_nodes}, Relationships: {remaining_rels})")
        
        await driver.close()
        
    except Exception as e:
        print(f"\n✗ ERROR: Failed to clear Neo4j database!")
        print(f"  Error: {e}")
        if driver:
            await driver.close()
        sys.exit(1)


def main():
    """Main function to clear both databases."""
    print("\n" + "="*60)
    print("DATABASE CLEARING SCRIPT")
    print("="*60)
    
    # Inform about dotenv status
    if not DOTENV_AVAILABLE:
        print("\nNote: python-dotenv not installed. Using environment variables or defaults.")
        print("      To load from .env file, install: pip install python-dotenv")
    
    print("\n⚠ WARNING: This will permanently delete ALL data from:")
    print("  - PostgreSQL database")
    print("  - Neo4j database")
    print("\nThis action cannot be undone!")
    
    # Ask for confirmation
    response = input("\nAre you sure you want to continue? (yes/no): ").strip().lower()
    if response not in ['yes', 'y']:
        print("\nOperation cancelled.")
        sys.exit(0)
    
    # Clear PostgreSQL
    clear_postgresql()
    
    # Clear Neo4j
    asyncio.run(clear_neo4j())
    
    print("\n" + "="*60)
    print("✓ All databases cleared successfully!")
    print("="*60)
    print("\nNote: You may need to run migrations again:")
    print("  cd backend")
    print("  python manage.py migrate")
    print("="*60 + "\n")


if __name__ == "__main__":
    main()
