/* ========================================================
   SEED DATA FOR UPDATED PRICING STRUCTURE
======================================================== */

-- 1. Clear existing data
TRUNCATE TABLE public.pricing_discounts CASCADE;
TRUNCATE TABLE public.pricing CASCADE;

-- 2. Insert standard Plans
INSERT INTO public.pricing (plan_type, billing_cycle, base_price, price_per_extra_employee)
VALUES
    ('standard', 'monthly', 50000, 0),
    ('standard', 'annual', 360000, 0),
    ('standard', 'lifetime', 500000, 0);

-- 3. Insert enterprise Plans
INSERT INTO public.pricing (plan_type, billing_cycle, base_price, price_per_extra_employee)
VALUES
    ('enterprise', 'monthly', 50000, 5000),
    ('enterprise', 'annual', 360000, 40000),
    ('enterprise', 'lifetime', 500000, 100000);

-- 4. Link Discount Tiers to all enterprise plans
-- This loops through every plan marked 'enterprise' and adds the 4 tiers
DO $$
DECLARE
    enterprise_id UUID;
BEGIN
    FOR enterprise_id IN (SELECT id FROM public.pricing WHERE plan_type = 'enterprise')
    LOOP
        INSERT INTO public.pricing_discounts (plan_id, min_employees, max_employees, discount_rate)
        VALUES
            (enterprise_id, 1, 5, 0.00),
            (enterprise_id, 6, 10, 0.04),
            (enterprise_id, 11, 15, 0.06),
            (enterprise_id, 16, 20, 0.10);
    END LOOP;
END;
$$;

CREATE OR REPLACE VIEW public.detailed_pricing AS
SELECT
    p.id as plan_id,
    p.plan_type,
    p.billing_cycle,
    p.base_price,
    p.price_per_extra_employee,
    d.min_employees,
    d.max_employees,
    d.discount_rate
FROM public.pricing p
LEFT JOIN public.pricing_discounts d ON p.id = d.plan_id
ORDER BY p.plan_type, p.base_price;


