"""
CSV processing utilities for parsing and validating node and relationship CSV files.

This module provides comprehensive CSV validation, type detection, and parsing
functionality for both node and relationship CSV files with proper error handling
and performance optimizations.
"""
import csv
import logging
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)

# Constants
TYPE_DETECTION_SAMPLE_SIZE = 100
MAX_ROW_VALIDATION = 10000  # Limit row validation for very large files


class CSVProcessingError(Exception):
    """Custom exception for CSV processing errors."""
    pass


class CSVValidator:
    """Base CSV validator class."""
    
    REQUIRED_COLUMNS = []
    
    def __init__(self, file_path: str):
        self.file_path = Path(file_path)
        self.errors = []
        self.warnings = []
        self.missing_required_columns = []  # Track missing columns from header validation
        self.is_relationship_file = False  # Track if file has relationship columns
    
    def validate(self) -> Tuple[bool, List[str], List[str]]:
        """
        Validate CSV file.
        
        Returns:
            Tuple of (is_valid, errors, warnings)
        """
        if not self.file_path.exists():
            self.errors.append(f"File not found: {self.file_path.name}")
            return False, self.errors, self.warnings
        
        try:
            with open(self.file_path, 'r', encoding='utf-8') as f:
                # Check if file is empty
                first_char = f.read(1)
                if not first_char:
                    self.errors.append("Empty file")
                    return False, self.errors, self.warnings
                f.seek(0)
                
                # Read header - First row MUST contain column headers
                reader = csv.reader(f)
                header = next(reader, None)
                
                if not header:
                    self.errors.append("First row MUST contain column headers (property names)")
                    return False, self.errors, self.warnings
                
                # Validate header format
                if not all(col.strip() for col in header):
                    self.errors.append("First row MUST contain column headers (property names)")
                    return False, self.errors, self.warnings
                
                # Detect file type and validate required columns
                self._validate_required_columns(header)
                
                # Validate header for duplicates
                self._validate_header_duplicates(header)
                
                # Validate rows
                self._validate_rows(reader, header)
        
        except csv.Error as e:
            self.errors.append(f"CSV parsing error: {e}")
            return False, self.errors, self.warnings
        except UnicodeDecodeError as e:
            self.errors.append(f"File encoding error: {e}")
            return False, self.errors, self.warnings
        except Exception as e:
            self.errors.append(f"Error reading CSV file: {e}")
            return False, self.errors, self.warnings
        
        # Consolidate similar errors before returning
        self._consolidate_errors()
        
        is_valid = len(self.errors) == 0
        return is_valid, self.errors, self.warnings
    
    def _consolidate_errors(self) -> None:
        """Consolidate similar errors into simplified messages - show header errors only once."""
        if not self.errors:
            return
        
        # Track which columns are missing at header level
        missing_header_cols = set(self.missing_required_columns)
        
        # Remove duplicates and filter out redundant row-level errors
        seen = set()
        consolidated = []
        
        for error in self.errors:
            # Skip duplicates
            if error in seen:
                continue
            seen.add(error)
            
            # Keep header-level errors (required fields messages)
            if "For node files required fields" in error or "For relationship files required fields" in error:
                consolidated.append(error)
            # Skip row-level "Missing column" errors if column is already flagged at header level
            elif "Row" in error and "Missing" in error:
                # Check if this row error is about a column we already flagged at header level
                error_lower = error.lower()
                is_redundant = any(col.lower() in error_lower for col in missing_header_cols)
                if not is_redundant:
                    consolidated.append(error)
            else:
                # Keep all other errors (empty values, column count mismatches, etc.)
                consolidated.append(error)
        
        self.errors = consolidated
    
    def _validate_required_columns(self, header: List[str]) -> None:
        """Validate required columns - check both node and relationship requirements."""
        header_lower = [col.lower().strip() for col in header]
        header_set = set(header_lower)  # Use set for O(1) lookup
        
        has_id = 'id' in header_set
        has_source_id = 'source_id' in header_set
        has_target_id = 'target_id' in header_set
        
        # If file has source_id or target_id, it's likely a relationship file
        # Check relationship requirements first
        if has_source_id or has_target_id:
            self.is_relationship_file = True
            missing_rel_cols = []
            if not has_source_id:
                missing_rel_cols.append('source_id')
                self.missing_required_columns.append('source_id')
            if not has_target_id:
                missing_rel_cols.append('target_id')
                self.missing_required_columns.append('target_id')
            
            if missing_rel_cols:
                cols_str = " and ".join(missing_rel_cols)
                self.errors.append(f"For relationship files required fields: {cols_str}")
        else:
            # No relationship columns, check node requirements
            self.is_relationship_file = False
            if not has_id:
                self.missing_required_columns.append('id')
                self.errors.append("For node files required fields: id")
    
    def _validate_header_duplicates(self, header: List[str]) -> None:
        """Validate header for duplicate columns."""
        header_lower = [col.lower().strip() for col in header]
        header_set = set(header_lower)
        
        # Check for duplicate columns (O(n) instead of O(n²))
        if len(header) != len(header_set):
            seen = set()
            duplicates = []
            for col in header_lower:
                if col in seen and col not in duplicates:
                    duplicates.append(col)
                seen.add(col)
            self.errors.append(f"Duplicate columns: {', '.join(duplicates)}")
    
    def _validate_rows(self, reader: csv.reader, header: List[str]) -> None:
        """
        Validate CSV rows - All rows must have the same number of columns.
        
        For very large files, validation is limited to first MAX_ROW_VALIDATION rows
        to prevent performance issues.
        """
        row_count = 0
        expected_col_count = len(header)
        validation_limit = MAX_ROW_VALIDATION
        
        for row_num, row in enumerate(reader, start=2):  # Start at 2 (header is row 1)
            # Skip completely empty rows (trailing newlines)
            if not row or all(not cell.strip() for cell in row):
                continue
            
            row_count += 1
            
            # Limit validation for very large files
            if row_count > validation_limit:
                if row_count == validation_limit + 1:
                    self.warnings.append(
                        f"File has more than {validation_limit} rows. "
                        f"Validation limited to first {validation_limit} rows."
                    )
                continue
            
            # All rows must have the same number of columns
            if len(row) != expected_col_count:
                self.errors.append(
                    f"Row {row_num}: All rows must have the same number of columns "
                    f"({len(row)} vs {expected_col_count})"
                )
                continue
            
            # Validate CSV escaping for special characters
            self._validate_csv_escaping(row, row_num)
            
            # Validate row data
            self._validate_row_data(row, header, row_num)
        
        if row_count == 0:
            self.warnings.append("No data rows found")
    
    def _validate_csv_escaping(self, row: List[str], row_num: int) -> None:
        """Validate proper CSV escaping for special characters."""
        # Check for unescaped quotes, commas, and newlines
        for col_idx, cell in enumerate(row, start=1):
            if not cell:  # Skip empty cells
                continue
                
            # Check for unescaped quotes (quotes should be doubled or escaped)
            if '"' in cell:
                quote_count = cell.count('"')
                # If odd number of quotes and not properly quoted, warn
                is_quoted = cell.startswith('"') and cell.endswith('"')
                if quote_count % 2 != 0 and not is_quoted:
                    self.warnings.append(
                        f"Row {row_num}, Column {col_idx}: Possible unescaped quote - Proper CSV escaping for special characters required"
                    )
            
            # Check for unescaped newlines (newlines in CSV should be within quoted fields)
            if ('\n' in cell or '\r' in cell) and not (cell.startswith('"') and cell.endswith('"')):
                self.warnings.append(
                    f"Row {row_num}, Column {col_idx}: Newline detected - Proper CSV escaping for special characters required"
                )
    
    def _validate_row_data(self, row: List[str], header: List[str], row_num: int) -> None:
        """Validate individual row data. Override in subclasses."""
        pass


