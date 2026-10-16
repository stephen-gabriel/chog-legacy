import { useNavigate } from "react-router-dom";
import * as C from "@/ui/components";
import type { Handlers } from "@/ui/types";
import { useAuth } from "@/auth/AuthContext";
import { sessionHandlers } from "@/auth/sessionHandlers";

export function EntryPage() {
  const nav = useNavigate();
  const auth = useAuth();

  const h: Handlers = {
    ...sessionHandlers(auth),
    onLookup: (id) => nav(`/chog/${encodeURIComponent(id)}`),
    onStartPractice: () => nav("/practice"),
    onRefreshOwner: () => auth.clearNotice(),
    onActivate: () => undefined,
    onIntention: () => undefined,
    onSubmitChoice: () => undefined,
    onPage: () => undefined,
    onFilter: () => undefined,
    onPracticeReset: () => undefined,
    onPracticeHandoff: () => undefined,
    onLeavePractice: () => nav("/"),
  };

  return <C.Entry h={h} />;
}
