"use client";

interface DispatchConsoleProps {
  manualLimitMsg: string;
  dispatch: {
    busy: boolean;
    btnText: string;
    status: string;
    sha: string;
    quote: string;
    commitUrl: string;
    show: boolean;
  };
  triggerCommit: () => void;
  sessionCount: number;
  todayCount: number;
}

export function DispatchConsole({
  manualLimitMsg,
  dispatch,
  triggerCommit,
  sessionCount,
  todayCount,
}: DispatchConsoleProps) {
  return (
    <div className="panel" id="dispatchPanel">
      <h2>Fire a Commit Right Now</h2>
      <p className="panel-note">
        Creates one real commit in your connected repository immediately (no
        schedule needed).
      </p>
      {manualLimitMsg ? (
        <div className="slot-limit-msg">{manualLimitMsg}</div>
      ) : (
        <button
          id="commitBtn"
          className="primary-cta"
          onClick={triggerCommit}
          disabled={dispatch.busy}
        >
          <span>→</span>
          <span>{dispatch.btnText}</span>
        </button>
      )}
      <div className="reassurance-caption">
        Session: {sessionCount} · Manual Today:{" "}
        <span id="totalManual">{todayCount}</span>
      </div>
      <div
        id="consoleContainer"
        className={"console-container" + (dispatch.show ? " active" : "")}
      >
        <div className="console-top">
          <span id="consoleStatus">{dispatch.status}</span>
          <span id="consoleSha">{dispatch.sha}</span>
        </div>
        <div id="consoleBody" className="console-quote">
          {dispatch.quote ? `"${dispatch.quote}"` : ""}
          {dispatch.commitUrl && (
            <>
              <br />
              <a
                href={dispatch.commitUrl}
                target="_blank"
                rel="noreferrer"
                className="console-link"
              >
                View Commit on GitHub ↗
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
