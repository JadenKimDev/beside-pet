'use client';

/**
 * /sessions — 다시 온 사람의 첫 화면. 인사, 맨 위의 큰 카드(이어지는 대화, 없으면 새 대화), 지난 대화 목록.
 * 새 대화는 여정을 이어 간다: 서버가 프로필과 도달 단계를 이어받으므로 온보딩을 다시 하지 않는다.
 * 이어지는 대화가 있는데 새로 시작하면 그 대화를 먼저 마친다(확인창).
 *
 * 로그인 없이 연 경우와 서버가 세션을 거절한 경우의 첫 화면 이동은 레이아웃과 auth 의 처리기가 맡는다.
 * 상태: 불러오는 중(스켈레톤) / 실패(다시 불러오기, 온보딩으로 보내지 않는다: 대화가 있는 사람에게
 * 프로필을 다시 만들게 하지 않으려고) / 빈 목록(목록은 살아 있는 대화만 받으므로(ADR-0020) 보관함을 더 묻는다.
 * 보관함에 남아 있으면 머물러 빈 상태와 보관함 버튼을, 보관함도 비었으면 온보딩으로. 판정은 스토어의 homeView)
 * / 목록. 목록 바닥에 지운 대화 보관함 링크.
 *
 * 다른 화면에서 한 일의 알림은 주소의 `?notice=` 로 받아 토스트로 보이고 주소에서 지운다
 * (리포트 화면에서 리포트를 지우고 돌아온 경우).
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  buttonClass,
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
import { lastActiveLabel, monthDay, todayLabel } from '../list-dates';
import { homeView, useSessionArchiveStore } from '../session-archive.store';
import { HomeCard, HomeCardActions } from './HomeCard';
import { PastSessionItem } from './PastSessionItem';
import { SessionsSkeleton } from './SessionsSkeleton';

type Notice =
  | { kind: 'deleted' }
  | { kind: 'deleteFailed'; sessionId: string }
  | { kind: 'endFailed' }
  | { kind: 'reportDeleted' }
  | { kind: 'reportRestoreFailed'; sessionId: string };

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
  const loadTrash = useSessionArchiveStore((state) => state.loadTrash);
  const endSession = useSessionArchiveStore((state) => state.endSession);
  const removeSession = useSessionArchiveStore((state) => state.removeSession);
  const restoreReport = useSessionArchiveStore((state) => state.restoreReport);
  const items = useSessionArchiveStore((state) => state.items);
  const status = useSessionArchiveStore((state) => state.listStatus);
  const busy = useSessionArchiveStore((state) => state.busy);
  const view = useSessionArchiveStore(homeView);
  const listEmpty = status === 'ready' && items?.length === 0;
  const trashStatus = useSessionArchiveStore((state) => state.trashStatus);

  const [confirmingNew, setConfirmingNew] = useState(false);
  /** 지우려는 대화. 확인창이 열려 있는 동안 든다. */
  const [deleting, setDeleting] = useState<SessionListItem>();
  const [notice, setNotice] = useState<Notice>();

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // 리포트 화면에서 리포트를 지우고 온 경우. 새로 고쳐도 다시 뜨지 않게 주소에서 지운다.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('notice') !== 'reportDeleted') return;
    setNotice({ kind: 'reportDeleted' });
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }, []);

  // 인사에 부를 이름. 로그인 직후면 이미 있고, 새로 고친 뒤면 다시 묻는다.
  useEffect(() => {
    if (!principal && !authReady) void initAuth();
  }, [principal, authReady, initAuth]);

  // 목록이 비면 보관함을 묻는다. 둘 다 비었으면(처음 온 사람) 온보딩에서 시작한다.
  useEffect(() => {
    if (listEmpty && trashStatus === 'idle') void loadTrash();
  }, [listEmpty, trashStatus, loadTrash]);
  useEffect(() => {
    if (view === 'onboarding') router.replace('/onboarding');
  }, [view, router]);

  // 실패 화면의 다시 불러오기: 보관함에서 실패했으면 그것도 다시 묻는다.
  const reload = () => {
    if (trashStatus === 'failed') useSessionArchiveStore.setState({ trashStatus: 'idle' });
    void loadList();
  };

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

  // 되살린 리포트는 서버가 다시 쓰지 않고 같은 것을 준다(ADR-0008). 리포트 화면이 알림을 띄운다.
  const reviveReport = async (sessionId: string) => {
    try {
      await restoreReport(sessionId);
      router.push(`/sessions/${sessionId}/report?notice=reportRestored`);
    } catch {
      setNotice({ kind: 'reportRestoreFailed', sessionId });
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
  if (view === 'failed') {
    body = (
      <EmptyState
        icon={<Icon name="refresh" />}
        title={t.sessionList.failedTitle}
        description={t.sessionList.failedBody}
        action={
          <Button iconStart={<Icon name="refresh" />} onClick={reload}>
            {t.common.reload}
          </Button>
        }
      />
    );
  } else if (view === 'emptyWithTrash') {
    // 지운 대화는 앞으로 참고하지 않으므로 이을 여정이 없다: 새 대화는 온보딩에서 시작한다.
    body = (
      <EmptyState
        icon={<Icon name="trash" />}
        title={t.sessionList.emptyWithTrashTitle}
        description={t.sessionList.emptyWithTrashBody}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/sessions/trash" className={buttonClass({ variant: 'secondary' })}>
              <Icon name="trash" />
              {t.sessionList.emptyWithTrashCta}
            </Link>
            <Button iconStart={<Icon name="plus" />} onClick={() => router.push('/onboarding')}>
              {t.sessionList.noOpenCta}
            </Button>
          </div>
        }
      />
    );
  } else if (view !== 'list' || !items) {
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
                  onRestoreReport={() => void reviveReport(item.sessionId)}
                />
              ))}
            </ul>
          </section>
        )}

        <div className="mt-10 flex justify-center">
          <Link href="/sessions/trash" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
            <Icon name="trash" />
            {t.sessionList.trashLink}
          </Link>
        </div>
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
      {notice?.kind === 'reportDeleted' && (
        <Toast message={t.toast.reportDeleted} onDismiss={() => setNotice(undefined)} />
      )}
      {notice?.kind === 'reportRestoreFailed' && (
        <Toast
          tone="error"
          message={t.toast.reportRestoreFailed}
          retryLabel={t.common.retry}
          onRetry={() => {
            setNotice(undefined);
            void reviveReport(notice.sessionId);
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

/**
 * 이어지는 대화의 제목: "보리와의 3번째 걸음"과 지금 단계. 반려동물 이름이 없으면 단계만.
 * 그 아래 마지막으로 이야기한 시각. 메시지가 없는 대화는 서버가 시각을 주지 않아 그 줄을 뺀다.
 */
function CurrentHeading({ item }: { item: SessionListItem }) {
  const t = useTranslations();
  const { locale } = useLocale();
  const stage = t.taskLabels[item.reachedTask];
  const step = Math.max(journeyProgress(item.reachedTask).step, 1);
  return (
    <div>
      <h2 className="m-0 font-serif text-h1 font-bold">
        {item.petName ? t.sessionList.currentTitle(item.petName, step) : stage}
      </h2>
      {item.petName && <p className="m-0 mt-1.5 text-fg-muted">{stage}</p>}
      {item.lastMessageAt && (
        <p data-last-active className="m-0 mt-1 text-small text-fg-muted">
          {t.sessionList.lastActive(lastActiveLabel(item.lastMessageAt, new Date(), locale))}
        </p>
      )}
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
