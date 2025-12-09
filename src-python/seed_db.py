import random
from datetime import datetime, timedelta
from faker import Faker
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from models import (  # Assuming these are defined in models.py
    User, ApplicationSettings, Customer, Project, Appliance, 
    SystemConfiguration, Invoice, Payment, SubscriptionPayment, 
    Subscription, Document, Authentication, SyncLog, Base # Base for table creation
) 

from db_setup import SessionLocal

# --- CONFIGURATION ---
# Database file path as specified by the user
DATABASE_URL = "sqlite:///./db/local_data.db" 
NUM_ENTRIES = 10 

# Initialize Faker for realistic data
fake = Faker(['en_US', 'ar_EG']) 


def generate_data():
    """Generates a dictionary of dummy data objects."""
    
    # --- 1. CORE USER DATA ---
    users = []
    # Use a fixed Org ID for Enterprise testing where Admin/Employee share data
    org_id = random.randint(100, 999) 
    
    for i in range(NUM_ENTRIES):
        
        account_type = random.choices(['standard', 'enterprise'], weights=[6, 4], k=1)[0]
        
        user_data = {
            'username': fake.user_name(),
            'registration_date': fake.date_time_between(start_date='-1y', end_date='now'),
            'email': fake.email(),
            'business_name': fake.company() if account_type == 'enterprise' else None,
            'account_type': account_type,
            'location': fake.city(),
            'business_logo': b'placeholder_logo', 
            'business_email': fake.company_email() if account_type == 'enterprise' else None,
            'status': random.choice(['active', 'grace']),
            'org_id': org_id if account_type == 'enterprise' else None,
            'org_name': fake.company() if account_type == 'enterprise' else None,
            'branch_id': random.randint(1, 3) if account_type == 'enterprise' else None,
            'branch_location': fake.city() if account_type == 'enterprise' else None,
            # Ensure at least one admin exists if the organization is active
            'role': random.choice(['admin', 'employee']) if account_type == 'enterprise' else None
        }
        users.append(User(**user_data))

    user_ids = [u.user_id for u in users]
    
    # --- 2. APPLICATION SETTINGS ---
    settings = []
    # We must ensure primary keys exist before creating settings, so we defer user_id assignment slightly
    temp_user_id_pool = user_ids.copy()
    for i in range(len(temp_user_id_pool)):
        settings.append(ApplicationSettings(
            language=random.choice(['ar', 'en']),
            last_saved_path=fake.file_path(extension='pdf'),
            other_settings={'theme': random.choice(['dark', 'light']), 'notifications': random.choice([True, False])},
            user_id=temp_user_id_pool.pop()
        ))

    # --- 3. CUSTOMERS ---
    customers = []
    for i in range(NUM_ENTRIES):
        owner_type = random.choice(['org', 'user'])
        
        customers.append(Customer(
            full_name=fake.name(),
            date_created=fake.date_time_between(start_date='-6m', end_date='now'),
            updated_at=fake.date_time_between(start_date='-1m', end_date='now'),
            phone_number=fake.phone_number(),
            email=fake.email(),
            org_id=org_id if owner_type == 'org' else None,
            user_id=random.choice(user_ids) if owner_type == 'user' else None
        ))
        
    # --- 4. SYSTEM CONFIGURATIONS ---
    configs = []
    for i in range(NUM_ENTRIES):
        configs.append(SystemConfiguration(
            config_items={
                'panels': random.randint(4, 12),
                'inverter': f'{random.choice([3, 5, 8])}KW',
                'battery_ah': f'{random.choice([100, 200])}Ah'
            },
            total_wattage=random.randint(1500, 5500)
        ))
    
    # The IDs for the following tables will be assigned after the objects are flushed to the DB
    # We rely on SQLAlchemy's ORM to handle primary key generation and subsequent foreign key linking.
    
    return {
        'users': users,
        'settings': settings,
        'customers': customers,
        'configs': configs,
    }

# Data dependent on flushed primary keys will be generated in populate_db()

