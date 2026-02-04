"""
Generate sample CSV files with 50,000 entries for testing progress bars.
"""
import csv
from datetime import datetime, timedelta

# Generate User_50k.csv
print("Generating User_50k.csv...")
base_date = datetime(2024, 1, 15)
names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Edward', 'Fiona', 'George', 'Hannah', 'Ian', 'Julia', 
         'Kevin', 'Laura', 'Michael', 'Nancy', 'Oliver', 'Patricia', 'Quinn', 'Rachel', 'Steven', 'Tina']
surnames = ['Johnson', 'Smith', 'Brown', 'Prince', 'Norton', 'Apple', 'Washington', 'Montana', 'Fleming', 'Roberts',
            'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris']
domains = ['example.com', 'test.com', 'demo.com', 'sample.com']

with open('User_50k.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerow(['id', 'name', 'email', 'created_at'])
    
    for i in range(1, 50001):
        name_idx = (i - 1) % len(names)
        surname_idx = (i - 1) % len(surnames)
        domain_idx = (i - 1) % len(domains)
        name = f'{names[name_idx]} {surnames[surname_idx]}'
        email = f'{names[name_idx].lower()}.{surnames[surname_idx].lower()}@{domains[domain_idx]}'
        date = base_date + timedelta(days=(i - 1) % 365)
        writer.writerow([i, name, email, date.strftime('%Y-%m-%d')])
        
        if i % 10000 == 0:
            print(f"  Generated {i} rows...")

print("User_50k.csv generated successfully!")

# Generate FOLLOWS_50k.csv
print("\nGenerating FOLLOWS_50k.csv...")
base_date = datetime(2024, 2, 1)

with open('FOLLOWS_50k.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerow(['source_id', 'target_id', 'since', 'relationship_strength'])
    
    for i in range(1, 50001):
        source_id = ((i - 1) % 1000) + 1
        target_id = ((i * 7) % 1000) + 1
        if target_id == source_id:
            target_id = (target_id % 1000) + 1
        date = base_date + timedelta(days=(i - 1) % 365)
        strength = ['weak', 'medium', 'strong'][i % 3]
        writer.writerow([source_id, target_id, date.strftime('%Y-%m-%d'), strength])
        
        if i % 10000 == 0:
            print(f"  Generated {i} rows...")

print("FOLLOWS_50k.csv generated successfully!")
print("\nBoth files generated successfully! You can now use them to test progress bars.")

