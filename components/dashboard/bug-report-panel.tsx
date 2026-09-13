"use client";

export { BugReportModal, openBugReportModal, BUG_REPORT_EVENT } from "./bug-report-modal";
export type { BugReportModalProps } from "./bug-report-modal";

import { BugReportModal } from "./bug-report-modal";

export interface BugReportPanelProps {
  initialOpen?: boolean;
  recipientEmail?: string;
  storageKey?: string;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Backward compatibility wrapper: renders BugReportModal.
 * The floating sticky slide-out drawer has been removed in favor of the clean modal triggered by buttons.
 */
export function BugReportPanel({
  initialOpen,
  recipientEmail,
  onOpenChange,
}: BugReportPanelProps = {}) {
  return (
    <BugReportModal
      isOpen={initialOpen}
      recipientEmail={recipientEmail}
      onClose={() => onOpenChange?.(false)}
    />
  );
}
