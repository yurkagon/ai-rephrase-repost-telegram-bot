import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

const steps = [
  'guideChannels',
  'guideBot',
  'guideRoute',
  'guideForward',
  'guideRewrite',
  'guidePublish',
];

export function GuidePage() {
  const { t } = useTranslation();
  const flow = ['guideOtherChannels', 'guideCollectionChannel', 'inbox', 'target'];

  return (
    <article className="settings-page guide-page">
      <header className="page-heading">
        <div>
          <h1>{t('guideTitle')}</h1>
          <p>{t('guideIntro')}</p>
        </div>
      </header>

      <section className="guide-flow" aria-labelledby="guide-flow-title">
        <h2 id="guide-flow-title">{t('guideFlowTitle')}</h2>
        <ol>
          {flow.map((key, index) => (
            <li key={key}>
              <span>{t(key)}</span>
              {index < flow.length - 1 && <ArrowRight size={18} aria-hidden="true" />}
            </li>
          ))}
        </ol>
        <p>{t('guideManual')}</p>
      </section>

      <section aria-labelledby="guide-steps-title">
        <h2 id="guide-steps-title">{t('guideStepsTitle')}</h2>
        <ol className="guide-steps">
          {steps.map((key) => (
            <li key={key}>
              <h3>{t(`${key}Title`)}</h3>
              <p>{t(`${key}Body`)}</p>
            </li>
          ))}
        </ol>
        <div className="guide-actions">
          <Link className="button primary" to="/channels">
            {t('channels')}
          </Link>
          <Link className="button secondary" to="/routes">
            {t('routes')}
          </Link>
          <Link className="button secondary" to="/workspace">
            {t('inbox')}
          </Link>
        </div>
      </section>

      <section className="guide-troubleshooting" aria-labelledby="guide-troubleshooting-title">
        <h2 id="guide-troubleshooting-title">{t('guideTroubleshootingTitle')}</h2>
        <p>{t('guideTroubleshootingBody')}</p>
        <p>{t('guideNewPostsOnly')}</p>
      </section>
    </article>
  );
}
