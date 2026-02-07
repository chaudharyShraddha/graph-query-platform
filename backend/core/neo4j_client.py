"""
Neo4j async client for graph database operations.

This module provides a thread-safe singleton wrapper around the Neo4j async driver,
ensuring proper connection management and avoiding event loop conflicts.
"""
import logging
import threading
from typing import Dict, List, Optional, Any
from neo4j import AsyncGraphDatabase, AsyncDriver
from django.conf import settings

logger = logging.getLogger(__name__)


class Neo4jClient:
    """Async Neo4j client wrapper."""
    
    _instance = None
    _drivers = None
    _lock = None
    
    def __new__(cls):
        """Singleton pattern implementation."""
        if cls._instance is None:
            cls._instance = super(Neo4jClient, cls).__new__(cls)
            cls._lock = threading.Lock()
            cls._drivers: Dict[int, Optional[AsyncDriver]] = {}
        return cls._instance
    
    def __init__(self):
        """Initialize Neo4j client."""
        pass
    
    def get_driver(self) -> AsyncDriver:
        """
        Get or create the Neo4j driver for the current thread.
        Each thread gets its own driver to avoid event loop conflicts.
        """
        thread_id = threading.get_ident()
        
        if thread_id not in self._drivers or self._drivers[thread_id] is None:
            with self._lock:
                # Double-check after acquiring lock
                if thread_id not in self._drivers or self._drivers[thread_id] is None:
                    self._drivers[thread_id] = AsyncGraphDatabase.driver(
                        settings.NEO4J_URI,
                        auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD)
                    )
                    logger.info(f"Neo4j driver initialized for thread {threading.current_thread().name} (ID: {thread_id})")
        
        return self._drivers[thread_id]
    
    async def close(self):
        """Close the driver connection for the current thread."""
        thread_id = threading.get_ident()
        
        if thread_id in self._drivers and self._drivers[thread_id] is not None:
            await self._drivers[thread_id].close()
            self._drivers[thread_id] = None
            logger.info(f"Neo4j driver closed for thread {threading.current_thread().name}")
    
    async def verify_connectivity(self) -> bool:
        """Verify connection to Neo4j database."""
        try:
            driver = self.get_driver()
            await driver.verify_connectivity()
            logger.info("Neo4j connectivity verified")
            return True
        except Exception as e:
            logger.error(f"Neo4j connectivity check failed: {e}")
            raise
    
    async def execute_query(
        self,
        query: str,
        parameters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Execute a Cypher query and return results.
        
        Args:
            query: Cypher query string
            parameters: Query parameters dictionary
            
        Returns:
            List of result records as dictionaries
        """
        if parameters is None:
            parameters = {}
        
        try:
            driver = self.get_driver()
            async with driver.session() as session:
                result = await session.run(query, parameters)
                records = await result.data()
                logger.debug(f"Query executed successfully: {len(records)} records returned")
                return records
        except Exception as e:
            logger.error(f"Query execution failed: {e}")
            raise
    
    async def create_node(
        self,
        label: str,
        properties: Dict[str, Any],
        unique_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a node in Neo4j.
        
        Args:
            label: Node label (e.g., 'User', 'Product')
            properties: Node properties dictionary
            unique_id: Optional unique identifier property name
            
        Returns:
            Created node data
        """
        try:
            # Build query
            if unique_id and unique_id in properties:
                # Use MERGE to avoid duplicates
                query = f"""
                MERGE (n:{label} {{{unique_id}: $id}})
                SET n += $props
                RETURN n
                """
                parameters = {
                    'id': properties[unique_id],
                    'props': properties
                }
            else:
                # Use CREATE for new nodes
                query = f"CREATE (n:{label} $props) RETURN n"
                parameters = {'props': properties}
            
            driver = self.get_driver()
            async with driver.session() as session:
                result = await session.run(query, parameters)
                record = await result.single()
                if record:
                    node_data = dict(record['n'])
                    logger.debug(f"Node created: {label} with {len(properties)} properties")
                    return node_data
                else:
                    raise Exception("Failed to create node")
        except Exception as e:
            logger.error(f"Node creation failed: {e}")
            raise
    
    async def create_nodes_batch(
        self,
        label: str,
        nodes: List[Dict[str, Any]],
        unique_id: Optional[str] = None,
        batch_size: int = 1000
    ) -> int:
        """
        Create multiple nodes in batches.
        
        Args:
            label: Node label
            nodes: List of node property dictionaries
            unique_id: Optional unique identifier property name
            batch_size: Number of nodes per batch
            
        Returns:
            Number of nodes created
        """
        created_count = 0
        
        try:
            for i in range(0, len(nodes), batch_size):
                batch = nodes[i:i + batch_size]
                
                if unique_id:
                    # Use UNWIND with MERGE for batch creation with uniqueness
                    # Note: unique_id is inserted as a literal in the f-string
                    query = f"""
                    UNWIND $nodes AS node
                    MERGE (n:{label} {{{unique_id}: node.{unique_id}}})
                    SET n = node
                    RETURN count(n) as count
                    """
                else:
                    # Use UNWIND with CREATE for batch creation
                    query = f"""
                    UNWIND $nodes AS node
                    CREATE (n:{label})
                    SET n = node
                    RETURN count(n) as count
                    """
                
                driver = self.get_driver()
                async with driver.session() as session:
                    result = await session.run(query, {'nodes': batch})
                    record = await result.single()
                    if record:
                        created_count += record['count']
                
                logger.debug(f"Batch {i//batch_size + 1}: Created {len(batch)} nodes")
            
            logger.info(f"Created {created_count} nodes of type {label}")
            return created_count
        except Exception as e:
            logger.error(f"Batch node creation failed: {e}")
            raise
    
    async def create_relationship(
        self,
        source_label: str,
        source_id_key: str,
        source_id_value: Any,
        target_label: str,
        target_id_key: str,
        target_id_value: Any,
        relationship_type: str,
        properties: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Create a relationship between two nodes.
        
        Args:
            source_label: Source node label
            source_id_key: Source node ID property name
            source_id_value: Source node ID value
            target_label: Target node label
            target_id_key: Target node ID property name
            target_id_value: Target node ID value
            relationship_type: Relationship type (e.g., 'FOLLOWS', 'PURCHASED')
            properties: Optional relationship properties
            
        Returns:
            Created relationship data
        """
        if properties is None:
            properties = {}
        
        try:
            query = f"""
            MATCH (source:{source_label} {{{source_id_key}: $source_id}})
            MATCH (target:{target_label} {{{target_id_key}: $target_id}})
            CREATE (source)-[r:{relationship_type} $props]->(target)
            RETURN r
            """
            parameters = {
                'source_id': source_id_value,
                'target_id': target_id_value,
                'props': properties
            }
            
            driver = self.get_driver()
            async with driver.session() as session:
                result = await session.run(query, parameters)
                record = await result.single()
                if record:
                    rel_data = dict(record['r'])
                    logger.debug(f"Relationship created: {relationship_type}")
                    return rel_data
                else:
                    raise Exception("Failed to create relationship")
        except Exception as e:
            logger.error(f"Relationship creation failed: {e}")
            raise
    
    async def create_relationships_batch(
        self,
        source_label: str,
        source_id_key: str,
        target_label: str,
        target_id_key: str,
        relationship_type: str,
        relationships: List[Dict[str, Any]],
        batch_size: int = 1000
    ) -> int:
        """
        Create multiple relationships in batches.
        
        Args:
            source_label: Source node label
            source_id_key: Source node ID property name
            target_label: Target node label
            target_id_key: Target node ID property name
            relationship_type: Relationship type
            relationships: List of relationship dicts with source_id, target_id, and optional properties
            batch_size: Number of relationships per batch
            
        Returns:
            Number of relationships created
        """
        created_count = 0
        
        try:
            driver = self.get_driver()
            async with driver.session() as session:
                for i in range(0, len(relationships), batch_size):
                    batch = relationships[i:i + batch_size]
                    
                    # Escape relationship type if it contains special characters
                    rel_type_escaped = f"`{relationship_type}`" if not relationship_type.replace('_', '').isalnum() else relationship_type
                    
                    # Use ON CREATE to track newly created relationships
                    # Match nodes by ID and dataset_id to ensure we're matching the correct nodes
                    # Use WHERE clause for dataset_id since it can't be in property map with rel reference
                    query = f"""
                    UNWIND $rels AS rel
                    MATCH (source:{source_label} {{{source_id_key}: rel.source_id}})
                    WHERE source.dataset_id = rel.dataset_id
                    MATCH (target:{target_label} {{{target_id_key}: rel.target_id}})
                    WHERE target.dataset_id = rel.dataset_id
                    MERGE (source)-[r:{rel_type_escaped}]->(target)
                    ON CREATE SET r = rel.props
                    ON MATCH SET r = rel.props
                    RETURN count(r) as count
                    """
                    
                    # Prepare batch data
                    batch_data = []
                    for rel in batch:
                        props = rel.get('properties', {})
                        rel_data = {
                            'source_id': rel.get('source_id'),
                            'target_id': rel.get('target_id'),
                            'dataset_id': props.get('dataset_id'),  # Extract dataset_id for matching
                            'props': props
                        }
                        batch_data.append(rel_data)
                    
                    try:
                        result = await session.run(query, {'rels': batch_data})
                        record = await result.single()
                        if record:
                            batch_created = record['count']
                            created_count += batch_created
                            logger.info(f"Batch {i//batch_size + 1}: Created/updated {batch_created}/{len(batch)} relationships of type {relationship_type}")
                            
                            if batch_created < len(batch):
                                logger.warning(
                                    f"Batch {i//batch_size + 1}: Only processed {batch_created}/{len(batch)} relationships. "
                                    f"Some source or target nodes may not exist. "
                                    f"Looking for nodes with label '{source_label}' or '{target_label}'"
                                )
                        else:
                            logger.warning(f"Batch {i//batch_size + 1}: No relationships processed - check if nodes exist")
                            logger.warning(f"Query: {query}")
                            logger.warning(f"Batch data sample: {batch_data[:2] if batch_data else 'empty'}")
                    except Exception as batch_error:
                        logger.error(f"Error processing batch {i//batch_size + 1}: {batch_error}", exc_info=True)
                        # Continue with next batch instead of failing completely
                        continue
            
            logger.info(f"Total relationships created/updated: {created_count} of type {relationship_type}")
            return created_count
        except Exception as e:
            logger.error(f"Batch relationship creation failed: {e}")
            raise
    
    async def get_schema(self) -> Dict[str, Any]:
        """
        Get Neo4j database schema information.
        
        Returns:
            Dictionary with node labels, relationship types, and their properties
        """
        try:
            schema = {
                'node_labels': [],
                'relationship_types': [],
                'properties': {}
            }
            
            # Get all node labels
            labels_query = "CALL db.labels()"
            driver = self.get_driver()
            async with driver.session() as session:
                result = await session.run(labels_query)
                labels = await result.values()
                schema['node_labels'] = [label[0] for label in labels]
            
            # Get all relationship types
            rel_types_query = "CALL db.relationshipTypes()"
            driver = self.get_driver()
            async with driver.session() as session:
                result = await session.run(rel_types_query)
                rel_types = await result.values()
                schema['relationship_types'] = [rel_type[0] for rel_type in rel_types]
            
            # Get properties for each label
            driver = self.get_driver()
            async with driver.session() as session:
                for label in schema['node_labels']:
                    query = f"""
                    MATCH (n:{label})
                    RETURN keys(n) as keys
                    LIMIT 100
                    """
                    result = await session.run(query)
                    records = await result.data()
                    if records:
                        # Get unique properties using set for O(1) lookups
                        all_keys = set()
                        for record in records:
                            all_keys.update(record.get('keys', []))
                        schema['properties'][label] = list(all_keys)
            
            logger.info(f"Schema retrieved: {len(schema['node_labels'])} labels, {len(schema['relationship_types'])} relationship types")
            return schema
        except Exception as e:
            logger.error(f"Schema retrieval failed: {e}")
            raise
    
    async def get_node_count(self, label: Optional[str] = None) -> int:
        """Get count of nodes, optionally filtered by label."""
        try:
            if label:
                query = f"MATCH (n:{label}) RETURN count(n) as count"
            else:
                query = "MATCH (n) RETURN count(n) as count"
            
            driver = self.get_driver()
            async with driver.session() as session:
                result = await session.run(query)
                record = await result.single()
                return record['count'] if record else 0
        except Exception as e:
            logger.error(f"Node count query failed: {e}")
            raise
    
    async def get_relationship_count(self, relationship_type: Optional[str] = None) -> int:
        """Get count of relationships, optionally filtered by type."""
        try:
            if relationship_type:
                query = f"MATCH ()-[r:{relationship_type}]->() RETURN count(r) as count"
            else:
                query = "MATCH ()-[r]->() RETURN count(r) as count"
            
            driver = self.get_driver()
            async with driver.session() as session:
                result = await session.run(query)
                record = await result.single()
                return record['count'] if record else 0
        except Exception as e:
            logger.error(f"Relationship count query failed: {e}")
            raise


# Singleton instance
neo4j_client = Neo4jClient()

