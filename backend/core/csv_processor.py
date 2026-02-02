"""
CSV processing utilities for parsing and validating node and relationship CSV files.
"""
import csv
import logging
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
from datetime import datetime
import re

logger = logging.getLogger(__name__)


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
    
    def validate(self) -> Tuple[bool, List[str], List[str]]:
        """
        Validate CSV file.
        
        Returns:
            Tuple of (is_valid, errors, warnings)
        """
        if not self.file_path.exists():
            self.errors.append(f"File not found: {self.file_path}")
            return False, self.errors, self.warnings
        
        try:
            with open(self.file_path, 'r', encoding='utf-8') as f:
                # Check if file is empty
                first_char = f.read(1)
                if not first_char:
                    self.errors.append("CSV file is empty")
                    return False, self.errors, self.warnings
                f.seek(0)
                
                # Read header
                reader = csv.reader(f)
                header = next(reader, None)
                
                if not header:
                    self.errors.append("CSV file has no header row")
                    return False, self.errors, self.warnings
                
                # Validate header
                self._validate_header(header)
                
                # Validate rows
                self._validate_rows(reader, header)
        
        except UnicodeDecodeError as e:
            self.errors.append(f"File encoding error: {e}")
            return False, self.errors, self.warnings
        except Exception as e:
            self.errors.append(f"Error reading CSV file: {e}")
            return False, self.errors, self.warnings
        
        is_valid = len(self.errors) == 0
        return is_valid, self.errors, self.warnings
    
    def _validate_header(self, header: List[str]) -> None:
        """Validate CSV header."""
        # Check for required columns
        header_lower = [col.lower().strip() for col in header]
        
        for required_col in self.REQUIRED_COLUMNS:
            if required_col.lower() not in header_lower:
                self.errors.append(f"Missing required column: {required_col}")
        
        # Check for duplicate columns
        if len(header) != len(set(header_lower)):
            duplicates = [col for col in header_lower if header_lower.count(col) > 1]
            self.errors.append(f"Duplicate columns found: {set(duplicates)}")
    
    def _validate_rows(self, reader: csv.reader, header: List[str]) -> None:
        """Validate CSV rows."""
        row_count = 0
        for row_num, row in enumerate(reader, start=2):  # Start at 2 (header is row 1)
            # Skip completely empty rows (trailing newlines)
            if not row or all(not cell.strip() for cell in row):
                continue
            
            row_count += 1
            
            # Check if row has correct number of columns
            if len(row) != len(header):
                self.errors.append(
                    f"Row {row_num}: Expected {len(header)} columns, got {len(row)}"
                )
                continue
            
            # Validate row data
            self._validate_row_data(row, header, row_num)
        
        if row_count == 0:
            self.warnings.append("CSV file has no data rows (only header)")
    
    def _validate_row_data(self, row: List[str], header: List[str], row_num: int) -> None:
        """Validate individual row data. Override in subclasses."""
        pass


class NodeCSVValidator(CSVValidator):
    """Validator for node CSV files."""
    
    REQUIRED_COLUMNS = ['id']  # At minimum, need an ID column
    
    def __init__(self, file_path: str, node_label: Optional[str] = None):
        super().__init__(file_path)
        self.node_label = node_label
    
    def _validate_row_data(self, row: List[str], header: List[str], row_num: int) -> None:
        """Validate node CSV row data."""
        row_dict = dict(zip(header, row))
        
        # Check ID column
        id_col = None
        for col in ['id', 'ID', 'Id', 'uuid', 'UUID', 'uuid_id']:
            if col in row_dict and row_dict[col]:
                id_col = col
                break
        
        if not id_col:
            self.errors.append(f"Row {row_num}: No ID column found or ID is empty")
        elif not row_dict[id_col].strip():
            self.errors.append(f"Row {row_num}: ID value is empty")
        
        # Check for empty rows (all values empty)
        if all(not val.strip() for val in row):
            self.warnings.append(f"Row {row_num}: All values are empty")


class RelationshipCSVValidator(CSVValidator):
    """Validator for relationship CSV files."""
    
    REQUIRED_COLUMNS = ['source_id', 'target_id']
    
    def __init__(self, file_path: str, relationship_type: Optional[str] = None):
        super().__init__(file_path)
        self.relationship_type = relationship_type
    
    def _validate_row_data(self, row: List[str], header: List[str], row_num: int) -> None:
        """Validate relationship CSV row data."""
        row_dict = dict(zip(header, row))
        
        # Check source_id
        source_id = row_dict.get('source_id', '').strip()
        if not source_id:
            self.errors.append(f"Row {row_num}: source_id is required and cannot be empty")
        
        # Check target_id
        target_id = row_dict.get('target_id', '').strip()
        if not target_id:
            self.errors.append(f"Row {row_num}: target_id is required and cannot be empty")
        
        # Check if source and target are the same (warning, not error)
        if source_id and target_id and source_id == target_id:
            self.warnings.append(f"Row {row_num}: source_id and target_id are the same")


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
        """Detect data types for each column."""
        if not self.data:
            return
        
        for col in self.header:
            values = [row[col] for row in self.data if row[col] is not None]
            
            if not values:
                self.metadata['data_types'][col] = 'unknown'
                self.metadata['sample_values'][col] = None
                continue
            
            # Store sample value
            self.metadata['sample_values'][col] = values[0] if values else None
            
            # Detect type
            detected_type = self._detect_column_type(values)
            self.metadata['data_types'][col] = detected_type
    
    def _detect_column_type(self, values: List[str]) -> str:
        """
        Detect the data type of a column based on sample values.
        
        Returns:
            Type string: 'integer', 'float', 'boolean', 'date', 'datetime', 'string'
        """
        if not values:
            return 'string'
        
        # Sample first 100 values for type detection
        sample = values[:100]
        
        # Check for integers
        int_count = sum(1 for v in sample if self._is_integer(v))
        if int_count == len(sample):
            return 'integer'
        
        # Check for floats
        float_count = sum(1 for v in sample if self._is_float(v))
        if float_count == len(sample):
            return 'float'
        
        # Check for booleans
        bool_count = sum(1 for v in sample if self._is_boolean(v))
        if bool_count == len(sample):
            return 'boolean'
        
        # Check for dates/datetimes
        date_count = sum(1 for v in sample if self._is_date(v))
        if date_count == len(sample):
            return 'date'
        
        datetime_count = sum(1 for v in sample if self._is_datetime(v))
        if datetime_count == len(sample):
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

