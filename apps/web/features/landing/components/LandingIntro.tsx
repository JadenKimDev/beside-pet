'use client';

/**
 * 히어로 아래의 소개: "이렇게 함께해요" 카드 셋(bg-sunk 띠), 네 걸음, 약속 띠(bg-sunk).
 * 글은 모두 landing.* 와 taskLabels 에서 온다. 약속에는 링크를 걸지 않는다(ADR-0012).
 */
import type { ReactNode } from 'react';
import { Card, cx, Icon, type IconName, JOURNEY_STEPS } from '@/components/ui';
import { useTranslations } from '@/i18n/I18nProvider';

const FEATURE_ICONS: readonly IconName[] = ['chat', 'paw', 'book'];
const PROMISE_ICONS: readonly IconName[] = ['lock', 'trash', 'lifebuoy'];
const STEP_IDS = Array.from({ length: JOURNEY_STEPS }, (_, index) => (index + 1) as 1 | 2 | 3 | 4);

function Band({ sunk, children }: { sunk?: boolean; children: ReactNode }) {
  return (
    <section className={cx('py-[88px] max-sm:py-14', sunk && 'bg-bg-sunk')}>
      <div className="mx-auto w-full max-w-wide px-8 max-sm:px-4">{children}</div>
    </section>
  );
}

function BandHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mx-auto mb-12 max-w-[560px] text-center">
      <span className="text-eyebrow font-semibold text-accent-ink uppercase">{eyebrow}</span>
      <h2 className="mt-2.5 mb-0 text-display-s font-bold max-sm:text-[28px]">{title}</h2>
    </div>
  );
}

function IconTile({ name }: { name: IconName }) {
  return (
    <span className="mb-[18px] grid size-11 place-items-center rounded-xl bg-accent-soft text-accent-ink [&_svg]:size-[22px]">
      <Icon name={name} />
    </span>
  );
}

export function LandingIntro() {
  const translations = useTranslations();
  const t = translations.landing;
  const features = [t.feature1, t.feature2, t.feature3];

  return (
    <>
      <Band sunk>
        <BandHead eyebrow={t.featuresEyebrow} title={t.featuresTitle} />
        <ul className="m-0 grid list-none grid-cols-3 gap-5 p-0 max-lg:grid-cols-1">
          {features.map((feature, index) => (
            <Card as="li" key={feature.title} className="p-7">
              <IconTile name={FEATURE_ICONS[index] ?? 'sparkle'} />
              <h3 className="m-0 text-h3 font-semibold">{feature.title}</h3>
              <p className="mt-2 mb-0 text-[15px] text-fg-muted">{feature.body}</p>
            </Card>
          ))}
        </ul>
      </Band>

      <Band>
        <BandHead eyebrow={t.stepsEyebrow} title={t.stepsTitle} />
        <ol className="m-0 grid list-none grid-cols-4 gap-4 p-0 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {STEP_IDS.map((id, index) => (
            <li key={id} className="rounded-lg border border-border bg-surface px-5 py-[22px]">
              <div className="font-serif text-[28px] leading-none text-accent-ink">{id}</div>
              <h3 className="mt-3 mb-0 text-h3 font-semibold">{translations.taskLabels[id]}</h3>
              <p className="mt-1.5 mb-0 text-sm text-fg-muted">{t.stepsDesc[index]}</p>
            </li>
          ))}
        </ol>
      </Band>

      <Band sunk>
        <ul className="m-0 grid list-none grid-cols-3 gap-8 p-0 max-lg:grid-cols-1">
          {t.promise.map((item, index) => (
            <li key={item.title}>
              <h3 className="m-0 flex items-center gap-2.5 text-h3 font-semibold">
                <span className="text-accent-ink [&_svg]:size-5">
                  <Icon name={PROMISE_ICONS[index] ?? 'check'} />
                </span>
                {item.title}
              </h3>
              <p className="mt-2 mb-0 text-sm text-fg-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      </Band>
    </>
  );
}
