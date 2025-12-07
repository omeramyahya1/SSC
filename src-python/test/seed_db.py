# seed_db.py

import random
from datetime import datetime, timedelta
from faker import Faker
from sqlalchemy.orm import Session
from models import (
    Organization, Branch, User, OrganizationUser, Authentication,
    Customer, License, Subscription, Payment, LicenseAudit,
    ApplicationSetting, Project, Appliance, SolarSystemConfig,
    ProjectItem, SyncLog
)
from db_setup import initialize_database

fake = Faker()
SessionLocal = initialize_database()


# ------------------------------
# Helper functions
# ------------------------------

def random_date(days_back=200):
    """Return a random datetime within the past X days."""
    return datetime.now() - timedelta(days=random.randint(0, days_back))

def rand_choice(options):
    return random.choice(options)


# ------------------------------
# Seeder Main Function
# ------------------------------

def seed_database():
    session: Session = SessionLocal()

    try:
        # --------------------------
        # 1. ORGANIZATIONS
        # --------------------------
        organizations = []
        for _ in range(5):
            org = Organization(
                organization_name=fake.company(),
                legal_email=fake.company_email(),
                registration_date=random_date(),
                status=rand_choice(['active', 'suspended', 'pending']),
                created_at=random_date(),
                updated_at=datetime.now()
            )
            session.add(org)
            organizations.append(org)

        # --------------------------
        # 3. USERS
        # --------------------------
        users = []
        for _ in range(10):
            usr = User(
                username=fake.user_name(),
                business_name=fake.company(),
                email=fake.email(),
                phone_number=fake.phone_number(),
                location=fake.address(),
                logo_path=fake.file_path(extension="png"),
                business_email=fake.company_email(),
                business_phone=fake.phone_number(),
                registration_date=random_date(),
                status=rand_choice(['active', 'expired', 'trial', 'grace']),
                language=rand_choice([1, 2]),  # Assuming 1 for 'en', 2 for 'ar'
                created_at=random_date(),
                updated_at=datetime.now()
            )
            session.add(usr)
            users.append(usr)

        session.flush()  # Flush to get IDs for relationships before commit

        # --------------------------
        # 2. BRANCHES
        # --------------------------
        branches = []
        for org in organizations:
            for _ in range(random.randint(1, 3)):
                br = Branch(
                    organization_id=org.organization_id,
                    branch_name=fake.city(),
                    branch_location=fake.address(),
                    contact_email=fake.email(),
                    contact_phone=fake.phone_number(),
                    created_at=random_date(),
                    updated_at=datetime.now()
                )
                session.add(br)
                branches.append(br)
        
        session.flush() # Flush to get IDs for relationships before commit

        # --------------------------
        # 4. ORGANIZATION USERS (mapping)
        # --------------------------
        for usr in users:
            org = rand_choice(organizations)
            # Ensure branch belongs to the organization for logical consistency
            org_branches = [b for b in branches if b.organization_id == org.organization_id]
            if not org_branches:
                continue
            branch = rand_choice(org_branches)
            
            mapping = OrganizationUser(
                organization_id=org.organization_id,
                branch_id=branch.branch_id,
                user_id=usr.user_id,
                role=rand_choice(['admin', 'manager', 'user']),
                is_active=True,
                created_at=random_date()
            )
            session.add(mapping)

        # --------------------------
        # 5. AUTHENTICATION
        # --------------------------
        for usr in users:
            auth = Authentication(
                user_id=usr.user_id,
                password_hash=fake.sha256(),
                password_salt=fake.md5(),
                current_jwt=None,
                jwt_issued_at=None,
                device_id=fake.uuid4(),
                is_logged_in=rand_choice([True, False]),
                last_active=random_date(),
                created_at=random_date(),
                updated_at=datetime.now()
            )
            session.add(auth)

        # --------------------------
        # 6. CUSTOMERS
        # --------------------------
        customers = []
        for org in organizations:
            for _ in range(5):
                org_branches = [b for b in branches if b.organization_id == org.organization_id]
                if not org_branches:
                    continue
                cust = Customer(
                    organization_id=org.organization_id,
                    branch_id=rand_choice(org_branches).branch_id,
                    name=fake.name(),
                    contact_email=fake.email(),
                    contact_phone=fake.phone_number(),
                    address=fake.address(),
                    tax_id=fake.uuid4(),
                    notes=fake.text(),
                    created_at=random_date(),
                    updated_at=datetime.now()
                )
                session.add(cust)
                customers.append(cust)
        
        session.flush() # Flush to get IDs for relationships before commit

        # --------------------------
        # 7. LICENSES
        # --------------------------
        licenses = []
        for _ in range(10):
            lic = License(
                license_code=fake.uuid4(),
                license_plan=rand_choice(['monthly', 'annual', 'lifetime']),
                issued_for_org_id=rand_choice(organizations).organization_id,
                issued_for_user_id=rand_choice(users).user_id,
                issued_at=random_date(),
                expires_at=datetime.now() + timedelta(days=365),
                max_seats=random.randint(1, 100),
                created_at=random_date(),
                updated_at=datetime.now()
            )
            session.add(lic)
            licenses.append(lic)

        # --------------------------
        # 9. PAYMENTS
        # --------------------------
        payments = []
        for usr in users:
            payment = Payment(
                user_id=usr.user_id,
                paymed_date=random_date(),
                payment_method=rand_choice(['bankak','fawry','bnmb','ocash','mycashi','bravo','bede','other']),
                amount=random.randint(10, 500),
                transaction_ref=fake.uuid4(),
                verified_by=fake.name(),
                verification_date=random_date(),
                status=rand_choice(['pending','verified','rejected']),
                created_at=random_date(),
                updated_at=datetime.now()
            )
            session.add(payment)
            payments.append(payment)
        
        session.flush()

        # --------------------------
        # 8. SUBSCRIPTIONS
        # --------------------------
        for lic in licenses:
            sub = Subscription(
                user_id=lic.issued_for_user_id,
                license_code=lic.license_code,
                plan_type=lic.license_plan,
                start_date=random_date(),
                end_date=datetime.now() + timedelta(days=365),
                grace_period_end=datetime.now() + timedelta(days=380),
                is_active=True,
                verification_status=rand_choice(['pending','verified','revoked']),
                issued_by=fake.name(),
                payment_id=rand_choice(payments).payment_id,
                created_at=random_date(),
                updated_at=datetime.now()
            )
            session.add(sub)

        # --------------------------
        # 10. LICENSE AUDIT
        # --------------------------
        for lic in licenses:
            audit = LicenseAudit(
                license_code=lic.license_code,
                checked_at_local=random_date(),
                server_time=datetime.now(),
                server_signature=fake.sha256(),
                verification_result=rand_choice(['ok','tampered','expired','unknown']),
                notes=fake.text(),
                created_at=datetime.now()
            )
            session.add(audit)

        # --------------------------
        # 11. APPLICATION SETTINGS
        # --------------------------
        for org in organizations:
            setting = ApplicationSetting(
                organization_id=org.organization_id,
                key_name=fake.word(),
                value=fake.word(),
                value_type="string",
                updated_by_user=rand_choice(users).user_id,
                updated_at=random_date()
            )
            session.add(setting)

        # --------------------------
        # 12. PROJECTS
        # --------------------------
        projects = []
        for _ in range(15):
            pr = Project(
                user_id=rand_choice(users).user_id,
                organization_id=rand_choice(organizations).organization_id,
                branch_id=rand_choice(branches).branch_id,
                customer_id=rand_choice(customers).customer_id,
                client_name=fake.name(),
                project_status=rand_choice(['under evaluation','under execution','executed','canceled','other']),
                created_at=random_date(),
                updated_at=datetime.now(),
                total_cost=random.randint(1000, 50000),
                proposal_path=None,
                loads_breakdown_path=None
            )
            session.add(pr)
            projects.append(pr)

        session.flush()

        # --------------------------
        # 13. APPLIANCES
        # --------------------------
        for pr in projects:
            for _ in range(random.randint(1, 5)):
                ap = Appliance(
                    project_id=pr.project_id,
                    appliance_name=fake.word(),
                    wattage=random.randint(100, 3000),
                    quantiy=random.randint(1, 5),
                    user_time_hours=random.randint(1, 24),
                    energy_consumption=random.randint(1, 100)
                )
                session.add(ap)

        # --------------------------
        # 14. SOLAR SYSTEM CONFIG
        # --------------------------
        for pr in projects:
            cfg = SolarSystemConfig(
                project_id=pr.project_id,
                panel_brand=fake.company(),
                panel_type="Mono",
                panel_wattage=random.randint(100, 600),
                panel_connection=rand_choice(['series','parallel','mixed']),
                inverter_brand=fake.company(),
                inverter_capacity=random.randint(1000, 10000),
                battery_brand=fake.company(),
                battery_type=rand_choice(['liquid','dry','lithium','mixed']),
                battery_connection=rand_choice(['series','parallel','mixed']),
                total_system_cost=random.randint(1000, 50000)
            )
            session.add(cfg)

        # --------------------------
        # 15. PROJECT ITEMS
        # --------------------------
        for pr in projects:
            for _ in range(random.randint(2, 10)):
                item = ProjectItem(
                    project_id=pr.project_id,
                    item_category=rand_choice(['panel','inverter','battery','accessory']),
                    item_name=fake.word(),
                    unit_price=random.randint(10, 500),
                    quantity=random.randint(1, 10),
                    total_price=random.randint(50, 2000)
                )
                session.add(item)

        # --------------------------
        # 16. SYNC LOG
        # --------------------------
        for usr in users:
            log = SyncLog(
                sync_date=random_date(),
                user_id=usr.user_id,
                sync_type=rand_choice(["upload", "download"]),
                data_type=rand_choice(['projects','proposals','sales','settings']),
                status=rand_choice(["success", "failed"]),
                notes=fake.text()
            )
            session.add(log)
        
        # --- Single Commit for Efficiency ---
        session.commit()

        print("🎉 Database seeding completed successfully!")

    except Exception as e:
        print("❌ Error during seeding:", e)
        session.rollback()
    finally:
        session.close()


if __name__ == "__main__":
    seed_database()