class NodeCSVValidator(CSVValidator):
    """Validator for node CSV files."""
    
    REQUIRED_COLUMNS = ['id']  # At minimum, need an ID column
    
    def __init__(self, file_path: str, node_label: Optional[str] = None):
        super().__init__(file_path)
        self.node_label = node_label
    
    def _validate_header(self, header: List[str]) -> None:
        """Validate CSV header - uses base class unified validation."""
        # Use the unified validation from base class
        self._validate_required_columns(header)
        self._validate_header_duplicates(header)
    
    def _validate_row_data(self, row: List[str], header: List[str], row_num: int) -> None:
        """Validate node CSV row data."""
        # Skip node validation if this is a relationship file
        if self.is_relationship_file:
            return
        
        row_dict = dict(zip(header, row))
        
        # Skip ID column validation if it's already missing from header
        if 'id' in self.missing_required_columns:
            return
        
        # Check ID column - find case-insensitive match
        id_col = next((col for col in row_dict if col.lower() == 'id'), None)
        
        if not id_col:
            # This shouldn't happen if header validation passed, but handle it gracefully
            if 'id' not in self.missing_required_columns:
                self.errors.append(f"Row {row_num}: Missing 'id' column")
        elif not row_dict[id_col] or not str(row_dict[id_col]).strip():
            self.errors.append(f"Row {row_num}: Empty 'id' value")
        
        # Check for empty rows (all values empty)
        if all(not val.strip() for val in row):
            self.warnings.append(f"Row {row_num}: Empty row")


