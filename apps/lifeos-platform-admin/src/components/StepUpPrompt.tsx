import { useEffect, useState } from "react";
import { STEP_UP_EVENT, cancelStepUp, type StepUpState } from "../lib/api";

/** Shown while a write waits for approval on the admin's Master Device (TrustID app). */
export function StepUpPrompt() {
  const [state, setState] = useState<StepUpState | null>(null);

  useEffect(() => {
    const onStepUp = (event: Event) => {
      const detail = (event as CustomEvent<StepUpState>).detail;
      setState(detail.status === "pending" ? detail : null);
    };
    window.addEventListener(STEP_UP_EVENT, onStepUp);
    return () => window.removeEventListener(STEP_UP_EVENT, onStepUp);
  }, []);

  if (!state || state.status !== "pending") return null;
  return (
    <div className="card" role="status" aria-live="polite" style={{ marginBottom: "1.25rem" }}>
      <p className="eyebrow">Approval needed</p>
      <p className="muted small">
        Open TrustID on your Master Device and approve <span className="mono">{state.action}</span>. This
        page continues automatically once you approve.
      </p>
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={() => void cancelStepUp(state.challengeId).catch(() => undefined)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
