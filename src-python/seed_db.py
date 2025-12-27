import random
from datetime import datetime, timedelta
from faker import Faker
from sqlalchemy import text
from sqlalchemy.orm import Session
from models import (
    User, ApplicationSettings, Customer, Project, Appliance, 
    SystemConfiguration, Invoice, Payment, SubscriptionPayment, 
    Subscription, Document, Authentication, SyncLog, Base
) 
from db_setup import SessionLocal

# --- CONFIGURATION ---
DATABASE_URL = "sqlite:///./db/local_data.db" 
NUM_ENTRIES = 10 
fake = Faker(['en_US', 'ar_EG']) 

def populate_db():
    """Initializes the database and populates it with dummy data."""
    session: Session = SessionLocal()
    
    try:
        session.execute(text("PRAGMA foreign_keys=ON"))

        # --- PHASE 1: Create Core Objects ---
        users = []
        org_id = random.randint(100, 999) 
        for _ in range(NUM_ENTRIES):
            account_type = random.choices(['standard', 'enterprise'], weights=[6, 4], k=1)[0]
            user = User(
                username=fake.user_name(),
                email=fake.email(),
                business_name=fake.company() if account_type == 'enterprise' else None,
                account_type=account_type,
                location=fake.city(),
                business_logo=b'placeholder_logo', 
                business_email=fake.company_email() if account_type == 'enterprise' else None,
                status=random.choice(['active', 'grace', 'trial']),
                org_id=org_id if account_type == 'enterprise' else None,
                org_name=fake.company() if account_type == 'enterprise' else None,
                branch_id=random.randint(1, 3) if account_type == 'enterprise' else None,
                branch_location=fake.city() if account_type == 'enterprise' else None,
                role=random.choice(['admin', 'employee']) if account_type == 'enterprise' else None
            )
            users.append(user)
        session.add_all(users)
        session.flush()
        user_ids = [u.user_id for u in users]

        for user_id in user_ids:
            # AppSettings
            session.add(ApplicationSettings(
                language=random.choice(['ar', 'en']),
                last_saved_path=fake.file_path(extension='pdf'),
                other_settings={'theme': random.choice(['dark', 'light']), 'notifications': random.choice([True, False])},
                user_id=user_id
            ))
            # Authentication
            session.add(Authentication(
                user_id=user_id,
                password_hash=fake.sha256(),
                password_salt=fake.uuid4(),
                is_logged_in=random.choice([True, False]),
                last_active=fake.date_time_between(start_date='-1d', end_date='now')
            ))

        customers = []
        for _ in range(NUM_ENTRIES):
            owner_type = random.choice(['org', 'user'])
            customer = Customer(
                full_name=fake.name(),
                phone_number=fake.phone_number(),
                email=fake.email(),
                org_id=org_id if owner_type == 'org' else None,
                user_id=random.choice(user_ids) if owner_type == 'user' else None
            )
            customers.append(customer)
        session.add_all(customers)

        configs = []
        for _ in range(NUM_ENTRIES):
            config = SystemConfiguration(
                config_items={'panels': random.randint(4, 12), 'inverter': f'{random.choice([3, 5, 8])}KW'},
                total_wattage=random.randint(1500, 5500)
            )
            configs.append(config)
        session.add_all(configs)
        session.flush()

        customer_ids = [c.customer_id for c in customers]
        config_ids = [c.system_config_id for c in configs]

        # --- PHASE 2: Create Relational Objects ---
        projects = []
        for _ in range(NUM_ENTRIES):
            creator_user = random.choice(users)
            project = Project(
                customer_id=random.choice(customer_ids),
                status=random.choice(['planning', 'execution', 'done', 'archived']),
                system_config_id=random.choice(config_ids),
                user_id=creator_user.user_id,
                org_id=creator_user.org_id, 
                project_location=fake.address()
            )
            projects.append(project)
        session.add_all(projects)
        session.flush()
        project_ids = [p.project_id for p in projects]

        for project_id in project_ids:
            # Appliances
            for _ in range(3):
                watt = random.randint(5, 1500)
                qty = random.randint(1, 10)
                hours = random.uniform(2, 24)
                session.add(Appliance(
                    project_id=project_id,
                    appliance_name=random.choice(['Fridge 12ft', 'LED Light', 'Water Cooler', 'Fan', 'AC Split']),
                    type=random.choice(['Heavy', 'Light']),
                    qty=qty, use_hours_night=hours, wattage=watt,
                    energy_consumption=watt * qty * hours
                ))
            # Documents
            session.add(Document(
                project_id=project_id,
                doc_type=random.choice(['Invoice', 'Project Breakdown']),
                file_name=f'{fake.word()}_{project_id}.pdf',
                file_blob=b'pdf_document_blob'
            ))

        invoices = []
        for _ in range(NUM_ENTRIES):
            invoice = Invoice(
                project_id=random.choice(project_ids),
                user_id=random.choice(user_ids),
                amount=random.uniform(50000, 500000),
                status=random.choice(['paid', 'pending', 'partial']),
                issued_at=fake.date_time_between(start_date='-2m', end_date='now')
            )
            invoices.append(invoice)
        session.add_all(invoices)
        session.flush()
        invoice_ids = [i.invoice_id for i in invoices]

        for invoice_id in invoice_ids:
            session.add(Payment(
                invoice_id=invoice_id,
                amount=random.uniform(10000, 100000),
                method=random.choice(['Cash', 'Bank Transfer', 'Mobile Pay'])
            ))

        # --- PHASE 3: Subscription and SyncLog Logic ---
        for user_id in user_ids:
            # Create Subscription and its Payment together
            start_date = fake.date_time_between(start_date='-1y', end_date='now')
            sub_type = random.choice(['monthly', 'annual', 'lifetime', 'trial'])
            
            subscription = Subscription(
                user_id=user_id,
                expiration_date=start_date + timedelta(days=365 if sub_type=='annual' else 30),
                grace_period_end=start_date + timedelta(days=370 if sub_type=='annual' else 35),
                type=sub_type,
                status=random.choice(['active', 'expired']),
                license_code=fake.uuid4()
            )
            session.add(subscription)
            session.flush() # Get subscription.subscription_id

            session.add(SubscriptionPayment(
                subscription_id=subscription.subscription_id,
                amount=random.uniform(50, 500),
                payment_method=random.choice(['Visa', 'Mastercard', 'PayPal']),
                transaction_reference=b'txn_ref_placeholder',
                status=random.choice(['approved', 'declined', 'under_processing'])
            ))

            # SyncLog
            session.add(SyncLog(
                sync_type=random.choice(['full', 'incremental']),
                table_name=random.choice(['projects', 'customers', 'settings']),
                status=random.choice(['success', 'failed']),
                user_id=user_id
            ))

        session.commit()
        print(f"✅ Database populated successfully with {NUM_ENTRIES} entries per core table.")
    
    except Exception as e:
        print("❌ Error during seeding:", e)
        session.rollback()
    finally:
        session.close()

if __name__ == '__main__':
    populate_db()