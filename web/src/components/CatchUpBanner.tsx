import { useEffect, useState } from "react";
import { fetchCatchUp } from "../api";
import type { CatchUpSummary } from "../types/enterprise";

type CatchUpBannerProps = {
  conversationId: number;
  onDismiss: () => void;
};

export default function CatchUpBanner({ conversationId, onDismiss }: CatchUpBannerProps) {
  const [summary, setSummary] = useState<CatchUpSummary | null>(null);

  useEffect(() => {
    fetchCatchUp(conversationId).then(setSummary).catch(() => undefined);
  }, [conversationId]);

  if (!summary || summary.message_count === 0) return null;

  return (
    <div className="catchup-banner">
      <div>
        <strong>Catch-up summary</strong>
        <p>{summary.summary}</p>
        <p className="meta">{summary.message_count} messages since you were away</p>
      </div>
      <button type="button" className="btn ghost" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}
