"""
Neo4j async client for graph database operations.
"""
import os
import logging
from typing import Dict, List, Optional, Any
from neo4j import AsyncGraphDatabase, AsyncDriver
from django.conf import settings

logger = logging.getLogger(__name__)


class Neo4jClient:
    """Async Neo4j client wrapper."""
    
    _driver: Optional[AsyncDriver] = None
    _instance = None
    
    def __new__(cls):
        """Singleton pattern."""
        if cls._instance is None:
            cls._instance = super(Neo4jClient, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        """Initialize Neo4j driver."""
        if self._driver is None:
            self._driver = AsyncGraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD)
            )
            logger.info("Neo4j driver initialized")
    
    async def close(self):
        """Close the driver connection."""
        if self._driver:
            await self._driver.close()
            self._driver = None
            logger.info("Neo4j driver closed")
    
    async def verify_connectivity(self) -> bool:
        """Verify connection to Neo4j database."""
        try:
            await self._driver.verify_connectivity()
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
            async with self._driver.session() as session:
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
            
            async with self._driver.session() as session:
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
                
                async with self._driver.session() as session:
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
            
            async with self._driver.session() as session:
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
            for i in range(0, len(relationships), batch_size):
                batch = relationships[i:i + batch_size]
                
                query = f"""
                UNWIND $rels AS rel
                MATCH (source:{source_label} {{{source_id_key}: rel.source_id}})
                MATCH (target:{target_label} {{{target_id_key}: rel.target_id}})
                CREATE (source)-[r:{relationship_type}]->(target)
                SET r = rel.props
                RETURN count(r) as count
                """
                
                # Prepare batch data
                batch_data = []
                for rel in batch:
                    rel_data = {
                        'source_id': rel.get('source_id'),
                        'target_id': rel.get('target_id'),
                        'props': rel.get('properties', {})
                    }
                    batch_data.append(rel_data)
                
                async with self._driver.session() as session:
                    result = await session.run(query, {'rels': batch_data})
                    record = await result.single()
                    if record:
                        created_count += record['count']
                
                logger.debug(f"Batch {i//batch_size + 1}: Created {len(batch)} relationships")
            
            logger.info(f"Created {created_count} relationships of type {relationship_type}")
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
            async with self._driver.session() as session:
                result = await session.run(labels_query)
                labels = await result.values()
                schema['node_labels'] = [label[0] for label in labels]
            
            # Get all relationship types
            rel_types_query = "CALL db.relationshipTypes()"
            async with self._driver.session() as session:
                result = await session.run(rel_types_query)
                rel_types = await result.values()
                schema['relationship_types'] = [rel_type[0] for rel_type in rel_types]
            
            # Get properties for each label
            for label in schema['node_labels']:
                query = f"""
                MATCH (n:{label})
                RETURN keys(n) as keys
                LIMIT 100
                """
                async with self._driver.session() as session:
                    result = await session.run(query)
                    records = await result.data()
                    if records:
                        # Get unique properties
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
            
            async with self._driver.session() as session:
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
            
            async with self._driver.session() as session:
                result = await session.run(query)
                record = await result.single()
                return record['count'] if record else 0
        except Exception as e:
            logger.error(f"Relationship count query failed: {e}")
            raise


# Singleton instance
neo4j_client = Neo4jClient()

