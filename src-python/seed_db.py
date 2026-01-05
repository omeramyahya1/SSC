import random
from datetime import datetime, timedelta
from faker import Faker
from sqlalchemy import text
from sqlalchemy.orm import Session
from models import (
    User, ApplicationSettings, Customer, Project, Appliance,
    SystemConfiguration, Invoice, Payment, SubscriptionPayment,
    Subscription, Document, Authentication, SyncLog, Base, SQLITE_URL
)
from db_setup import SessionLocal, engine

# --- CONFIGURATION ---
NUM_ENTRIES = 10
fake = Faker(['en_US', 'ar_EG'])

def populate_db():
    """Initializes the database and populates it with dummy data using UUIDs for relations."""
    session: Session = SessionLocal()

    try:
        # Reset the database
        print("Resetting database...")
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        session.execute(text("PRAGMA foreign_keys=ON"))
        print("Database reset complete.")

        # --- PHASE 1: Create Core Objects ---
        print("Seeding core objects...")
        users = []
        org_id = random.randint(100, 999)
        for _ in range(NUM_ENTRIES):
            is_enterprise = random.choices([True, False], weights=[0.4, 0.6], k=1)[0]
            user = User(
                username=fake.user_name(),
                email=fake.email(),
                business_name=fake.company() if is_enterprise else None,
                account_type='enterprise_tier1' if is_enterprise else 'standard',
                location=fake.city(),
                business_logo=b'placeholder_logo',
                business_email=fake.company_email() if is_enterprise else None,
                status=random.choice(['active', 'grace', 'trial']),
                org_id=org_id if is_enterprise else None,
                org_name=fake.company() if is_enterprise else None,
                branch_id=random.randint(1, 3) if is_enterprise else None,
                branch_location=fake.city() if is_enterprise else None,
                role=random.choice(['admin', 'employee']) if is_enterprise else None,
                is_dirty=True
            )
            users.append(user)
        session.add_all(users)
        session.flush() # Flush to assign UUIDs

        for user in users:
            # AppSettings
            session.add(ApplicationSettings(
                language=random.choice(['ar', 'en']),
                last_saved_path=fake.file_path(extension='pdf'),
                other_settings={'theme': random.choice(['dark', 'light']), 'notifications': random.choice([True, False])},
                user_uuid=user.uuid,
                is_dirty=True
            ))
            # Authentication
            session.add(Authentication(
                user_uuid=user.uuid,
                password_hash=fake.sha256(),
                password_salt=fake.uuid4(),
                is_logged_in=random.choice([True, False]),
                last_active=fake.date_time_between(start_date='-1d', end_date='now'),
                is_dirty=True
            ))

        customers = []
        for _ in range(NUM_ENTRIES):
            customer = Customer(
                full_name=fake.name(),
                phone_number=fake.phone_number(),
                email=fake.email(),
                org_id=org_id,
                user_uuid=random.choice(users).uuid,
                is_dirty=True
            )
            customers.append(customer)
        session.add_all(customers)

        configs = []
        for _ in range(NUM_ENTRIES):
            config = SystemConfiguration(
                config_items={'panels': random.randint(4, 12), 'inverter': f'{random.choice([3, 5, 8])}KW'},
                total_wattage=random.uniform(1500.0, 5500.0),
                is_dirty=True
            )
            configs.append(config)
        session.add_all(configs)
        session.flush()
        print("Core objects seeded.")

        # --- PHASE 2: Create Relational Objects ---
        print("Seeding relational objects...")
        projects = []
        for _ in range(NUM_ENTRIES):
            creator_user = random.choice(users)
            project = Project(
                customer_uuid=random.choice(customers).uuid,
                status=random.choice(['planning', 'execution', 'done', 'archived']),
                system_config_uuid=random.choice(configs).uuid,
                user_uuid=creator_user.uuid,
                org_id=creator_user.org_id,
                project_location=fake.address(),
                is_dirty=True
            )
            projects.append(project)
        session.add_all(projects)
        session.flush()

        for project in projects:
            # Appliances
            for _ in range(3):
                watt = random.uniform(5.0, 1500.0)
                qty = random.randint(1, 10)
                hours = random.uniform(2, 24)
                session.add(Appliance(
                    project_uuid=project.uuid,
                    appliance_name=random.choice(['Fridge 12ft', 'LED Light', 'Water Cooler', 'Fan', 'AC Split']),
                    type=random.choice(['Heavy', 'Light']),
                    qty=qty, use_hours_night=hours, wattage=watt,
                    energy_consumption=watt * qty * hours,
                    is_dirty=True
                ))
            # Documents
            session.add(Document(
                project_uuid=project.uuid,
                doc_type=random.choice(['Invoice', 'Project Breakdown']),
                file_name=f'{fake.word()}_{project.uuid[:8]}.pdf',
                file_blob=b'pdf_document_blob_placeholder',
                is_dirty=True
            ))

        invoices = []
        for _ in range(NUM_ENTRIES):
            invoice = Invoice(
                project_uuid=random.choice(projects).uuid,
                user_uuid=random.choice(users).uuid,
                amount=random.uniform(50000.0, 500000.0),
                status=random.choice(['paid', 'pending', 'partial']),
                issued_at=fake.date_time_between(start_date='-2m', end_date='now'),
                is_dirty=True
            )
            invoices.append(invoice)
        session.add_all(invoices)
        session.flush()

        for invoice in invoices:
            session.add(Payment(
                invoice_uuid=invoice.uuid,
                amount=random.uniform(10000.0, 100000.0),
                method=random.choice(['Cash', 'Bank Transfer', 'Mobile Pay']),
                is_dirty=True
            ))
        print("Relational objects seeded.")

        # --- PHASE 3: Subscription and SyncLog Logic ---
        print("Seeding subscriptions and logs...")
        for user in users:
            start_date = fake.date_time_between(start_date='-1y', end_date='now')
            sub_type = random.choice(['monthly', 'annual', 'lifetime', 'trial'])

            subscription = Subscription(
                user_uuid=user.uuid,
                expiration_date=start_date + timedelta(days=365 if sub_type == 'annual' else 30),
                grace_period_end=start_date + timedelta(days=370 if sub_type == 'annual' else 35),
                type=sub_type,
                status=random.choice(['active', 'expired']),
                license_code=fake.uuid4(),
                is_dirty=True
            )
            session.add(subscription)
            session.flush()  # Get subscription.uuid

            session.add(SubscriptionPayment(
                subscription_uuid=subscription.uuid,
                amount=random.uniform(50.0, 500.0),
                payment_method=random.choice(['Visa', 'Mastercard', 'PayPal']),
                trx_no=fake.bothify(text='txn_????_##########'),
                trx_screenshot=b'screenshot_blob_placeholder',
                status=random.choice(['approved', 'declined', 'under_processing']),
                is_dirty=True
            ))

            # SyncLog (not synced itself, so is_dirty=False)
            session.add(SyncLog(
                sync_type=random.choice(['full', 'incremental']),
                table_name=random.choice(['projects', 'customers', 'settings']),
                status=random.choice(['success', 'failed']),
                user_uuid=user.uuid
            ))
        print("Subscriptions and logs seeded.")

        session.commit()
        print(f"✅ Database populated successfully with {NUM_ENTRIES} entries per core table.")

    except Exception as e:
        print(f"❌ Error during seeding: {e}")
        session.rollback()
    finally:
        session.close()

if __name__ == '__main__':
    populate_db()