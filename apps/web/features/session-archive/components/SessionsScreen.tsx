'use client';

/**
 * /sessions — 다시 온 사람의 첫 화면. 인사, 맨 위의 큰 카드(이어지는 대화, 없으면 새 대화), 지난 대화 목록.
 * 새 대화는 여정을 이어 간다: 서버가 프로필과 도달 단계를 이어받으므로 온보딩을 다시 하지 않는다.
 * 이어지는 대화가 있는데 새로 시작하면 그 대화를 먼저 마친다(확인창).
 *
 * 상태: 불러오는 중(스켈레톤) / 실패(다시 불러오기, 온보딩으로 보내지 않는다: 대화가 있는 사람에게
 * 프로필을 다시 만들게 하지 않으려고) / 빈 목록(온보딩으로. "처음 온 사람"과 "다 지운 사람"을 가를 값이
 * 서버에 생기기 전까지는 그대로 둔다) / 목록.
 */
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  Journey,
  journeyProgress,
  Modal,
  Toast,
} from '@/components/ui';
import { useAuthStore } from '@/features/auth/auth.store';
import { useSessionStore } from '@/features/session/session.store';
import { useLocale, useTranslations } from '@/i18n/I18nProvider';
import type { SessionListItem, TaskId } from '@/lib/api';
import { monthDay, todayLabel } from '../list-dates';
import { useSessionArchiveStore } from '../session-archive.store';
import { HomeCard, HomeCardActions } from './HomeCard';
import { PastSessionItem } from './PastSessionItem';
import { SessionsSkeleton } from './SessionsSkeleton';

type Notice =
  | { kind: 'deleted' }
  | { kind: 'deleteFailed'; sessionId: string }
  | { kind: 'endFailed' };