class RelationshipCSVValidator(CSVValidator):
    """Validator for relationship CSV files."""
    
    REQUIRED_COLUMNS = ['source_id', 'target_id']
    
    def __init__(self, file_path: str, relationship_type: Optional[str] = None):
        super().__init__(file_path)
        self.relationship_type = relationship_type
    
    def _validate_header(self, header: List[str]) -> None:
        """Validate CSV header - uses base class unified validation."""
        # Use the unified validation from base class
        self._validate_required_columns(header)
        self._validate_header_duplicates(header)
    
    def _validate_row_data(self, row: List[str], header: List[str], row_num: int) -> None:
        """Validate relationship CSV row data."""
        row_dict = dict(zip(header, row))
        
        # Skip validation for columns already flagged as missing from header
        skip_source_id_check = 'source_id' in self.missing_required_columns
        skip_target_id_check = 'target_id' in self.missing_required_columns
        
        # Find source_id and target_id columns (case-insensitive)
        source_id_col = next((col for col in header if col.lower().strip() == 'source_id'), None)
        target_id_col = next((col for col in header if col.lower().strip() == 'target_id'), None)
        
        # Check source_id
        if skip_source_id_check:
            source_id = None
        elif source_id_col:
            source_id = str(row_dict.get(source_id_col, '')).strip()
            if not source_id:
                self.errors.append(f"Row {row_num}: Empty 'source_id'")
        else:
            # This shouldn't happen if header validation passed
            # Only add error if we haven't already flagged this column as missing
            if 'source_id' not in self.missing_required_columns:
                self.errors.append(f"Row {row_num}: Missing 'source_id' column")
            source_id = None
        
        # Check target_id
        if skip_target_id_check:
            target_id = None
        elif target_id_col:
            target_id = str(row_dict.get(target_id_col, '')).strip()
            if not target_id:
                self.errors.append(f"Row {row_num}: Empty 'target_id'")
        else:
            # This shouldn't happen if header validation passed
            # Only add error if we haven't already flagged this column as missing
            if 'target_id' not in self.missing_required_columns:
                self.errors.append(f"Row {row_num}: Missing 'target_id' column")
            target_id = None
        
        # Check if source and target are the same (warning, not error)
        if source_id and target_id and source_id == target_id:
            self.warnings.append(f"Row {row_num}: The source and target IDs are the same. This creates a self-referencing relationship.")


