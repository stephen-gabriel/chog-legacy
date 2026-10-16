import { useNavigate } from 'react-router-dom';
import * as C from '@/ui/components';
import s from '@/ui/ui.module.css';
import type { Handlers } from '@/ui/types';
import { useAuth } from '@/auth/AuthContext';
import { sessionHandlers } from '@/auth/sessionHandlers';

export function EntryPage() {
  const nav = useNavigate();
  const auth = useAuth();

  const h: Handlers = {
    ...sessionHandlers(auth),
    onLookup: id => nav(`/chog/${encodeURIComponent(id)}`),
    onStartPractice: () => nav('/practice'),
    onRefreshOwner: () => auth.clearNotice(),
    onActivate: () => undefined,
    onIntention: () => undefined,
    onSubmitChoice: () => undefined,
    onPage: () => undefined,
    onFilter: () => undefined,
    onPracticeReset: () => undefined,
    onPracticeHandoff: () => undefined,
    onLeavePractice: () => nav('/'),
  };

  return (
    <>
      <section className={s.page} style={{ paddingBottom: 0 }}>
        <C.SessionBar v={auth.viewer} h={h} address={auth.address ?? auth.session?.wallet ?? undefined} note={auth.notice} />
      </section>
      <C.Entry h={h} notice={undefined} />
    </>
  );
}
