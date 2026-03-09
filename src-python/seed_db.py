import random
from datetime import datetime, timedelta
from faker import Faker
from sqlalchemy import text
from sqlalchemy.orm import Session
import uuid as uuid_pkg

from models import (
    User, ApplicationSettings, Customer, Project, Appliance,
    SystemConfiguration, Invoice, Payment, SubscriptionPayment,
    Subscription, Document, Authentication, SyncLog, Organization, Branch,
    InventoryCategory, InventoryItem, StockAdjustment, ProjectComponent,
    Base, SQLITE_URL
)
from db_setup import SessionLocal, engine

# --- CONFIGURATION ---
NUM_ENTRIES = 5
fake = Faker(['en_US', 'ar_EG'])
TARGET_PROJECT_UUID = "61b69d03-d7f7-4043-aff2-47fadbf551bf"

def populate_db():
    """Initializes the database and populates it with dummy data using UUIDs for relations."""
    session: Session = SessionLocal()

    try:
        # Reset the database
        print("Resetting database...")
        # Base.metadata.drop_all(bind=engine)
        # Base.metadata.create_all(bind=engine)
        # session.execute(text("PRAGMA foreign_keys=ON"))
        print("Database reset complete.")

        # --- PHASE 0: Organizations & Branches ---
        print("Seeding organizations and branches...")
        # orgs = []
        # for _ in range(2):
        #     org = Organization(
        #         name=fake.company(),
        #         plan_type=random.choice(['standard', 'enterprise_tier1', 'enterprise_tier2']),
        #         is_dirty=True
        #     )
        #     orgs.append(org)
        # session.add_all(orgs)
        # session.flush()

        # branches = []
        # for org in orgs:
        #     for _ in range(2):
        #         branch = Branch(
        #             name=f"{org.name} - {fake.city()} Branch",
        #             location=fake.address(),
        #             organization_uuid=org.uuid,
        #             is_dirty=True
        #         )
        #         branches.append(branch)
        # session.add_all(branches)
        # session.flush()

        # --- PHASE 1: Create Core Objects (Users, Inventory) ---
        print("Seeding core objects...")
        # users = []
        # for _ in range(NUM_ENTRIES):
        #     selected_branch = random.choice(branches)
        #     user = User(
        #         username=fake.user_name(),
        #         email=fake.email(),
        #         business_name=fake.company(),
        #         account_type=random.choice(['standard', 'enterprise_tier1', 'enterprise_tier2']),
        #         location=fake.city(),
        #         business_logo=b'placeholder_logo',
        #         business_email=fake.company_email(),
        #         status=random.choice(['active', 'grace', 'trial']),
        #         organization_uuid=selected_branch.organization_uuid,
        #         branch_uuid=selected_branch.uuid,
        #         role=random.choice(['admin', 'employee']),
        #         is_dirty=True
        #     )
        #     users.append(user)
        # session.add_all(users)
        # session.flush()

        # Inventory Categories
        categories = []
        cat_names = ["Solar Panels", "Inverters", "Batteries", "Mounting Structures", "Cables"]
        spec_schemas = [
            {"wattage": "W", "voltage": "V"},
            {"capacity": "kW", "efficiency": "%"},
            {"capacity": "Ah", "voltage": "V"},
            {"material": "str", "type": "str"},
            {"length": "m", "gauge": "AWG"}
        ]

        for i, name in enumerate(cat_names):
            cat = InventoryCategory(
                name=name,
                organization_uuid="9592695f-d305-4497-bfec-5977aa094577",
                spec_schema=spec_schemas[i],
                is_dirty=True
            )
            categories.append(cat)
        session.add_all(categories)
        session.flush()

        # Inventory Items
        items = []
        for cat in categories:
            for _ in range(3):
                item = InventoryItem(
                    organization_uuid="9592695f-d305-4497-bfec-5977aa094577",
                    branch_uuid="a203af6b-e2e6-445a-8f06-43f595e50cbe",
                    name=f"{cat.name} {fake.word().upper()}-{random.randint(100, 999)}",
                    sku=fake.unique.ean8(),
                    brand=fake.company(),
                    model=fake.bothify(text='MOD-####'),
                    category_uuid=cat.uuid,
                    technical_specs={"param1": random.randint(1, 100), "param2": "value"},
                    quantity_on_hand=random.randint(50, 200),
                    low_stock_threshold=10,
                    buy_price=random.uniform(100.0, 1000.0),
                    sell_price=random.uniform(120.0, 1500.0),
                    is_dirty=True
                )
                items.append(item)
        session.add_all(items)
        session.flush()

        # for user in users:
        #     session.add(ApplicationSettings(
        #         language=random.choice(['ar', 'en']),
        #         last_saved_path=fake.file_path(extension='pdf'),
        #         other_settings={'theme': random.choice(['dark', 'light'])},
        #         user_uuid=user.uuid,
        #         is_dirty=True
        #     ))
        #     session.add(Authentication(
        #         user_uuid=user.uuid,
        #         password_hash=fake.sha256(),
        #         password_salt=fake.uuid4(),
        #         is_logged_in=random.choice([True, False]),
        #         last_active=fake.date_time_between(start_date='-1d', end_date='now'),
        #         is_dirty=True
        #     ))

        # customers = []
        # for _ in range(NUM_ENTRIES):
        #     user = random.choice(users)
        #     customer = Customer(
        #         full_name=fake.name(),
        #         phone_number=fake.phone_number(),
        #         email=fake.email(),
        #         organization_uuid=user.organization_uuid,
        #         branch_uuid=user.branch_uuid,
        #         user_uuid=user.uuid,
        #         is_dirty=True
        #     )
        #     customers.append(customer)
        # session.add_all(customers)

        # configs = []
        # for _ in range(NUM_ENTRIES):
        #     config = SystemConfiguration(
        #         config_items={'panels': random.randint(4, 12), 'inverter': f'{random.choice([3, 5, 8])}KW'},
        #         total_wattage=random.uniform(1500.0, 5500.0),
        #         is_dirty=True
        #     )
        #     configs.append(config)
        # session.add_all(configs)
        # session.flush()

        # --- PHASE 2: Relational Objects (Projects, Invoices) ---
        print("Seeding relational objects...")
        # projects = []

        # Create the specific target project
        # target_user = users[0]
        # target_project = Project(
        #     uuid=TARGET_PROJECT_UUID,
        #     customer_uuid=customers[0].uuid,
        #     status='execution',
        #     system_config_uuid=configs[0].uuid,
        #     user_uuid=target_user.uuid,
        #     organization_uuid=target_user.organization_uuid,
        #     branch_uuid=target_user.branch_uuid,
        #     project_location=fake.address(),
        #     is_dirty=True
        # )
        # projects.append(target_project)

        # for _ in range(NUM_ENTRIES - 1):
        #     creator_user = random.choice(users)
        #     project = Project(
        #         customer_uuid=random.choice(customers).uuid,
        #         status=random.choice(['planning', 'execution', 'done', 'archived']),
        #         system_config_uuid=random.choice(configs).uuid,
        #         user_uuid=creator_user.uuid,
        #         organization_uuid=creator_user.organization_uuid,
        #         branch_uuid=creator_user.branch_uuid,
        #         project_location=fake.address(),
        #         is_dirty=True
        #     )
        #     projects.append(project)
        # session.add_all(projects)
        # session.flush()

        # for project in projects:
        #     # Appliances
        #     for _ in range(3):
        #         watt = random.uniform(5.0, 1500.0)
        #         qty = random.randint(1, 10)
        #         hours = random.uniform(2, 24)
        #         session.add(Appliance(
        #             project_uuid=project.uuid,
        #             appliance_name=random.choice(['Fridge', 'LED Light', 'Fan', 'AC']),
        #             type=random.choice(['Heavy', 'Light']),
        #             qty=qty, use_hours_night=hours, wattage=watt,
        #             energy_consumption=watt * qty * hours,
        #             is_dirty=True
        #         ))

        #     # Project Components
        #     num_components = random.randint(2, 5)
        #     selected_items = random.sample(items, num_components)
        #     for item in selected_items:
        #         session.add(ProjectComponent(
        #             project_uuid=project.uuid,
        #             item_uuid=item.uuid,
        #             quantity=random.randint(1, 10),
        #             price_at_sale=item.sell_price,
        #             is_recommended=random.choice([True, False]),
        #             is_dirty=True
        #         ))

        # # Stock Adjustments
        # for _ in range(10):
        #     item = random.choice(items)
        #     session.add(StockAdjustment(
        #         organization_uuid=item.organization_uuid,
        #         branch_uuid=item.branch_uuid,
        #         item_uuid=item.uuid,
        #         adjustment=random.randint(-5, 20),
        #         reason=random.choice(["Restock", "Sale", "Damage", "Return"]),
        #         is_dirty=True
        #     ))

        # invoices = []
        # for _ in range(NUM_ENTRIES):
        #     invoice = Invoice(
        #         project_uuid=random.choice(projects).uuid,
        #         user_uuid=random.choice(users).uuid,
        #         amount=random.uniform(50000.0, 500000.0),
        #         status=random.choice(['paid', 'pending', 'partial']),
        #         issued_at=fake.date_time_between(start_date='-2m', end_date='now'),
        #         is_dirty=True
        #     )
        #     invoices.append(invoice)
        # session.add_all(invoices)
        # session.flush()

        # # --- PHASE 3: Subscriptions and Logs ---
        # print("Seeding subscriptions and logs...")
        # for user in users:
        #     sub = Subscription(
        #         user_uuid=user.uuid,
        #         expiration_date=datetime.utcnow() + timedelta(days=30),
        #         type='monthly',
        #         status='active',
        #         license_code=fake.uuid4(),
        #         is_dirty=True
        #     )
        #     session.add(sub)

        session.commit()
        print(f"✅ Database populated successfully.")
        print(f"Target project UUID: {TARGET_PROJECT_UUID}")

    except Exception as e:
        print(f"❌ Error during seeding: {e}")
        session.rollback()
    finally:
        session.close()

if __name__ == '__main__':
    populate_db()