class CSVProcessor:
    """CSV file processor for parsing and type detection."""
    
    def __init__(self, file_path: str):
        self.file_path = Path(file_path)
        self.data = []
        self.header = []
        self.metadata = {
            'row_count': 0,
            'column_count': 0,
            'data_types': {},
            'sample_values': {}
        }
    
    def parse(self) -> List[Dict[str, Any]]:
        """
        Parse CSV file and return list of dictionaries.
        
        Returns:
            List of dictionaries, one per row
        """
        try:
            with open(self.file_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                self.header = reader.fieldnames or []
                self.metadata['column_count'] = len(self.header)
                
                for row in reader:
                    # Convert empty strings to None
                    processed_row = {
                        k: (v.strip() if v else None) 
                        for k, v in row.items()
                    }
                    self.data.append(processed_row)
                    self.metadata['row_count'] += 1
                
                # Detect data types
                self._detect_data_types()
                
                logger.info(
                    f"Parsed CSV file: {self.metadata['row_count']} rows, "
                    f"{self.metadata['column_count']} columns"
                )
                
                return self.data
        
        except Exception as e:
            logger.error(f"Error parsing CSV file: {e}")
            raise CSVProcessingError(f"Failed to parse CSV file: {e}")
    
    def _detect_data_types(self) -> None:
        """Detect data types for each column using optimized list comprehension."""
        if not self.data:
            return
        
        # Pre-extract non-null values for all columns at once for better performance
        for col in self.header:
            # Use generator expression for memory efficiency
            values = [row[col] for row in self.data if row.get(col) is not None]
            
            if not values:
                self.metadata['data_types'][col] = 'unknown'
                self.metadata['sample_values'][col] = None
                continue
            
            # Store sample value
            self.metadata['sample_values'][col] = values[0]
            
            # Detect type
            detected_type = self._detect_column_type(values)
            self.metadata['data_types'][col] = detected_type
    
    def _detect_column_type(self, values: List[str]) -> str:
        """
        Detect the data type of a column based on sample values.
        
        Uses early return pattern for performance optimization.
        
        Returns:
            Type string: 'integer', 'float', 'boolean', 'date', 'datetime', 'string'
        """
        if not values:
            return 'string'
        
        # Sample values for type detection (optimize for large files)
        sample = values[:TYPE_DETECTION_SAMPLE_SIZE]
        
        # Check for integers (most common, check first)
        if all(self._is_integer(v) for v in sample):
            return 'integer'
        
        # Check for floats
        if all(self._is_float(v) for v in sample):
            return 'float'
        
        # Check for booleans
        if all(self._is_boolean(v) for v in sample):
            return 'boolean'
        
        # Check for dates/datetimes
        if all(self._is_date(v) for v in sample):
            return 'date'
        
        if all(self._is_datetime(v) for v in sample):
            return 'datetime'
        
        # Default to string
        return 'string'
    
    @staticmethod
    def _is_integer(value: str) -> bool:
        """Check if value is an integer."""
        try:
            int(value)
            return True
        except (ValueError, TypeError):
            return False
    
    @staticmethod
    def _is_float(value: str) -> bool:
        """Check if value is a float."""
        try:
            float(value)
            return True
        except (ValueError, TypeError):
            return False
    
    @staticmethod
    def _is_boolean(value: str) -> bool:
        """Check if value is a boolean."""
        return value.lower() in ['true', 'false', '1', '0', 'yes', 'no']
    
    @staticmethod
    def _is_date(value: str) -> bool:
        """Check if value is a date."""
        date_formats = [
            '%Y-%m-%d',
            '%m/%d/%Y',
            '%d/%m/%Y',
            '%Y/%m/%d',
        ]
        for fmt in date_formats:
            try:
                datetime.strptime(value, fmt)
                return True
            except ValueError:
                continue
        return False
    
    @staticmethod
    def _is_datetime(value: str) -> bool:
        """Check if value is a datetime."""
        datetime_formats = [
            '%Y-%m-%d %H:%M:%S',
            '%Y-%m-%dT%H:%M:%S',
            '%Y-%m-%d %H:%M:%S.%f',
            '%Y-%m-%dT%H:%M:%S.%f',
            '%m/%d/%Y %H:%M:%S',
        ]
        for fmt in datetime_formats:
            try:
                datetime.strptime(value, fmt)
                return True
            except ValueError:
                continue
        return False
    
    def convert_value(self, value: str, data_type: str) -> Any:
        """
        Convert string value to appropriate Python type.
        
        Args:
            value: String value to convert
            data_type: Detected data type
            
        Returns:
            Converted value
        """
        if value is None or value == '':
            return None
        
        try:
            if data_type == 'integer':
                return int(value)
            elif data_type == 'float':
                return float(value)
            elif data_type == 'boolean':
                return value.lower() in ['true', '1', 'yes']
            elif data_type == 'date':
                # Try common date formats
                for fmt in ['%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y']:
                    try:
                        return datetime.strptime(value, fmt).date()
                    except ValueError:
                        continue
                return value  # Return as string if parsing fails
            elif data_type == 'datetime':
                # Try common datetime formats
                for fmt in ['%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S.%f']:
                    try:
                        return datetime.strptime(value, fmt)
                    except ValueError:
                        continue
                return value  # Return as string if parsing fails
            else:
                return value  # String type
        except (ValueError, TypeError) as e:
            logger.warning(f"Failed to convert value '{value}' to {data_type}: {e}")
            return value  # Return original value if conversion fails
    
    def get_metadata(self) -> Dict[str, Any]:
        """Get CSV file metadata."""
        return {
            'file_path': str(self.file_path),
            'file_name': self.file_path.name,
            'row_count': self.metadata['row_count'],
            'column_count': self.metadata['column_count'],
            'columns': self.header,
            'data_types': self.metadata['data_types'],
            'sample_values': self.metadata['sample_values'],
        }


def validate_node_csv(file_path: str, node_label: Optional[str] = None) -> Tuple[bool, List[str], List[str]]:
    """
    Validate a node CSV file.
    
    Args:
        file_path: Path to CSV file
        node_label: Optional node label for context
        
    Returns:
        Tuple of (is_valid, errors, warnings)
    """
    validator = NodeCSVValidator(file_path, node_label)
    return validator.validate()


def validate_relationship_csv(file_path: str, relationship_type: Optional[str] = None) -> Tuple[bool, List[str], List[str]]:
    """
    Validate a relationship CSV file.
    
    Args:
        file_path: Path to CSV file
        relationship_type: Optional relationship type for context
        
    Returns:
        Tuple of (is_valid, errors, warnings)
    """
    validator = RelationshipCSVValidator(file_path, relationship_type)
    return validator.validate()


def detect_file_type(file_path: str) -> str:
    """
    Detect if a CSV file is a node or relationship file by examining its header.
    
    Args:
        file_path: Path to CSV file
        
    Returns:
        'node' or 'relationship'
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            header = next(reader, None)
            
            if not header:
                # Default to node if we can't read header
                return 'node'
            
            header_lower = [col.lower().strip() for col in header]
            
            # Check if it has relationship indicators
            has_source_id = 'source_id' in header_lower
            has_target_id = 'target_id' in header_lower
            
            if has_source_id and has_target_id:
                return 'relationship'
            
            # Default to node
            return 'node'
    except Exception as e:
        logger.warning(f"Error detecting file type for {file_path}: {e}")
        # Default to node on error
        return 'node'


def parse_csv(file_path: str) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Parse a CSV file and return data with metadata.
    
    Args:
        file_path: Path to CSV file
        
    Returns:
        Tuple of (data_rows, metadata)
    """
    processor = CSVProcessor(file_path)
    data = processor.parse()
    metadata = processor.get_metadata()
    return data, metadata

