import React from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from './spinner';

interface TCContentProps {
  content: any;
  isLoading?: boolean;
  metadata?: any;
}

export const TCContent: React.FC<TCContentProps> = ({ content, isLoading, metadata }) => {
  const { t, i18n } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-neutral/50">
        <p>{t('common.error', 'Error')}</p>
        <p className="text-xs">Failed to load Terms & Conditions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-neutral/80 p-4" dir={i18n.dir()}>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-primary">{content.title}</h2>
        <p className="text-sm italic leading-relaxed text-neutral/60">{content.preamble}</p>
      </div>

      <div className="space-y-8">
        {content.sections.map((section: any, idx: number) => (
          <div key={idx} className="space-y-4">
            <h3 className="text-lg font-bold border-b border-neutral/20 pb-2 text-neutral">{section.header}</h3>
            {Object.entries(section.body).map(([subHeader, points]: [string, any], sIdx) => (
              <div key={sIdx} className="space-y-3">
                <h4 className="text-xs font-bold text-primary/70 uppercase tracking-widest">{subHeader}</h4>
                <ul className="list-disc ps-5 space-y-2">
                  {points.map((point: string, pIdx: number) => (
                    <li key={pIdx} className="text-sm leading-relaxed text-neutral/70">
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="pt-8 border-t border-neutral/20 space-y-4">
        <p className="text-sm font-bold text-primary text-center uppercase tracking-tight">
          {content.agreement_text}
        </p>
        {metadata?.last_updated && (
          <p className="text-[10px] text-center text-neutral/40 uppercase tracking-widest">
            {metadata.last_updated}
          </p>
        )}
      </div>
    </div>
  );
};
