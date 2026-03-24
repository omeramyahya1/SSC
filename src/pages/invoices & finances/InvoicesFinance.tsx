import { useTranslation } from 'react-i18next';

export default function InvoicesFinance() {
  const { t } = useTranslation();

  return (
    <div style={{ padding: '2rem' }}>
      <h1>{t('invoicing.title')}</h1>
      <p>{t('invoicing.description')}</p>
    </div>
  );
}
