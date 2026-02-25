// src/pages/CustomersPage.tsx
import { useEffect } from 'react';
import { useCustomerStore, NewCustomerData } from '@/store/useCustomerStore';

export default function CustomersPage() {
  const { customers, isLoading, error, fetchCustomers, createCustomer } = useCustomerStore();

  // Fetch customers when the component mounts
  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Handler to create a new customer with dummy data
  const handleCreateCustomer = () => {
    const newCustomer: NewCustomerData = {
      full_name: `New Customer ${Date.now()}`,
      email: `customer${Date.now()}@example.com`,
      phone_number: '123-456-7890',
      // org_id and user_id can be set according to your application's logic
    };

    createCustomer(newCustomer)
      .then(() => {
        console.log('Customer created successfully!');
      })
      .catch((e) => {
        console.error('Failed to create customer:', e);
      });
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Customers</h1>

      <button
        onClick={handleCreateCustomer}
        disabled={isLoading}
        style={{ marginBottom: '1rem' }}
      >
        {isLoading ? 'Creating...' : 'Create New Customer'}
      </button>

      {isLoading && customers.length === 0 && <p>Loading customers...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {!isLoading && !error && customers.length === 0 && (
        <p>No customers found. Create one to get started!</p>
      )}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {customers.map((customer) => (
          <li key={customer.customer_id} style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '1rem', marginBottom: '0.5rem' }}>
            <strong>{customer.full_name}</strong>
            <p>Email: {customer.email}</p>
            <p>Phone: {customer.phone_number}</p>
            <p>Joined: {new Date(customer.created_at).toLocaleDateString()}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
