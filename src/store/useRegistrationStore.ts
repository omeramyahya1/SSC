import { create } from 'zustand';

// --- Types ---
export type RegistrationState = {
  stage1: {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
  };
  stage2: {
    accountType: 'Standard' | 'Enterprise' | '';
  };
  stage3: {
    plan: 'Monthly' | 'Annual' | 'Lifetime' | 'Tier1' | 'Tier2' | 'Free Trial' | '';
    employees: number; // For Enterprise Tier 1
    tier1Duration: 'Monthly' | 'Annual' | 'Lifetime' | 'Free Trial'; // For Enterprise Tier 1 duration
  };
  stage4: {
    businessName: string; // Or Organization Name
    locationState: string;
    locationCity: string;
    latitude: string;
    longitude: string;
    logo: string | null; // Base64
    logoPreview: string | null;
    isSkipped: boolean;
  };
  stage5: {
    acceptedTerms: boolean;
    acceptedProcessing: boolean;
  };
  stage6: {
    paymentMethod: string;
    referralCode: string;
    discountApplied: boolean;
    confirmedTransfer: boolean; 
  };
  stage7: {
    referenceNumber: string;
    receipt: string | null; // Base64
    receiptPreview: string | null;
  };
};

export const INITIAL_STATE: RegistrationState = {
  stage1: { username: '', email: '', password: '', confirmPassword: '' },
  stage2: { accountType: '' },
  stage3: { plan: '', employees: 1, tier1Duration: 'Monthly' },
  stage4: { businessName: '', locationState: '', locationCity: '', latitude: '', longitude: '', logo: null, logoPreview: null, isSkipped: false },
  stage5: { acceptedTerms: false, acceptedProcessing: false },
  stage6: { paymentMethod: '', referralCode: '', discountApplied: false, confirmedTransfer: false },
  stage7: { referenceNumber: '', receipt: null, receiptPreview: null },
};

type SubscriptionConfig = {
  basePrice: number;
  pricePerEmployee: number; // The "n_employees" from prompt likely means cost factor
  discountRate: number; // e.g., 0.1 for 10%
};

type RegistrationStore = {
  formData: RegistrationState;
  subscriptionConfig: SubscriptionConfig;
  calculatedPrice: number;
  
  // Actions
  updateFormData: <S extends keyof RegistrationState>(stage: S, data: Partial<RegistrationState[S]>) => void;
  fetchSubscriptionConfig: () => Promise<void>;
  calculatePrice: () => void;
  getPlanDetails: () => { backendAccountType: string; backendPlanType: string; price: number };
  reset: () => void;
};

export const useRegistrationStore = create<RegistrationStore>((set, get) => ({
  formData: INITIAL_STATE,
  subscriptionConfig: {
    basePrice: 10000, // Default fallback
    pricePerEmployee: 1000,
    discountRate: 0,
  },
  calculatedPrice: 0,

  updateFormData: (stage, data) => {
    set((state) => {
        const newState = {
            ...state,
            formData: {
                ...state.formData,
                [stage]: { ...state.formData[stage], ...data }
            }
        };
        return newState;
    });
    // Trigger Recalculation
    get().calculatePrice();
  },

  fetchSubscriptionConfig: async () => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    const mockConfig: SubscriptionConfig = {
        basePrice: 15000, // Example Base Price in SDG
        pricePerEmployee: 2000,
        discountRate: 0.2, // 20% Discount if applicable (or fetched generally)
    };
    set({ subscriptionConfig: mockConfig });
    get().calculatePrice();
  },

  calculatePrice: () => {
    const { formData, subscriptionConfig } = get();
    const { stage2, stage3, stage6 } = formData;
    
    // No free trial for enterprise
    if (stage2.accountType === 'Enterprise' && stage3.tier1Duration === 'Free Trial') {
        set({ calculatedPrice: 0 });
        // This case should be prevented by UI, but as a safeguard.
        return;
    }

    if (stage3.plan === 'Free Trial') {
        set({ calculatedPrice: 0 });
        return;
    }

    let base = 0;
    let employeeCost = 0;
    
    if (stage2.accountType === 'Standard') {
        if (stage3.plan === 'Monthly') base = 5000;
        if (stage3.plan === 'Annual') base = 50000;
        if (stage3.plan === 'Lifetime') base = 150000;
        employeeCost = 0; // Employee count is 1, but no per-employee cost for standard
    } else if (stage2.accountType === 'Enterprise') {
        if (stage3.plan === 'Tier1') {
             let durationMultiplier = 1;
             if (stage3.tier1Duration === 'Annual') durationMultiplier = 10;
             if (stage3.tier1Duration === 'Lifetime') durationMultiplier = 30;

             base = 20000 * durationMultiplier;
             employeeCost = (subscriptionConfig.pricePerEmployee * stage3.employees) * durationMultiplier;
        }
    }

    let total = base + employeeCost;
    
    let discount = 0;
    if (stage6.discountApplied) {
        discount = 0.1;
    }

    total = total * (1 - discount);
    
    set({ calculatedPrice: Math.round(total) });
  },

  getPlanDetails: () => {
    const { formData, calculatedPrice } = get();
    const { stage2, stage3 } = formData;

    let backendAccountType = 'standard';
    let backendPlanType = 'trial'; // Default

    if (stage2.accountType === 'Standard') {
        backendAccountType = 'standard';
        if (stage3.plan === 'Free Trial') {
            backendPlanType = 'trial';
        } else {
            backendPlanType = stage3.plan.toLowerCase();
        }
    } else if (stage2.accountType === 'Enterprise') {
        if (stage3.plan === 'Tier1') {
            backendAccountType = 'enterprise_tier1';
            backendPlanType = stage3.tier1Duration.toLowerCase();
        } else if (stage3.plan === 'Tier2') {
            backendAccountType = 'enterprise_tier2';
            backendPlanType = 'custom'; // Placeholder for contact sales
        }
    }

    return {
        backendAccountType,
        backendPlanType,
        price: calculatedPrice,
    }
  },

  reset: () => set({ formData: INITIAL_STATE, calculatedPrice: 0 })
}));
