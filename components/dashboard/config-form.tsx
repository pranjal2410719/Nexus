"use client";

import type { ScheduleSlot } from "@/types/user";
import { MenuSelect, type MenuOption } from "@/components/ui/menu-select";

interface ConfigFormProps {
  repoVal: string;
  setRepoVal: (val: string) => void;
  repoOptions: MenuOption[];
  reposLoading: boolean;
  reposError: string;
  targetFile: string;
  setTargetFile: (val: string) => void;
  timezone: string;
  setTimezone: (val: string) => void;
  timezoneOptions: MenuOption[];
  slots: ScheduleSlot[];
  addSlot: () => void;
  removeSlot: (i: number) => void;
  setSlotTime: (i: number, time: string) => void;
  setSlotCount: (i: number, count: number) => void;
  slotLimitMsg: string;
  saveConfig: () => void;
  saveStatus: { text: string; kind: "" | "ok" | "err" };
}

export function ConfigForm({
  repoVal,
  setRepoVal,
  repoOptions,
  reposLoading,
  reposError,
  targetFile,
  setTargetFile,
  timezone,
  setTimezone,
  timezoneOptions,
  slots,
  addSlot,
  removeSlot,
  setSlotTime,
  setSlotCount,
  slotLimitMsg,
  saveConfig,
  saveStatus,
}: ConfigFormProps) {
  return (
    <div className="panel" id="configPanel">
      <h2>Target Repository</h2>
      <p className="panel-note">
        Nexus commits to a file inside <em>your</em> repository. Everything is
        isolated per user — no shared identities, no shared files.
      </p>

      <div className="field">
        <label htmlFor="repoSelect">Repository</label>
        <MenuSelect
          id="repoSelect"
          value={repoVal}
          onChange={setRepoVal}
          options={repoOptions}
          placeholder="Choose a repository…"
          menuLabel="Repository"
          loading={reposLoading}
          error={reposError || undefined}
        />
      </div>

      <div className="field">
        <label htmlFor="targetFile">Target File (in that repo)</label>
        <input
          type="text"
          id="targetFile"
          value={targetFile}
          placeholder="PROGRESS_LOG.md"
          onChange={(e) => setTargetFile(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="timezoneSelect">Timezone (your burst clock)</label>
        <MenuSelect
          id="timezoneSelect"
          value={timezone}
          onChange={setTimezone}
          options={timezoneOptions}
          placeholder="Select timezone…"
          menuLabel="Timezone"
        />
      </div>

      <div className="section-label" style={{ marginBottom: 16 }}>
        Schedule Slots (your daily bursts)
      </div>
      <div id="slotList">
        {slots.length === 0 && (
          <div className="matrix-empty" style={{ marginBottom: 12 }}>
            No slots yet — add your first burst below.
          </div>
        )}
        {slots.map((slot, i) => (
          <div className="slot-row" key={i}>
            <input
              type="time"
              className="slot-time"
              value={slot.time}
              aria-label="Slot time"
              onChange={(e) => setSlotTime(i, e.target.value)}
            />
            <fieldset className="slot-count-radio" aria-label="Commit count">
              <input
                type="radio"
                id={`slot-${i}-count-1`}
                name={`slot-count-${i}`}
                value={1}
                checked={slot.count === 1}
                onChange={() => setSlotCount(i, 1)}
              />
              <label htmlFor={`slot-${i}-count-1`}>1</label>
              <input
                type="radio"
                id={`slot-${i}-count-2`}
                name={`slot-count-${i}`}
                value={2}
                checked={slot.count === 2}
                onChange={() => setSlotCount(i, 2)}
              />
              <label htmlFor={`slot-${i}-count-2`}>2</label>
              <input
                type="radio"
                id={`slot-${i}-count-3`}
                name={`slot-count-${i}`}
                value={3}
                checked={slot.count === 3}
                onChange={() => setSlotCount(i, 3)}
              />
              <label htmlFor={`slot-${i}-count-3`}>3</label>
            </fieldset>
            <span className="slot-label">commits at this time</span>
            <button
              type="button"
              className="slot-remove"
              onClick={() => removeSlot(i)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      {slotLimitMsg ? (
        <div className="slot-limit-msg">{slotLimitMsg}</div>
      ) : (
        <button type="button" className="slot-add" onClick={addSlot}>
          + Add slot
        </button>
      )}

      <div style={{ marginTop: 24 }}>
        <button className="btn-save" onClick={saveConfig}>
          Save Configuration
        </button>
        <span
          className={
            "save-status" +
            (saveStatus.kind === "ok"
              ? " ok"
              : saveStatus.kind === "err"
                ? " err"
                : "")
          }
        >
          {saveStatus.text}
        </span>
      </div>
    </div>
  );
}
