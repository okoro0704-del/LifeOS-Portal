import { useState } from "react";
import { setStepUp, stepUpEnabled } from "../lib/api";

export function StepUpBar() {
  const [biometric, setBiometric] = useState(() => stepUpEnabled("biometric"));
  const [master, setMaster] = useState(() => stepUpEnabled("master"));

  return (
    <div className="card" style={{ marginBottom: "1.25rem" }}>
      <p className="eyebrow">Trust ID step-up</p>
      <p className="muted small">
        Analytics require 1:N biometric validation. Key revoke, tombstones, and disbursements require
        the bound Master Device.
      </p>
      <div className="actions">
        <button
          className={biometric ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => {
            const next = !biometric;
            setStepUp("biometric", next);
            setBiometric(next);
          }}
        >
          {biometric ? "Biometric verified" : "Validate biometric identity"}
        </button>
        <button
          className={master ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => {
            const next = !master;
            if (next) {
              setStepUp("biometric", true);
              setBiometric(true);
            }
            setStepUp("master", next);
            setMaster(next);
          }}
        >
          {master ? "Master Device bound" : "Bind Master Device"}
        </button>
      </div>
    </div>
  );
}
