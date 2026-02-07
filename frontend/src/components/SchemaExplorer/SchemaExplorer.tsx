/**
 * Schema Explorer Sidebar Component
 */
import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@/components/Icons/Icons';
import type { Schema, NodeLabel, RelationshipType } from '@/types';
import './SchemaExplorer.css';

interface SchemaExplorerProps {
  schema: Schema | null;
  loading?: boolean;
  onInsertNodeLabel?: (label: string) => void;
  onInsertRelationshipType?: (type: string) => void;
  onInsertProperty?: (property: string) => void;
}

const SchemaExplorer = ({
  schema,
  loading = false,
  onInsertNodeLabel,
  onInsertRelationshipType,
  onInsertProperty,
}: SchemaExplorerProps) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['nodes', 'relationships'])
  );
  const [expandedLabels, setExpandedLabels] = useState<Set<string>>(new Set());

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const toggleLabel = (label: string) => {
    const newExpanded = new Set(expandedLabels);
    if (newExpanded.has(label)) {
      newExpanded.delete(label);
    } else {
      newExpanded.add(label);
    }
    setExpandedLabels(newExpanded);
  };

  const handleNodeLabelClick = (label: string) => {
    if (onInsertNodeLabel) {
      onInsertNodeLabel(label);
    }
  };

  const handleRelationshipTypeClick = (type: string) => {
    if (onInsertRelationshipType) {
      onInsertRelationshipType(type);
    }
  };

  const handlePropertyClick = (property: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onInsertProperty) {
      onInsertProperty(property);
    }
  };

  if (loading) {
    return (
      <div className="schema-explorer">
        <div className="schema-explorer-header">
          <h3>Schema Explorer</h3>
        </div>
        <div className="schema-explorer-content">
          <div className="schema-loading">Loading schema...</div>
        </div>
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="schema-explorer">
        <div className="schema-explorer-header">
          <h3>Schema Explorer</h3>
        </div>
        <div className="schema-explorer-content">
          <div className="schema-empty">No schema data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className="schema-explorer">
      <div className="schema-explorer-header">
        <h3>Schema Explorer</h3>
        <div className="schema-stats">
          <span className="stat-item">
            {schema.total_nodes.toLocaleString()} nodes
          </span>
          <span className="stat-item">
            {schema.total_relationships.toLocaleString()} rels
          </span>
        </div>
      </div>

      <div className="schema-explorer-content">
        {/* Node Labels Section */}
        <div className="schema-section">
          <div
            className="schema-section-header"
            onClick={() => toggleSection('nodes')}
          >
            {expandedSections.has('nodes') ? (
              <ChevronDownIcon size={16} />
            ) : (
              <ChevronRightIcon size={16} />
            )}
            <span className="section-title">Node Labels ({schema.node_labels.length})</span>
          </div>

          {expandedSections.has('nodes') && (
            <div className="schema-section-content">
              {schema.node_labels.length === 0 ? (
                <div className="schema-empty-item">No node labels found</div>
              ) : (
                schema.node_labels.map((nodeLabel: NodeLabel) => (
                  <div key={nodeLabel.label} className="schema-item">
                    <div
                      className="schema-item-header"
                      onClick={() => toggleLabel(nodeLabel.label)}
                    >
                      {expandedLabels.has(nodeLabel.label) ? (
                        <ChevronDownIcon size={14} />
                      ) : (
                        <ChevronRightIcon size={14} />
                      )}
                      <button
                        className="schema-item-label"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNodeLabelClick(nodeLabel.label);
                        }}
                        title={`Click to insert: ${nodeLabel.label}`}
                      >
                        {nodeLabel.label}
                      </button>
                      <span className="schema-item-count">
                        {nodeLabel.count.toLocaleString()}
                      </span>
                    </div>

                    {expandedLabels.has(nodeLabel.label) && (
                      <div className="schema-item-properties">
                        {nodeLabel.properties && nodeLabel.properties.length > 0 ? (
                          <>
                            <div className="properties-header">Properties:</div>
                            <div className="properties-list">
                              {nodeLabel.properties.map((prop) => (
                                <button
                                  key={prop}
                                  className="property-item"
                                  onClick={(e) => handlePropertyClick(prop, e)}
                                  title={`Click to insert: ${prop}`}
                                >
                                  {prop}
                                </button>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="properties-empty">No properties</div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Relationship Types Section */}
        <div className="schema-section">
          <div
            className="schema-section-header"
            onClick={() => toggleSection('relationships')}
          >
            {expandedSections.has('relationships') ? (
              <ChevronDownIcon size={16} />
            ) : (
              <ChevronRightIcon size={16} />
            )}
            <span className="section-title">
              Relationship Types ({schema.relationship_types.length})
            </span>
          </div>

          {expandedSections.has('relationships') && (
            <div className="schema-section-content">
              {schema.relationship_types.length === 0 ? (
                <div className="schema-empty-item">No relationship types found</div>
              ) : (
                schema.relationship_types.map((relType: RelationshipType) => (
                  <div key={relType.type} className="schema-item">
                    <button
                      className="schema-item-label relationship-type"
                      onClick={() => handleRelationshipTypeClick(relType.type)}
                      title={`Click to insert: ${relType.type}`}
                    >
                      {relType.type}
                    </button>
                      <span className="schema-item-count">
                        {relType.count.toLocaleString()}
                      </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SchemaExplorer;