def populate_db():
    """Initializes the database and populates it with dummy data."""
    
    session: Session = SessionLocal()
    
    try:
        
        # Enable Foreign Key enforcement in SQLite
        session.execute(text("PRAGMA foreign_keys=ON"))
        
        # --- PHASE 1: Generate and Flush Primary Keys ---
        
        # 1. Add primary objects (Users)
        core_data = generate_data()
        session.add_all(core_data['users'])
        session.add_all(core_data['settings']) # Can be added now since user_id is assigned
        session.add_all(core_data['customers'])
        session.add_all(core_data['configs'])
        session.flush() # Commit primary keys (IDs)
        
        # Now we can retrieve the generated IDs for linking
        user_ids = [u.user_id for u in core_data['users']]
        customer_ids = [c.customer_id for c in core_data['customers']]
        config_ids = [c.system_config_id for c in core_data['configs']]

        # --- PHASE 2: Generate and Add Transactional Data ---
        
        # 2. PROJECTS (Depends on User, Customer, Config)
        projects = []
        for i in range(NUM_ENTRIES):
            # Select a User object to access its org_id
            creator_user = random.choice(core_data['users'])
            
            projects.append(Project(
                date_created=fake.date_time_between(start_date='-3m', end_date='now'),
                last_edited_date=fake.date_time_between(start_date='-1w', end_date='now'),
                customer_id=random.choice(customer_ids),
                status=random.choice(['planning', 'execution', 'done', 'archived']),
                system_config_id=random.choice(config_ids),
                user_id=creator_user.user_id,
                org_id=creator_user.org_id, 
                project_location=fake.address()
            ))
        session.add_all(projects)
        session.flush() # Commit Project IDs
        project_ids = [p.project_id for p in projects]

        # 3. APPLIANCES (Depends on Project)
        appliances = []
        for project_id in project_ids:
            # Create 3 appliances per project
            for _ in range(3):
                watt = random.randint(5, 1500)
                qty = random.randint(1, 10)
                hours = random.uniform(2, 24)
                appliances.append(Appliance(
                    project_id=project_id,
                    appliance_name=random.choice(['Fridge 12ft', 'LED Light', 'Water Cooler', 'Fan', 'AC Split']),
                    type=random.choice(['Heavy', 'Light']),
                    qty=qty,
                    use_hours_night=hours,
                    wattage=watt,
                    energy_consumption=watt * qty * hours
                ))
        session.add_all(appliances)
        
        # 4. INVOICES (Depends on Project, User)
        invoices = []
        for i in range(NUM_ENTRIES):
            invoices.append(Invoice(
                project_id=random.choice(project_ids),
                user_id=random.choice(user_ids),
                amount=random.uniform(50000, 500000),
                status=random.choice(['paid', 'pending', 'partial']),
                issued_at=fake.date_time_between(start_date='-2m', end_date='now'),
                created_at=fake.date_time_between(start_date='-2m', end_date='now'),
                updated_at=fake.date_time_between(start_date='-1w', end_date='now')
            ))
        session.add_all(invoices)
        session.flush() # Commit Invoice IDs
        invoice_ids = [i.invoice_id for i in invoices]
        
        # 5. PAYMENTS (Depends on Invoice)
        payments = []
        for invoice_id in invoice_ids:
            payments.append(Payment(
                invoice_id=invoice_id,
                date_created=fake.date_time_between(start_date='-1m', end_date='now'),
                last_edited_date=fake.date_time_between(start_date='-1w', end_date='now'),
                amount=random.uniform(10000, 100000),
                method=random.choice(['Cash', 'Bank Transfer', 'Mobile Pay'])
            ))
        session.add_all(payments)

        # 6. SUBSCRIPTION PAYMENTS 
        sub_payments = []
        for i in range(NUM_ENTRIES):
            sub_payments.append(SubscriptionPayment(
                amount=random.uniform(50, 500),
                payment_method=random.choice(['Visa', 'Mastercard', 'PayPal']),
                payment_date=fake.date_time_between(start_date='-1y', end_date='now'),
                transaction_reference=b'txn_ref_placeholder',
                status=random.choice(['approved', 'declined']),
                created_at=fake.date_time_between(start_date='-1y', end_date='now'),
                updated_at=fake.date_time_between(start_date='-1m', end_date='now')
            ))
        session.add_all(sub_payments)
        session.flush()
        sub_payment_ids = [p.payment_id for p in sub_payments]
        
        # 7. SUBSCRIPTIONS (Depends on User, Sub Payments)
        subscriptions = []
        for i in range(NUM_ENTRIES):
            start_date = fake.date_time_between(start_date='-1y', end_date='now')
            
            subscriptions.append(Subscription(
                user_id=random.choice(user_ids),
                payment_id=random.choice(sub_payment_ids),
                date_created=start_date,
                expiration_date=start_date + timedelta(days=random.choice([30, 365])),
                grace_period_end=start_date + timedelta(days=random.choice([35, 370])),
                type=random.choice(['monthly', 'annual']),
                status=random.choice(['active', 'expired']),
                license_code=fake.uuid4()
            ))
        session.add_all(subscriptions)

        # 8. DOCUMENTS (Depends on Project)
        documents = []
        for project_id in project_ids:
            documents.append(Document(
                project_id=project_id,
                date_created=fake.date_time_between(start_date='-2m', end_date='now'),
                last_edited_date=fake.date_time_between(start_date='-1w', end_date='now'),
                doc_type=random.choice(['Invoice', 'Project Breakdown']),
                file_name=f'{fake.word()}_{project_id}.pdf',
                file_blob=b'pdf_document_blob'
            ))
        session.add_all(documents)

        # 9. AUTHENTICATION (Depends on User)
        authentication_records = []
        for user_id in user_ids:
            authentication_records.append(Authentication(
                user_id=user_id,
                password_hash=fake.sha256(),
                password_salt=fake.uuid4(),
                is_logged_in=random.choice([True, False]),
                last_active=fake.date_time_between(start_date='-1d', end_date='now')
            ))
        session.add_all(authentication_records)

        # 10. SYNC LOG (Depends on User)
        sync_logs = []
        for i in range(NUM_ENTRIES):
            sync_logs.append(SyncLog(
                sync_date=fake.date_time_between(start_date='-1w', end_date='now'),
                sync_type=random.choice(['full', 'incremental']),
                data_type=random.choice(['projects', 'sales', 'settings']),
                status=random.choice(['success', 'failed']),
                user_id=random.choice(user_ids)
            ))
        session.add_all(sync_logs)

        session.commit()
        print(f"✅ Database populated successfully with {NUM_ENTRIES} entries per core table.")
    
    except Exception as e:
        print("❌ Error during seeding:", e)
        session.rollback()
    finally:
        session.close()


if __name__ == '__main__':
    populate_db()