export function SessionsScreen() {
  const t = useTranslations();
  const { locale } = useLocale();
  const router = useRouter();

  const principal = useAuthStore((state) => state.principal);
  const authReady = useAuthStore((state) => state.ready);
  const initAuth = useAuthStore((state) => state.init);
  const resumeSession = useSessionStore((state) => state.resumeSession);
  const startSession = useSessionStore((state) => state.startSession);
  const loadList = useSessionArchiveStore((state) => state.loadList);
  const endSession = useSessionArchiveStore((state) => state.endSession);
  const removeSession = useSessionArchiveStore((state) => state.removeSession);
  const items = useSessionArchiveStore((state) => state.items);
  const status = useSessionArchiveStore((state) => state.listStatus);
  const busy = useSessionArchiveStore((state) => state.busy);

  const [confirmingNew, setConfirmingNew] = useState(false);
  /** 지우려는 대화. 확인창이 열려 있는 동안 든다. */
  const [deleting, setDeleting] = useState<SessionListItem>();
  const [notice, setNotice] = useState<Notice>();

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // 인사에 부를 이름. 로그인 직후면 이미 있고, 새로 고친 뒤면 다시 묻는다.
  useEffect(() => {
    if (!principal && !authReady) void initAuth();
  }, [principal, authReady, initAuth]);

  // 처음 온 사람은 온보딩에서 시작한다. 불러오기 실패는 여기서 실패 화면을 보인다.
  useEffect(() => {
    if (status === 'ready' && items?.length === 0) router.replace('/onboarding');
  }, [status, items, router]);

  const openSession = items?.find((item) => !item.closed);
  const past = items?.filter((item) => item !== openSession) ?? [];

  const startNew = () => {
    void startSession(); // 프로필 없이: 서버가 지난 대화에서 여정을 잇는다
    router.push('/session');
  };

  const onContinue = () => {
    if (!openSession) return;
    void resumeSession(openSession.sessionId, openSession.petName);
    router.push('/session');
  };

  const remove = async (sessionId: string) => {
    try {
      await removeSession(sessionId);
      setNotice({ kind: 'deleted' });
    } catch {
      setNotice({ kind: 'deleteFailed', sessionId });
    } finally {
      setDeleting(undefined);
    }
  };

  const onConfirmNew = async () => {
    if (!openSession) return;
    try {
      await endSession(openSession.sessionId);
      startNew();
    } catch {
      setConfirmingNew(false);
      setNotice({ kind: 'endFailed' });
    }
  };

  let body: ReactNode;
  if (status === 'failed') {
    body = (
      <EmptyState
        icon={<Icon name="refresh" />}
        title={t.sessionList.failedTitle}
        description={t.sessionList.failedBody}
        action={
          <Button iconStart={<Icon name="refresh" />} onClick={() => void loadList()}>
            {t.common.reload}
          </Button>
        }
      />
    );
  } else if (!items || items.length === 0) {
    body = <SessionsSkeleton label={t.sessionList.loading} />;
  } else {
    const furthest = items.reduce<TaskId>(
      (max, item) => Math.max(max, item.reachedTask) as TaskId,
      0,
    );
    const walked = journeyProgress(furthest).step;
    body = (
      <>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <span className="text-eyebrow font-semibold text-fg-muted uppercase">
              {todayLabel(new Date(), locale)}
            </span>
            <h1 className="m-0 mt-1.5 font-serif text-display-s font-bold">
              {principal ? t.sessionList.greeting(principal.username) : t.sessionList.title}
            </h1>
          </div>
          <p className="m-0 text-fg-muted">{t.sessionList.subtitle}</p>
        </div>

        {openSession ? (
          <HomeCard art="current">
            <div>
              <Badge tone="live">{t.sessionList.ongoing}</Badge>
            </div>
            <CurrentHeading item={openSession} />
            <StepJourney
              task={openSession.reachedTask}
              label={t.sessionList.stepOf(journeyProgress(openSession.reachedTask).step)}
            />
            <HomeCardActions>
              <Button iconEnd={<Icon name="arrow-right" />} onClick={onContinue}>
                {t.sessionList.continueButton}
              </Button>
              <Button
                variant="secondary"
                iconStart={<Icon name="plus" />}
                onClick={() => setConfirmingNew(true)}
              >
                {t.sessionList.newShort}
              </Button>
            </HomeCardActions>
          </HomeCard>
        ) : (
          <HomeCard art="noOpen">
            <div>
              <h2 className="m-0 font-serif text-h1 font-bold">{t.sessionList.noOpenTitle}</h2>
              <p className="m-0 mt-1.5 text-fg-muted">{t.sessionList.noOpenBody}</p>
            </div>
            {walked > 0 && <StepJourney task={furthest} label={t.sessionList.walked(walked)} />}
            <HomeCardActions>
              <Button iconStart={<Icon name="plus" />} onClick={startNew}>
                {t.sessionList.noOpenCta}
              </Button>
            </HomeCardActions>
          </HomeCard>
        )}

        {past.length > 0 && (
          <section aria-labelledby="past-sessions">
            <div className="mt-14 mb-4 flex items-baseline justify-between max-sm:mt-10">
              <h2 id="past-sessions" className="m-0 text-h3 font-semibold">
                {t.sessionList.pastTitle}
              </h2>
              <span className="text-small text-fg-muted">{t.sessionList.count(past.length)}</span>
            </div>
            <ul className="m-0 grid list-none gap-3 p-0">
              {past.map((item) => (
                <PastSessionItem
                  key={item.sessionId}
                  item={item}
                  onView={() => router.push(`/sessions/${item.sessionId}`)}
                  onDelete={() => setDeleting(item)}
                />
              ))}
            </ul>
          </section>
        )}
      </>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[880px] flex-1 px-6 pt-12 pb-20 max-sm:px-4 max-sm:pt-7 max-sm:pb-14">
      {body}

      <Modal
        open={deleting !== undefined}
        tone="danger"
        icon={<Icon name="trash" />}
        title={t.sessionList.confirmDeleteTitle}
        body={
          deleting && t.sessionList.confirmDeleteBodyDated(monthDay(deleting.startedAt, locale))
        }
        cancelLabel={t.sessionList.cancel}
        confirmLabel={t.sessionList.confirmDelete}
        busy={busy}
        onCancel={() => setDeleting(undefined)}
        onConfirm={() => deleting && void remove(deleting.sessionId)}
      />
      <Modal
        open={confirmingNew}
        icon={<Icon name="plus" />}
        title={t.sessionList.confirmNewTitle}
        body={t.sessionList.confirmNewBody}
        cancelLabel={t.sessionList.cancel}
        confirmLabel={t.sessionList.confirmNewStart}
        busy={busy}
        onCancel={() => setConfirmingNew(false)}
        onConfirm={() => void onConfirmNew()}
      />

      {notice?.kind === 'deleted' && (
        <Toast message={t.toast.deleted} onDismiss={() => setNotice(undefined)} />
      )}
      {notice?.kind === 'deleteFailed' && (
        <Toast
          tone="error"
          message={t.toast.deleteFailed}
          retryLabel={t.common.retry}
          onRetry={() => {
            setNotice(undefined);
            void remove(notice.sessionId);
          }}
          onDismiss={() => setNotice(undefined)}
        />
      )}
      {notice?.kind === 'endFailed' && (
        <Toast
          tone="error"
          message={t.toast.endFailed}
          retryLabel={t.common.retry}
          onRetry={() => {
            setNotice(undefined);
            setConfirmingNew(true);
          }}
          onDismiss={() => setNotice(undefined)}
        />
      )}
    </main>
  );
}

/** 이어지는 대화의 제목: "보리와의 3번째 걸음"과 지금 단계. 반려동물 이름이 없으면 단계만. */
function CurrentHeading({ item }: { item: SessionListItem }) {
  const t = useTranslations();
  const stage = t.taskLabels[item.reachedTask];
  const step = Math.max(journeyProgress(item.reachedTask).step, 1);
  return (
    <div>
      <h2 className="m-0 font-serif text-h1 font-bold">
        {item.petName ? t.sessionList.currentTitle(item.petName, step) : stage}
      </h2>
      {item.petName && <p className="m-0 mt-1.5 text-fg-muted">{stage}</p>}
    </div>
  );
}

/** 카드 안의 디딤돌: 왼쪽 글, 오른쪽 보조 퍼센트. */
function StepJourney({ task, label }: { task: TaskId; label: string }) {
  const t = useTranslations();
  return (
    <Journey
      task={task}
      label={label}
      meta={`${journeyProgress(task).percent}%`}
      valueText={`${label}, ${t.taskLabels[task]}`}
    />
  );
}
